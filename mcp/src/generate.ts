/**
 * 문서 생성 — 앱과 같은 경로로 기획서·분석 보고서를 만든다 (UI 없이)
 *
 * - 신규 기획서: 템플릿을 최상위(#) 섹션으로 나눠 순차 생성 (`generateSectioned`, 앱과 동일).
 *   섹션이 3개 미만인 템플릿이거나 기존 문서 수정이면 단일 호출 + 자동 이어쓰기.
 * - 분석 보고서: 분석 래퍼 + 템플릿, 웹 검색(`:online`)을 켜고 단일 호출 + 자동 이어쓰기.
 * - 응답 파싱(태그 안 = 문서, 밖 = 대화)은 앱과 같은 `parseDocumentResponse`.
 *
 * 실패하면 그때까지 받은 본문(이미 과금됨)을 `onPartial` 로 넘겨 호출부가 `_partial` 파일로 남기게 한다.
 */

import type { GeminiContent } from '../../src/types/gemini'
import { streamWithContinuation, type RequestHooks } from '../../src/lib/services/openRouterService'
import type { DocumentKind } from '../../src/lib/prompts/documentPrompt'
import { generateSectioned, planSections } from '../../src/lib/services/sectionedGeneration'
import {
  buildAnalysisContents,
  buildPlanningContents,
  parseDocumentResponse,
  withSectionedOverride,
  type ChatTurn,
} from '../../src/lib/prompts/documentPrompt'
import { SYSTEM_INSTRUCTION } from '../../src/lib/systemInstruction'

export interface GenerationResult {
  markdown: string
  /** 태그 밖 대화 (앱 세션의 assistant 메시지) */
  chatText: string
  /** 이어쓰기 한도까지 갔는데도 잘렸는지 */
  truncated: boolean
  /** 섹션 분할로 생성했으면 섹션 제목 목록 */
  sections?: string[]
}

export interface GenerationEnv {
  apiKey: string
  model: string
  /** 요청(섹션·이어쓰기 라운드)마다 새 hooks (타임아웃·usage 집계·취소 확인) */
  hooks: () => RequestHooks
  /** 실패 시 지금까지 받은 본문 */
  onPartial?: (markdown: string) => void
}

/** 한 번의 (이어쓰기 포함) 스트리밍 호출 → 전체 응답 텍스트 */
async function streamOnce(
  env: GenerationEnv,
  kind: DocumentKind,
  contents: GeminiContent[],
  tools?: Array<{ google_search?: Record<string, never> }>
): Promise<{ text: string; truncated: boolean }> {
  let received = ''
  try {
    const result = await streamWithContinuation(env.apiKey, contents, {
      model: env.model,
      tools,
      hooks: env.hooks,
      onChunk: (chunk) => {
        received += chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
      },
    })
    return { text: result.text, truncated: result.truncated }
  } catch (error) {
    // 태그·대화문을 걷어낸 본문만 남긴다 (본문을 못 찾으면 원문)
    if (received.trim()) env.onPartial?.(parseDocumentResponse(received, kind).markdown || received)
    throw error
  }
}

/** 섹션 분할 가능 여부 (신규 문서일 때만) — 견적에도 쓴다 */
export function planningSections(systemPrompt: string | undefined, isNewDocument: boolean) {
  return isNewDocument ? planSections(systemPrompt || SYSTEM_INSTRUCTION) : []
}

export interface PlanningInput {
  /** 템플릿 본문 (참조 파일이 붙은 상태) */
  systemPrompt?: string
  message: string
  currentMarkdown?: string
  history?: ChatTurn[]
}

/** 기획서 생성·수정 (앱 useGeminiChat 과 같은 경로) */
export async function generatePlanning(env: GenerationEnv, input: PlanningInput): Promise<GenerationResult> {
  const contents = buildPlanningContents(input)
  const isNew = !input.currentMarkdown || !input.currentMarkdown.trim()
  const sections = planningSections(input.systemPrompt, isNew)

  if (sections.length > 0) {
    let latest = ''
    try {
      const { markdown, truncated } = await generateSectioned(
        env.apiKey,
        sections,
        withSectionedOverride(contents),
        { onProgress: () => {}, onMarkdownUpdate: (md) => (latest = md) },
        env.model,
        env.hooks
      )
      return {
        markdown,
        chatText: truncated
          ? '기획서 작성이 완료되었습니다.\n\n⚠️ 경고: 일부 섹션이 너무 길어 완결되지 않았을 수 있습니다. 해당 섹션만 다시 요청해 주세요.'
          : '기획서 작성이 완료되었습니다.',
        truncated,
        sections: sections.map((s) => s.title),
      }
    } catch (error) {
      if (latest.trim()) env.onPartial?.(latest)
      throw error
    }
  }

  const { text, truncated } = await streamOnce(env, 'planning', contents)
  const parsed = parseDocumentResponse(text, 'planning')
  return { markdown: parsed.markdown, chatText: parsed.chatText.trim(), truncated }
}

export interface AnalysisInput {
  templatePrompt?: string
  message: string
  currentAnalysis?: string
  history?: ChatTurn[]
}

/** 게임 분석 보고서 생성·수정 (앱 useGameAnalysis 와 같은 경로 — 웹 검색 사용) */
export async function generateAnalysis(env: GenerationEnv, input: AnalysisInput): Promise<GenerationResult> {
  const { text, truncated } = await streamOnce(env, 'analysis', buildAnalysisContents(input), [{ google_search: {} }])
  const parsed = parseDocumentResponse(text, 'analysis')
  return { markdown: parsed.markdown, chatText: parsed.chatText.trim(), truncated }
}
