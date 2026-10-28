/**
 * 도구 등록 공통 — 응답 형식, 오류 처리, 여러 도구가 함께 쓰는 입력 스키마·검증.
 * 도구 모듈은 `register…Tools(server, ctx)` 를 내보내고 index.ts 가 호출한다.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolve } from 'node:path'
import { z } from 'zod'

import { SELECTABLE_MODELS, type ChatModel } from '../../src/lib/constants/api'

import { assertWritable, defaultDestDir, getAppChatModel } from './env'

export interface ToolContext {
  dataDir: string
}

export type RegisterTools = (server: McpServer, ctx: ToolContext) => void

/** 도구 응답: 사람이 읽기 쉬운 JSON 텍스트 */
export function ok(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export function fail(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: (error as Error)?.message ?? String(error) }] }
}

export async function guarded<T>(fn: () => Promise<T> | T) {
  try {
    return ok(await fn())
  } catch (error) {
    return fail(error)
  }
}

// ───────────────────────── 공용 스키마 ─────────────────────────

export const templateSchema = z
  .object({
    id: z.string().optional().describe('앱 템플릿 id (gp_list_templates)'),
    path: z.string().optional().describe('템플릿 파일 (.prompt — 앱 내보내기 JSON / .md·.txt — 본문 그대로)'),
    content: z.string().optional().describe('템플릿 본문 직접 지정'),
  })
  .optional()
  .describe('생략하면 앱에서 현재 선택된 템플릿')

export const documentsSchema = z
  .array(
    z.object({
      name: z.string().optional(),
      content: z.string().optional().describe('본문 직접 지정'),
      path: z.string().optional().describe('pdf·xlsx·xls·csv·md·txt·json 파일'),
      url: z.string().optional().describe('웹페이지 또는 구글 스프레드시트 URL'),
    })
  )
  .max(20)
  .optional()

/** 실행 제어 — 모든 생성 도구 공통 (모델·출력 폴더·동시성·안전 상한·dry run·대기) */
export const runSchema = {
  model: z.string().optional().describe('본문 모델 (gp_models 참고, 기본은 앱 설정의 모델)'),
  dest_dir: z.string().optional().describe('출력 폴더 (절대 경로, 기본 ~/Downloads/GamePlanner/MCP/<종류>_<시각>)'),
  concurrency: z.number().int().min(1).max(8).optional().describe('동시 실행 수 (기본: 문서 3, 아이디어 6)'),
  max_requests: z.number().int().positive().optional().describe('최대 API 요청 수 안전 상한 — 자동 이어쓰기·형식 재시도까지 포함한 최악값으로 판정 (기본 300)'),
  max_cost_usd: z.number().positive().optional().describe('견적이 이 금액을 넘으면 실행하지 않는다 (실측 기록이 있을 때만 판정)'),
  dry_run: z.boolean().optional().describe('true 면 API 를 호출하지 않고 요청 수·견적·구성만 돌려준다'),
  wait_seconds: z.number().min(0).max(600).optional().describe('응답 전 기다릴 시간 (기본 40초 — Codex 기본 타임아웃 60초 이내)'),
  save_to_app: z.boolean().optional().describe('true 면 결과를 앱 수신함으로 보내 앱 세션·히스토리에 추가한다 (기본 false)'),
}

export interface RunInput {
  model?: string
  dest_dir?: string
  concurrency?: number
  max_requests?: number
  max_cost_usd?: number
  dry_run?: boolean
  wait_seconds?: number
  save_to_app?: boolean
}

// ───────────────────────── 공용 검증 ─────────────────────────

/** 모델 검증 — 앱에서 고를 수 있는 모델만 받는다 (모르는 값을 조용히 기본값으로 바꾸지 않는다) */
export function resolveModel(dataDir: string, model: string | undefined): ChatModel {
  if (!model) return getAppChatModel(dataDir)
  const found = SELECTABLE_MODELS.find((m) => m.value === model || m.label.toLowerCase() === model.toLowerCase())
  if (!found) {
    throw new Error(`지원하지 않는 모델입니다: ${model}. 사용 가능: ${SELECTABLE_MODELS.map((m) => m.value).join(', ')}`)
  }
  return found.value
}

/** 출력 폴더 결정·검증 (앱 데이터 폴더 안이면 거부) */
export function resolveDestDir(dataDir: string, destDir: string | undefined, kind: string): string {
  const dir = destDir ? resolve(destDir) : defaultDestDir(kind)
  assertWritable(dir, dataDir)
  return dir
}

/** 계획 단계에서 끊는 단위 수 상한 — 실수로 수천 건을 만들지 않게 (서버 폭주 방지) */
export const PLAN_HARD_LIMIT = 1000
