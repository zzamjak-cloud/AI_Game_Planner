// Claude(Anthropic) 호출 — openRouterService와 같은 호출 규약(스트리밍 이어쓰기·단발 생성)

import Anthropic from '@anthropic-ai/sdk'
import type { GeminiContent, GeminiStreamChunk } from '../../types/gemini'
import type { ContinuationResult } from './openRouterService'
import { ApiError } from '../../types/errors'

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam

const MAX_TOKENS = 64000
const MAX_PAUSE_TURNS = 5
const MAX_CONTINUATION_ROUNDS = 3

const WEB_SEARCH_SYSTEM_INSTRUCTION =
  '웹 검색으로 최신 정보를 확인하되, 검색 과정 설명 없이 최종 보고서 본문만 출력하라.'

const CONTINUE_INSTRUCTION = '이어서 계속 작성해 주세요. 이미 작성한 부분은 반복하지 마세요.'

// 응답 도중 거부되어 스트리밍된 미리보기를 되돌려야 할 때 던진다
export class ClaudeRefusalError extends Error {
  constructor(discardedPartial: boolean) {
    super(
      discardedPartial
        ? 'Claude가 요청을 거부하여 작성 중이던 일부 출력은 폐기했습니다'
        : 'Claude가 이 요청에 대한 응답을 거부했습니다'
    )
    this.name = 'ClaudeRefusalError'
  }
}

// 폴백이 일어났다면 앞 모델의 thinking·짝 없는 서버 도구 블록은 되돌려 보내지 않는다
function pruneBeforeFallback<T extends { type: string }>(blocks: T[]): T[] {
  const lastFallback = blocks.map((b) => b.type).lastIndexOf('fallback')
  if (lastFallback < 0) return blocks
  const resultIds = new Set(
    blocks.map((b) => (b as { tool_use_id?: string }).tool_use_id).filter((id): id is string => !!id)
  )
  return blocks.filter((b, i) => {
    if (i >= lastFallback) return true
    if (b.type === 'thinking' || b.type === 'redacted_thinking') return false
    if (b.type === 'server_tool_use') return resultIds.has((b as unknown as { id: string }).id)
    return true
  })
}

export interface ClaudeStreamResult extends ContinuationResult {
  // pause_limit: 웹 검색 재개 한도 초과, max_tokens: 이어쓰기 한도까지 여전히 잘림
  stoppedReason?: 'pause_limit' | 'max_tokens'
}

export type ClaudeEffort = 'low' | 'medium' | 'high'

// 추론이 출력 예산을 모두 먹어 텍스트가 비면 한 단계 낮춰 재시도한다 (low 이후는 null)
function lowerEffort(effort: string): ClaudeEffort | null {
  if (effort === 'low') return null
  return effort === 'medium' ? 'low' : 'medium'
}

export interface ClaudeStreamOptions {
  onChunk?: (chunk: GeminiStreamChunk) => void
  signal?: AbortSignal
  // true면 웹 검색 도구를 켠다 (분석)
  webSearch?: boolean
  system?: string
  effort?: ClaudeEffort
}

// Haiku 계열은 서버 측 폴백 베타를 쓰지 않는다
function supportsFallbacks(model: string): boolean {
  return !model.includes('haiku')
}

// Gemini 형식 대화를 Anthropic 메시지로 변환 (연속된 같은 역할은 병합, 첫 메시지는 user)
function toMessages(contents: GeminiContent[]): MessageParam[] {
  const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (const content of contents) {
    const role = content.role === 'model' ? 'assistant' : 'user'
    const text = content.parts.map((p) => p.text ?? '').join('')
    const last = messages[messages.length - 1]
    if (last && last.role === role) {
      last.text += '\n\n' + text
    } else {
      messages.push({ role, text })
    }
  }
  if (messages[0]?.role !== 'user') {
    messages.unshift({ role: 'user', text: '(대화 시작)' })
  }
  return messages.map((m) => ({ role: m.role, content: m.text }))
}

function toKoreanError(error: unknown): unknown {
  if (error instanceof Anthropic.APIUserAbortError) return error
  if (error instanceof Anthropic.AuthenticationError) {
    return new ApiError('Claude API 키가 올바르지 않습니다', 401)
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ApiError('Claude API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요', 429)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ApiError('Claude API에 연결하지 못했습니다. 네트워크를 확인해주세요', 0)
  }
  if (error instanceof Anthropic.APIError) {
    return new ApiError(`Claude API 오류 (${error.status ?? '알 수 없음'}): ${error.message}`, error.status)
  }
  return error
}

