/**
 * 도구 공통 실행 흐름: 계획 요약 → (dry run 이면 여기서 끝) → 안전 상한 → 작업 시작 → 대기.
 * 모든 생성 도구가 같은 응답 형식·같은 안전장치를 갖도록 한 곳에 둔다.
 */

import { jobSummary, startJob, summarizePlan, waitForJob, type StartOptions, type WorkUnit } from './engine'
import { PLAN_HARD_LIMIT, type RunInput } from './toolkit'

/** 요청 수 기본 상한 */
export const DEFAULT_MAX_REQUESTS = 300

export interface PlanToRun extends RunInput {
  kind: string
  model: string
  units: WorkUnit[]
  destDir: string
  /** 동시 실행 기본값 (도구별) */
  defaultConcurrency: number
  /** 매니페스트·dry run 응답에 함께 보일 정보 */
  meta: Record<string, unknown>
  /** dry run 에 보일 단위별 구성 */
  breakdown: unknown[]
  /** 모든 단위가 끝난 뒤 한 번 (engine.StartOptions.finalize) */
  finalize?: StartOptions['finalize']
}

export async function runPlan(dataDir: string, plan: PlanToRun) {
  if (plan.units.length === 0) throw new Error('만들 작업이 없습니다.')
  if (plan.units.length > PLAN_HARD_LIMIT) {
    throw new Error(`작업 단위가 너무 많습니다 (${plan.units.length} > ${PLAN_HARD_LIMIT}). 나눠서 호출하세요.`)
  }
  const summary = summarizePlan(plan.model, plan.units)
  const violations: string[] = []
  const maxRequests = plan.max_requests ?? DEFAULT_MAX_REQUESTS
  // 이어쓰기·형식 재시도까지 포함한 최악값으로 판정한다 (실제 요청이 상한을 넘지 않게)
  if (summary.maxRequests > maxRequests) {
    violations.push(`최대 요청 ${summary.maxRequests}회(예상 ${summary.requests}회, 이어쓰기·재시도 포함) > max_requests ${maxRequests}`)
  }
  if (plan.max_cost_usd !== undefined && summary.estimatedCostUsd !== undefined && summary.estimatedCostUsd > plan.max_cost_usd) {
    violations.push(`견적 $${summary.estimatedCostUsd} > max_cost_usd $${plan.max_cost_usd}`)
  }

  const head = {
    kind: plan.kind,
    model: plan.model,
    ...plan.meta,
    units: summary.units,
    estimated_requests: summary.requests,
    max_requests_possible: summary.maxRequests,
    estimated_cost_usd: summary.estimatedCostUsd ?? null,
    cost_basis: summary.costBasis,
    dest_dir: plan.destDir,
  }

  if (plan.dry_run) {
    return {
      dry_run: true,
      ...head,
      breakdown: plan.breakdown,
      note:
        violations.length > 0
          ? `이대로는 실행되지 않는다 (${violations.join(', ')}). 의도한 규모면 상한을 올려라.`
          : '실행하려면 dry_run 을 빼고 다시 호출한다.',
    }
  }
  if (violations.length > 0) {
    throw new Error(`안전 상한을 넘어 실행하지 않았습니다: ${violations.join(', ')}. 의도한 규모면 해당 상한을 올려 다시 호출하세요.`)
  }

  const job = startJob(dataDir, {
    kind: plan.kind,
    model: plan.model,
    units: plan.units,
    destDir: plan.destDir,
    concurrency: Math.min(8, Math.max(1, Math.floor(plan.concurrency ?? plan.defaultConcurrency))),
    meta: plan.meta,
    finalize: plan.finalize,
  })
  await waitForJob(job, (plan.wait_seconds ?? 40) * 1000)
  return {
    ...jobSummary(job),
    plan: { units: summary.units, estimated_requests: summary.requests },
    next: job.status === 'running' ? `진행 중 — gp_job_status(job_id="${job.id}") 로 다시 조회하세요.` : undefined,
  }
}
