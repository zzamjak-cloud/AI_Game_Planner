/**
 * 실측 비용 기록 — 텍스트 생성 비용은 출력 길이·추론 토큰·웹 검색에 따라 달라 요청 전에는 알 수 없다.
 * 응답의 `usage.cost` 를 (작업 종류·모델) 단위로 모아 작업 단위(문서·아이디어)당 평균을 내고 dry run 견적에 쓴다.
 * 파일은 MCP 상태 폴더(`stateDir()/cost-history.json`)에만 둔다 — 앱 데이터와 무관하다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { stateDir } from './env'

interface CostEntry {
  /** 누적 작업 단위 수 */
  units: number
  /** 누적 비용 (USD) */
  usd: number
}

type CostHistory = Record<string, CostEntry>

const FILE = () => join(stateDir(), 'cost-history.json')

export function costKey(kind: string, model: string): string {
  return `${kind}|${model}`
}

function load(): CostHistory {
  try {
    return existsSync(FILE()) ? (JSON.parse(readFileSync(FILE(), 'utf-8')) as CostHistory) : {}
  } catch {
    return {}
  }
}

/**
 * 응답 usage 에서 실제 USD 비용을 꺼낸다 (필드가 없으면 undefined).
 * BYOK(사용자 자체 제공사 키) 계정은 OpenRouter 수수료만 `cost` 에 담기고 실제 제공사 비용은
 * `cost_details.upstream_inference_cost` 에 온다 — 둘을 더해 사용자가 실제로 내는 금액으로 본다.
 */
export function extractCost(usage: Record<string, unknown> | undefined): number | undefined {
  if (!usage) return undefined
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const fee = num(usage.cost)
  const details = usage.cost_details as Record<string, unknown> | undefined
  const upstream = usage.is_byok === true ? num(details?.upstream_inference_cost) : undefined
  if (fee === undefined && upstream === undefined) return undefined
  return (fee ?? 0) + (upstream ?? 0)
}

/** 작업 단위 하나가 끝났을 때 그 단위의 총비용을 기록한다 */
export function recordCost(key: string, usd: number): void {
  if (!(usd >= 0)) return
  try {
    const history = load()
    const entry = history[key] ?? { units: 0, usd: 0 }
    entry.units += 1
    entry.usd += usd
    history[key] = entry
    mkdirSync(stateDir(), { recursive: true })
    writeFileSync(FILE(), JSON.stringify(history, null, 2))
  } catch {
    // 기록 실패는 생성에 영향 없음
  }
}

/** 작업 단위 1개 평균 비용 (기록이 없으면 undefined) */
export function averageCostPerUnit(key: string): number | undefined {
  const entry = load()[key]
  return entry && entry.units > 0 ? entry.usd / entry.units : undefined
}

export function allAverages(): Record<string, { per_unit_usd: number; samples: number }> {
  const out: Record<string, { per_unit_usd: number; samples: number }> = {}
  for (const [key, entry] of Object.entries(load())) {
    if (entry.units > 0) out[key] = { per_unit_usd: Number((entry.usd / entry.units).toFixed(5)), samples: entry.units }
  }
  return out
}
