/**
 * 실행 엔진 테스트 — API 를 부르지 않는 작업 단위로 상태 전이·결과 보존·취소·중단·정리 훅을 확인한다.
 * 가짜 키를 둔 임시 앱 데이터 폴더를 쓴다 (실제 API 호출 없음).
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ApiError } from '../../src/types/errors'

import { CancelledError, startJob, summarizePlan, type WorkUnit } from '../src/engine'

const dataDir = mkdtempSync(join(tmpdir(), 'gp-eng-data-'))
writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ openrouter_api_key: 'sk-test-not-real' }))

// 단위 실행은 startJob 안에서 바로 시작되므로, 단위 안에서는 job 대신 이 폴더에 쓴다
const outDir = mkdtempSync(join(tmpdir(), 'gp-eng-files-'))

const unit = (label: string, run: WorkUnit['run'], requests = 1): WorkUnit => ({ label, requests, costKind: 'test', run })

const start = (units: WorkUnit[], extra: { concurrency?: number; finalize?: Parameters<typeof startJob>[1]['finalize'] } = {}) =>
  startJob(dataDir, {
    kind: 'TEST',
    model: 'test-model',
    units,
    destDir: mkdtempSync(join(tmpdir(), 'gp-eng-dest-')),
    concurrency: extra.concurrency ?? 2,
    meta: {},
    finalize: extra.finalize,
  })

describe('실행 엔진', () => {
  test('단위가 중간에 실패해도 앞서 저장한 파일은 결과·매니페스트에 남는다', async () => {
    const job = start([
      unit('chain', async (ctx) => {
        ctx.save(outDir, 'step01', 'md', '# 1단계')
        throw new Error('2단계에서 실패')
      }),
    ])
    await job.done
    expect(job.status).toBe('failed')
    expect(job.files.length).toBe(1)
    expect(job.units[0].error).toContain('앞서 저장한 파일 1개 보존')
    const manifest = JSON.parse(readFileSync(job.manifestPath, 'utf-8'))
    expect(manifest.units[0].files.length).toBe(1)
  })

  test('취소되면 다음 요청(hooks)을 받기 전에 멈추고 단위는 skipped', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const job = start(
      [
        unit('sections', async (ctx) => {
          ctx.hooks()
          ctx.save(outDir, 'section1', 'md', 'x')
          await gate
          ctx.hooks() // 취소 뒤 다음 섹션 — 여기서 멈춰야 한다
          throw new Error('도달하면 안 된다')
        }, 2),
        unit('waiting', async () => ({ ran: true })),
      ],
      { concurrency: 1 }
    )
    job.cancelRequested = true
    release()
    await job.done
    expect(job.units[0].status).toBe('skipped')
    expect(job.units[0].requests_made).toBe(1)
    expect(job.units[0].error).toContain('파일 1개 보존')
    expect(job.units[1].status).toBe('skipped')
    expect(job.status).toBe('cancelled')
  })

  test('401·402 는 나머지 단위를 중단한다', async () => {
    const job = start(
      [
        unit('a', async () => {
          throw new ApiError('OpenRouter API HTTP 402', 402, '')
        }),
        unit('b', async () => ({ ok: true })),
      ],
      { concurrency: 1 }
    )
    await job.done
    expect(job.status).toBe('failed')
    expect(job.abortReason).toBeTruthy()
    expect(job.units[1].status).toBe('skipped')
  })

  test('usage 비용을 단위·작업에 집계한다', async () => {
    const job = start([
      unit('a', async (ctx) => {
        ctx.hooks().onUsage!({ cost: 0.01 })
        ctx.hooks().onUsage!({ cost: 0.002, is_byok: true, cost_details: { upstream_inference_cost: 0.003 } })
        return { done: true }
      }, 2),
    ])
    await job.done
    expect(job.status).toBe('done')
    expect(job.units[0].requests_made).toBe(2)
    expect(job.costUsd).toBeCloseTo(0.015, 6)
    expect(job.units[0].result).toEqual({ done: true })
  })

  test('정리 훅은 모든 단위가 끝난 뒤 결과를 모아 파일로 남긴다', async () => {
    const job = start(
      [unit('a', async () => ({ v: 1 })), unit('b', async () => ({ v: 2 }))],
      {
        finalize: ({ records, save }) => {
          save(job.destDir, 'all', 'json', JSON.stringify(records.map((r) => r.result)))
        },
      }
    )
    await job.done
    const file = job.files.find((f) => f.endsWith('all.json'))!
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual([{ v: 1 }, { v: 2 }])
  })

  test('CancelledError 는 실패로 세지 않는다', async () => {
    const job = start([
      unit('a', async () => {
        throw new CancelledError()
      }),
    ])
    await job.done
    expect(job.failed).toBe(0)
    expect(job.units[0].status).toBe('skipped')
  })

  test('견적: 요청 수 합계, 실측 기록이 없으면 금액 없음', () => {
    const summary = summarizePlan('never-recorded-model', [unit('a', async () => null, 9), unit('b', async () => null, 1)])
    expect(summary.requests).toBe(10)
    expect(summary.estimatedCostUsd).toBeUndefined()
  })
})
