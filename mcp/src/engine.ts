/**
 * 작업 실행 엔진 — 모든 생성 도구가 공유한다.
 *
 * 도구는 "작업 단위(WorkUnit)" 목록만 만든다(기획서 1건·분석 1건·수정 체인 1개·아이디어 1개).
 * 엔진이 동시 실행 풀 → 요청 타임아웃 → 비용 집계 → 결과 파일 기록 → 매니페스트를 처리한다.
 *
 * 문서 생성은 수 분 걸려 MCP 클라이언트 타임아웃(Codex 기본 60초)에 걸리므로 백그라운드로 돌리고
 * `gp_job_status` 로 조회하게 한다. → docs/mcp.md
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { ApiError } from '../../src/types/errors'
import { handleError } from '../../src/lib/errorHandler'
import type { RequestHooks } from '../../src/lib/services/openRouterService'

import { getApiKey, writeUnique } from './env'
import { averageCostPerUnit, costKey, extractCost, recordCost } from './costlog'

/** 요청 1건의 최대 대기 — 연결이 멈추면 worker 가 영구히 묶이지 않도록 (긴 섹션·웹 검색 분석 포함) */
export const REQUEST_TIMEOUT_MS = 20 * 60_000

export interface UnitContext {
  apiKey: string
  record: UnitRecord
  /** API 요청마다 새로 받는다 — 타임아웃 신호 + usage 집계. 받을 때 취소 여부를 먼저 확인한다 */
  hooks: () => RequestHooks
  /** 취소·중단이면 CancelledError 를 던진다 (섹션·단계 사이에서 부른다) */
  checkStop: () => void
  /** 결과 파일을 새 이름으로 쓰고 즉시 결과·매니페스트에 반영한다 → 경로 */
  save: (dir: string, base: string, ext: string, data: string) => string
  /** 실패는 아니지만 알릴 것 (잘림 등) */
  warn: (message: string) => void
}

export interface WorkUnit {
  label: string
  /** 예상 API 요청 수 (견적용, 섹션 분할이면 섹션 수) */
  requests: number
  /** 최악의 요청 수 (자동 이어쓰기·형식 재시도 포함 — 안전 상한 판정용, 기본 requests × 3) */
  maxRequests?: number
  /** 비용 기록 종류 (plan · analysis · revise · idea) */
  costKind: string
  /** 실행 — 돌려준 값은 작업 결과(results)에 들어간다 (응답에 그대로 보이므로 작게) */
  run: (ctx: UnitContext) => Promise<unknown>
}

export interface UnitRecord {
  index: number
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  requests_made: number
  cost_usd?: number
  usage?: Record<string, unknown>[]
  duration_ms?: number
  files: string[]
  warnings: string[]
  result?: unknown
  error?: string
}

export interface Job {
  id: string
  kind: string
  model: string
  status: 'running' | 'done' | 'failed' | 'cancelled'
  destDir: string
  manifestPath: string
  startedAt: string
  finishedAt?: string
  total: number
  completed: number
  failed: number
  costUsd: number
  costKnown: boolean
  files: string[]
  errors: string[]
  units: UnitRecord[]
  abortReason?: string
  cancelRequested: boolean
  done: Promise<void>
}

const jobs = new Map<string, Job>()

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function listJobs(): Job[] {
  return [...jobs.values()]
}

/** 취소·중단으로 보내지 않은 요청 */
export class CancelledError extends Error {
  constructor() {
    super('취소되어 남은 요청은 보내지 않았습니다')
  }
}

// ───────────────────────── 계획 요약 ─────────────────────────

export interface PlanSummary {
  units: number
  requests: number
  maxRequests: number
  estimatedCostUsd?: number
  costBasis: string
}