export async function streamWithContinuationClaude(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  options: ClaudeStreamOptions = {}
): Promise<ClaudeStreamResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const messages = toMessages(contents)

  let accumulated = ''
  let truncated = false
  let rounds = 0
  let pauseTurns = 0
  let continuingAfterCut = false
  let afterNonTextBlock = false
  let emptyRetries = 0
  let effort: ClaudeEffort = options.effort ?? 'high'
  let stoppedReason: ClaudeStreamResult['stoppedReason']

  try {
    while (true) {
      rounds++
      const roundStartLength = accumulated.length
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          cache_control: { type: 'ephemeral' },
          thinking: { type: 'adaptive' },
          output_config: { effort },
          ...(options.webSearch
            ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 10 }] }
            : {}),
          ...(supportsFallbacks(model)
            ? { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const }
            : {}),
          system: options.system ?? (options.webSearch ? WEB_SEARCH_SYSTEM_INSTRUCTION : undefined),
          messages,
        },
        { signal: options.signal }
      )

      // 호출부는 델타 텍스트를 Gemini 청크 형태로 받는다
      const emit = (delta: string) => {
        accumulated += delta
        options.onChunk?.({ candidates: [{ content: { role: 'model', parts: [{ text: delta }] } }] })
      }
      // 검색 등 비텍스트 블록을 사이에 둔 텍스트만 문단을 나눈다.
      // 인용(citation)은 한 문장도 여러 텍스트 블록으로 쪼개므로, 연속된 텍스트 블록은 그대로 이어 붙인다.
      // max_tokens 이어쓰기 라운드는 끊긴 문장에 바로 이어져야 하므로 경계를 지운다.
      if (continuingAfterCut) afterNonTextBlock = false
      stream.on('streamEvent', (event) => {
        if (event.type !== 'content_block_start') return
        if (event.content_block.type !== 'text') {
          afterNonTextBlock = true
          return
        }
        if (afterNonTextBlock && accumulated && !accumulated.endsWith('\n')) emit('\n\n')
        afterNonTextBlock = false
      })
      stream.on('text', (delta) => {
        if (delta) emit(delta)
      })

      const message = await stream.finalMessage()

      if (message.stop_reason === 'refusal') {
        throw new ClaudeRefusalError(accumulated.length > 0)
      }

      const wasContinuing: boolean = continuingAfterCut
      continuingAfterCut = false

      // 사고만 하다 max_tokens에 걸려 텍스트가 전혀 없으면, 빈 턴을 되돌려 보내지 않고 같은 요청을 추론을 낮춰 재시도한다
      if (message.stop_reason === 'max_tokens' && accumulated.length === roundStartLength) {
        const lowered = lowerEffort(effort)
        if (lowered) {
          effort = lowered
          emptyRetries++
          continuingAfterCut = wasContinuing
          continue
        }
      }

      if (message.stop_reason === 'pause_turn') {
        if (++pauseTurns > MAX_PAUSE_TURNS) {
          stoppedReason = 'pause_limit'
          break
        }
        // 서버 도구 상태 보존을 위해 thinking·검색 블록까지 그대로 되돌려 보낸다
        messages.push({
          role: 'assistant',
          content: pruneBeforeFallback(message.content) as Anthropic.Beta.Messages.BetaContentBlockParam[],
        })
        continue
      }

      if (message.stop_reason === 'max_tokens') {
        if (rounds - pauseTurns - emptyRetries >= MAX_CONTINUATION_ROUNDS) {
          truncated = true
          stoppedReason = 'max_tokens'
          break
        }
        // 끝이 미완성인 thinking·서버 도구 블록은 재전송이 거부되므로 마지막 텍스트 블록까지만 되돌려 보낸다
        const blocks = pruneBeforeFallback([...message.content])
        while (blocks.length > 0 && blocks[blocks.length - 1].type !== 'text') blocks.pop()
        if (blocks.length === 0) {
          truncated = true
          stoppedReason = 'max_tokens'
          break
        }
        messages.push({ role: 'assistant', content: blocks as Anthropic.Beta.Messages.BetaContentBlockParam[] })
        messages.push({ role: 'user', content: CONTINUE_INSTRUCTION })
        continuingAfterCut = true
        continue
      }

      break
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw toKoreanError(error)
  }

  return { text: accumulated, truncated, rounds, stoppedReason }
}

export interface ClaudeGenerateOptions {
  system?: string
  // OpenRouter 형식 config에서 reasoning.effort·max_tokens만 취한다 (temperature 등은 이 모델들에서 400)
  config?: Record<string, unknown>
  signal?: AbortSignal
}

// 사고 토큰이 max_tokens를 잠식하므로 최소 여유를 둔다
const MIN_GENERATE_TOKENS = 8192
const DEFAULT_GENERATE_TOKENS = 16000

// 비스트리밍 단발 호출과 같은 규약 — 텍스트만 돌려준다 (긴 출력도 안전하도록 내부는 스트림 사용)
export async function generateContentClaude(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  options: ClaudeGenerateOptions = {}
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const config = options.config ?? {}
  const configured = (config.reasoning as { effort?: string } | undefined)?.effort
  let effort: ClaudeEffort = configured === 'low' || configured === 'medium' ? configured : 'high'
  const requested = typeof config.max_tokens === 'number' ? config.max_tokens : DEFAULT_GENERATE_TOKENS

  try {
    while (true) {
      const message = await client.beta.messages
        .stream(
          {
            model,
            max_tokens: Math.min(Math.max(requested, MIN_GENERATE_TOKENS), MAX_TOKENS),
            cache_control: { type: 'ephemeral' },
            thinking: { type: 'adaptive' },
            output_config: { effort },
            ...(supportsFallbacks(model)
              ? { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const }
              : {}),
            system: options.system,
            messages: toMessages(contents),
          },
          { signal: options.signal }
        )
        .finalMessage()

      if (message.stop_reason === 'refusal') {
        throw new ClaudeRefusalError(false)
      }

      const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      if (!text && message.stop_reason === 'max_tokens') {
        const lowered = lowerEffort(effort)
        if (lowered) {
          effort = lowered
          continue
        }
      }
      if (!text) throw new Error('응답 본문이 비어 있습니다.')
      return text
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw toKoreanError(error)
  }
}