/** 단위 목록 → 단위 수·요청 수·견적 (실측 평균 기반) */
export function summarizePlan(model: string, units: WorkUnit[]): PlanSummary {
  let estimate = 0
  let known = 0
  for (const u of units) {
    const avg = averageCostPerUnit(costKey(u.costKind, model))
    if (avg !== undefined) {
      estimate += avg
      known++
    }
  }
  return {
    units: units.length,
    requests: units.reduce((s, u) => s + u.requests, 0),
    maxRequests: units.reduce((s, u) => s + (u.maxRequests ?? u.requests * 3), 0),
    estimatedCostUsd: known > 0 ? Number(estimate.toFixed(4)) : undefined,
    costBasis:
      known === units.length
        ? '이전 실행의 실측 평균 기준'
        : known > 0
          ? `일부(${known}/${units.length}건)만 실측 기록이 있어 나머지는 제외한 값`
          : '실측 기록 없음 — 한 번 실행하면 다음부터 견적이 나온다',
  }
}

// ───────────────────────── 실행 ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function writeManifest(job: Job, meta: Record<string, unknown>): void {
  try {
    mkdirSync(job.destDir, { recursive: true })
    writeFileSync(
      job.manifestPath,
      JSON.stringify(
        {
          job_id: job.id,
          kind: job.kind,
          model: job.model,
          status: job.status,
          ...meta,
          started_at: job.startedAt,
          finished_at: job.finishedAt,
          cost_usd: job.costKnown ? Number(job.costUsd.toFixed(4)) : null,
          units: job.units,
        },
        null,
        2
      )
    )
  } catch {
    // 매니페스트 실패는 결과 파일에 영향 없음
  }
}

export interface StartOptions {
  kind: string
  model: string
  units: WorkUnit[]
  destDir: string
  concurrency: number
  /** 매니페스트에 함께 남길 정보 */
  meta: Record<string, unknown>
  /**
   * 모든 단위가 끝난 뒤(취소·실패 포함) 한 번 — 단위 결과를 모아 쓰는 파일(아이디어 목록 등)을 만든다.
   * 실패해도 작업 상태는 바꾸지 않고 오류만 남긴다.
   */
  finalize?: (done: { records: UnitRecord[]; save: (dir: string, base: string, ext: string, data: string) => string }) => void
}

export function startJob(dataDir: string, opts: StartOptions): Job {
  const apiKey = getApiKey(dataDir)
  const id = randomUUID().slice(0, 8)
  const records: UnitRecord[] = opts.units.map((u, index) => ({
    index,
    label: u.label,
    status: 'pending',
    requests_made: 0,
    files: [],
    warnings: [],
  }))
  const job: Job = {
    id,
    kind: opts.kind,
    model: opts.model,
    status: 'running',
    destDir: opts.destDir,
    manifestPath: join(opts.destDir, `manifest-${id}.json`),
    startedAt: new Date().toISOString(),
    total: opts.units.length,
    completed: 0,
    failed: 0,
    costUsd: 0,
    costKnown: false,
    files: [],
    errors: [],
    units: records,
    cancelRequested: false,
    done: Promise.resolve(),
  }
  jobs.set(id, job)
  const shouldStop = () => job.cancelRequested || !!job.abortReason
  const checkStop = () => {
    if (shouldStop()) throw new CancelledError()
  }

  const runUnit = async (unit: WorkUnit, record: UnitRecord) => {
    const ctx: UnitContext = {
      apiKey,
      record,
      checkStop,
      hooks: () => {
        // 매 요청 직전에 취소를 확인한다 — 섹션·수정 단계 사이에서도 멈춘다
        checkStop()
        record.requests_made++
        return {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          onUsage: (usage) => {
            // 과금은 이미 일어났다 — 저장보다 먼저 집계한다
            ;(record.usage ??= []).push(usage)
            const cost = extractCost(usage)
            if (cost !== undefined) {
              record.cost_usd = (record.cost_usd ?? 0) + cost
              job.costUsd += cost
              job.costKnown = true
            }
          },
        }
      },
      save: (dir, base, ext, data) => {
        const path = writeUnique(dir, base, ext, data)
        record.files.push(path)
        job.files.push(path)
        return path
      },
      warn: (message) => {
        record.warnings.push(message)
        job.errors.push(`[${unit.label}] ${message}`)
      },
    }
    record.result = await unit.run(ctx)
  }

  job.done = (async () => {
    let cursor = 0
    const worker = async () => {
      while (cursor < opts.units.length) {
        const index = cursor++
        const unit = opts.units[index]
        const record = records[index]
        if (shouldStop()) {
          record.status = 'skipped'
          continue
        }
        record.status = 'running'
        const started = Date.now()
        try {
          await runUnit(unit, record)
          record.status = 'done'
          job.completed++
          if (record.cost_usd !== undefined) recordCost(costKey(unit.costKind, opts.model), record.cost_usd)
        } catch (error) {
          if (error instanceof CancelledError) {
            // 단위 중간(섹션·단계 사이)에서 멈췄다 — 그때까지 저장된 파일은 record.files 에 남아 있다
            record.status = 'skipped'
            record.error = record.files.length > 0 ? `취소로 중단 (앞서 저장한 파일 ${record.files.length}개 보존)` : error.message
            continue
          }
          const friendly = error instanceof ApiError ? handleError(error).userMessage : (error as Error).message
          record.status = 'failed'
          record.error = record.files.length > 0 ? `${friendly} (앞서 저장한 파일 ${record.files.length}개 보존)` : friendly
          job.failed++
          job.errors.push(`[${unit.label} #${index + 1}] ${friendly}`)
          // 키·크레딧 문제는 나머지 요청도 똑같이 실패하므로 즉시 중단한다
          if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 402)) {
            job.abortReason = friendly
          }
        } finally {
          record.duration_ms = Date.now() - started
          writeManifest(job, opts.meta)
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(opts.concurrency, opts.units.length) }, worker))
      if (opts.finalize) {
        try {
          opts.finalize({
            records,
            save: (dir, base, ext, data) => {
              const path = writeUnique(dir, base, ext, data)
              job.files.push(path)
              return path
            },
          })
        } catch (error) {
          job.errors.push(`결과 정리 실패: ${(error as Error).message}`)
        }
      }
      // 실제로 건너뛴 단위가 있을 때만 취소로 본다 (모두 보낸 뒤 늦게 온 취소는 무시)
      const skipped = records.some((r) => r.status === 'skipped')
      job.status = job.abortReason
        ? 'failed'
        : job.cancelRequested && skipped
          ? 'cancelled'
          : job.completed === 0
            ? 'failed'
            : 'done'
    } catch (error) {
      job.status = 'failed'
      job.errors.push((error as Error).message)
    } finally {
      job.finishedAt = new Date().toISOString()
      writeManifest(job, opts.meta)
    }
  })()

  return job
}

/** 작업 요약 (도구 응답용) — 단위별 결과(result)는 작게, 상세는 매니페스트에 둔다 */
export function jobSummary(job: Job, maxFiles = 200) {
  return {
    job_id: job.id,
    kind: job.kind,
    model: job.model,
    status: job.status,
    progress: `${job.completed + job.failed}/${job.total} 작업 단위 (성공 ${job.completed}, 실패 ${job.failed})`,
    dest_dir: job.destDir,
    manifest: job.manifestPath,
    cost_usd: job.costKnown ? Number(job.costUsd.toFixed(4)) : null,
    file_count: job.files.length,
    files: job.files.slice(0, maxFiles),
    files_truncated: job.files.length > maxFiles,
    results: job.units
      .filter((u) => u.status === 'done' || u.status === 'failed' || u.files.length > 0)
      .map((u) => ({ label: u.label, status: u.status, ...(u.result && typeof u.result === 'object' ? u.result : {}), error: u.error })),
    errors: job.errors,
    abort_reason: job.abortReason ?? null,
    started_at: job.startedAt,
    finished_at: job.finishedAt ?? null,
  }
}

/** 작업이 끝나거나 waitMs 가 지날 때까지 기다린다 */
export async function waitForJob(job: Job, waitMs: number): Promise<void> {
  if (waitMs <= 0) return
  await Promise.race([job.done, sleep(waitMs)])
}
