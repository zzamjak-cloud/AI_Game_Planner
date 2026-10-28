// OpenRouter API 서비스 (OpenAI 호환 Chat Completions)
// 회사 통합 OpenRouter 키 하나로 Gemini 등 여러 provider 모델을 호출한다.

import { GeminiContent, GeminiStreamChunk } from '../../types/gemini'
import { ApiError } from '../../types/errors'
import {
  OPENROUTER_API_BASE_URL,
  GENERATION_CONFIG,
  TRANSLATION_CONFIG,
  AUX_MODEL,
  resolveRequestModel,
} from '../constants/api'
import { devLog } from '../utils/logger'

const MAX_REQUEST_ATTEMPTS = 5
const RETRYABLE_STATUS = new Set([429, 502, 503])

// OpenRouter 순위 표시에 쓰이는 선택 헤더 값
const APP_TITLE = 'GamePlanner'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(response: Response, attemptIndex: number): number {
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (!Number.isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 120_000)
    }
  }
  const base = 2000 * 2 ** attemptIndex
  return Math.min(base, 60_000)
}

// OpenAI 호환 finish_reason → 기존 Gemini finishReason 매핑 (호출부 호환 유지)
const FINISH_REASON_MAP: Record<string, string> = {
  stop: 'STOP',
  length: 'MAX_TOKENS',
  content_filter: 'SAFETY',
}

// 응답 usage (토큰 수·비용). OpenRouter 가 응답 끝에 붙인다 — 비용 실측 기록에 쓴다(MCP)
export type OpenRouterUsage = Record<string, unknown>

// 비스트리밍 Chat Completions 응답
interface OpenRouterCompletion {
  choices?: Array<{
    message?: { content?: string | null }
    finish_reason?: string | null
  }>
  usage?: OpenRouterUsage
  error?: {
    message?: string
    code?: number
  }
}

interface OpenRouterStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null }
    finish_reason?: string | null
  }>
  // 스트림 마지막 청크에만 온다
  usage?: OpenRouterUsage
  error?: {
    message?: string
    code?: number
  }
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// 기존 GeminiContent(role: user|model) → OpenAI 메시지 형식 변환
// system이 주어지면 맨 앞에 system role 메시지로 붙인다.
function toMessages(contents: GeminiContent[], system?: string): ChatMessage[] {
  const messages: ChatMessage[] = contents.map((c) => ({
    role: c.role === 'model' ? ('assistant' as const) : ('user' as const),
    content: c.parts.map((p) => p.text || '').join(''),
  }))

  if (system && system.trim()) {
    messages.unshift({ role: 'system', content: system })
  }

  return messages
}

// 재시도 정책을 공유하는 Chat Completions 요청 (스트리밍/비스트리밍 공통)
async function postChatCompletion(apiKey: string, body: string, signal?: AbortSignal): Promise<Response> {
  const url = `${OPENROUTER_API_BASE_URL}/chat/completions`

  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-OpenRouter-Title': APP_TITLE,
      },
      body,
      signal,
    })

    if (response.ok) {
      return response
    }

    const errorText = await response.text()
    const canRetry =
      attempt < MAX_REQUEST_ATTEMPTS - 1 && RETRYABLE_STATUS.has(response.status)

    if (canRetry) {
      const delayMs = getRetryDelayMs(response, attempt)
      devLog.warn(
        `OpenRouter API ${response.status} (할당량·일시 과부하). ${delayMs}ms 후 재시도 (${attempt + 1}/${MAX_REQUEST_ATTEMPTS})…`
      )
      await sleep(delayMs)
      continue
    }

    throw new ApiError(
      `OpenRouter API HTTP ${response.status}`,
      response.status,
      errorText
    )
  }

  // 루프는 항상 반환 또는 throw로 끝나지만, 타입 좁히기를 위해 방어적으로 처리
  throw new ApiError('OpenRouter API 요청이 재시도 한도를 초과했습니다', 0, '')
}

// OpenAI 형식 델타를 기존 호출부가 소비하는 GeminiStreamChunk 형태로 변환
function toGeminiChunk(text: string, finishReason: string | null | undefined): GeminiStreamChunk {
  return {
    candidates: [
      {
        content: { parts: [{ text }], role: 'model' },
        finishReason: finishReason ? FINISH_REASON_MAP[finishReason] || finishReason.toUpperCase() : undefined,
      },
    ],
  }
}

// 호출 공통 부가 옵션 — 앱은 쓰지 않고 MCP 서버(mcp/)가 비용 기록·취소에 쓴다
export interface RequestHooks {
  // 응답 usage 수신 시 호출 (스트리밍은 마지막 청크)
  onUsage?: (usage: OpenRouterUsage) => void
  // 요청 중단 신호 (타임아웃 등)
  signal?: AbortSignal
}

// 스트리밍 호출 옵션
export interface StreamContentOptions extends RequestHooks {
  model?: string
  tools?: Array<{ google_search?: Record<string, never> }>
  onChunk?: (chunk: GeminiStreamChunk) => void
}

// 자동 이어쓰기 옵션 — hooks 를 주면 라운드(요청)마다 새로 받는다 (MCP: 요청별 타임아웃·취소 확인)
export interface ContinuationOptions extends StreamContentOptions {
  hooks?: () => RequestHooks
}

export interface IOpenRouterService {
  streamGenerateContent(
    apiKey: string,
    contents: GeminiContent[],
    options?: StreamContentOptions
  ): Promise<string>

  generateContent(
    apiKey: string,
    contents: GeminiContent[],
    options?: GenerateContentOptions
  ): Promise<string>
}

// 비스트리밍 단발 호출 옵션
export interface GenerateContentOptions extends RequestHooks {
  model?: string
  // 시스템 역할 메시지 (지시문). OpenAI 호환 형식의 system role로 전달된다.
  system?: string
  // 생성 파라미터 오버라이드. 미지정 시 GENERATION_CONFIG를 사용한다.
  config?: Record<string, unknown>
}

/**
 * OpenRouter API 서비스 구현
 */
export class OpenRouterService implements IOpenRouterService {
  async streamGenerateContent(
    apiKey: string,
    contents: GeminiContent[],
    options?: StreamContentOptions
  ): Promise<string> {
    const cleanApiKey = String(apiKey || '').trim()
    if (!cleanApiKey) {
      throw new Error('API Key가 비어있습니다')
    }

    // 사용자 선택 모델 우선. 검색 도구 요청 시 :online 접미사로 OpenRouter 웹 검색 플러그인 활성화
    let model: string = resolveRequestModel(options?.model)
    if (options?.tools && !model.endsWith(':online')) {
      model = `${model}:online`
    }

    const body = JSON.stringify({
      model,
      messages: toMessages(contents),
      stream: true,
      ...GENERATION_CONFIG,
    })

    const response = await postChatCompletion(cleanApiKey, body, options?.signal)

    if (!response.body) {
      throw new Error('응답 스트림을 사용할 수 없습니다')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        // OpenRouter는 연결 유지용 주석 라인(": OPENROUTER PROCESSING")을 보낸다
        if (!line.startsWith('data: ')) continue

        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue

        try {
          const data = JSON.parse(jsonStr) as OpenRouterStreamChunk

          // 스트림 중간 에러 처리
          if (data.error) {
            throw new ApiError(
              `OpenRouter 스트림 오류: ${data.error.message || '알 수 없는 오류'}`,
              data.error.code || 0,
              jsonStr
            )
          }

          if (data.usage) {
            options?.onUsage?.(data.usage)
          }

          const choice = data.choices?.[0]
          const text = choice?.delta?.content || ''
          const finishReason = choice?.finish_reason

          if (text) {
            fullResponse += text
          }

          if (text || finishReason) {
            options?.onChunk?.(toGeminiChunk(text, finishReason))
          }

          // finish_reason 확인 (응답이 왜 끝났는지 로그)
          if (finishReason) {
            if (finishReason === 'length') {
              devLog.warn('⚠️ [API] 최대 토큰 수에 도달하여 응답이 잘렸습니다. max_tokens를 늘려야 합니다.')
            } else if (finishReason === 'content_filter') {
              devLog.warn('⚠️ [API] 안전 필터에 의해 응답이 차단되었습니다.')
            } else if (finishReason === 'stop') {
              devLog.log('✅ [API] 응답이 정상적으로 완료되었습니다. (총 길이: ' + fullResponse.length + '자)')
            } else {
              devLog.warn('⚠️ [API] 알 수 없는 종료 이유: ' + finishReason)
            }
          }
        } catch (e) {
          if (e instanceof ApiError) throw e
          console.warn('JSON 파싱 오류:', e, jsonStr)
        }
      }
    }

    return fullResponse
  }

  /**
   * 비스트리밍 단발 생성 호출.
   * 번역처럼 짧고 즉시 완결되는 요청에 사용한다.
   *
   * @param apiKey OpenRouter API 키
   * @param contents 대화 내용
   * @param options 모델·시스템 지시문·생성 파라미터 오버라이드
   * @returns 생성된 텍스트
   */
  async generateContent(
    apiKey: string,
    contents: GeminiContent[],
    options?: GenerateContentOptions
  ): Promise<string> {
    const cleanApiKey = String(apiKey || '').trim()
    if (!cleanApiKey) {
      throw new Error('API Key가 비어있습니다')
    }

    const model = resolveRequestModel(options?.model)

    const body = JSON.stringify({
      model,
      messages: toMessages(contents, options?.system),
      ...(options?.config ?? GENERATION_CONFIG),
    })

    const response = await postChatCompletion(cleanApiKey, body, options?.signal)
    const data = (await response.json()) as OpenRouterCompletion

    if (data.usage) {
      options?.onUsage?.(data.usage)
    }

    if (data.error) {
      throw new ApiError(
        `OpenRouter 응답 오류: ${data.error.message || '알 수 없는 오류'}`,
        data.error.code || 0,
        ''
      )
    }

    const choice = data.choices?.[0]
    const text = choice?.message?.content

    if (choice?.finish_reason === 'length') {
      devLog.warn('⚠️ [API] 최대 토큰 수에 도달하여 응답이 잘렸습니다.')
    }

    if (!text) {
      throw new Error('응답 본문이 비어 있습니다.')
    }

    return text
  }
}

// 싱글톤 인스턴스
export const openRouterService = new OpenRouterService()

// 자동 이어쓰기 최대 라운드 (최초 1회 + 이어쓰기 2회)
const MAX_CONTINUATION_ROUNDS = 3

// 잘린 지점에서 이어쓰게 하는 지시문
const CONTINUATION_INSTRUCTION = `이전 응답이 최대 출력 길이에 걸려 중간에서 끊겼습니다.
끊긴 지점에서 **이어서** 계속 작성하십시오.

절대 준수 사항:
- 이미 작성한 내용을 다시 반복하지 마십시오.
- "이어서 작성합니다" 같은 설명이나 머리말을 붙이지 마십시오.
- 끊긴 문장·표·목록의 바로 다음부터 자연스럽게 이어 쓰십시오.
- 문서를 끝까지 완성한 뒤 </markdown_content> 닫는 태그로 마무리하십시오.`

export interface ContinuationResult {
  // 이어쓰기 결과를 모두 병합한 전체 텍스트
  text: string
  // 재시도 한도까지 갔는데도 여전히 잘린 상태로 끝났는지
  truncated: boolean
  // 실제로 수행한 호출 라운드 수
  rounds: number
}

/**
 * 출력이 최대 토큰에 걸려 잘리면 자동으로 이어받아 재요청하고 결과를 병합한다.
 *
 * 모든 후보 모델의 최대 출력이 65,536 토큰으로 동일하므로,
 * 모델 교체로는 잘림을 해결할 수 없다. 이어쓰기가 마지막 안전망이다.
 *
 * @param apiKey OpenRouter API 키
 * @param contents 대화 내용
 * @param options 모델·검색 도구·스트리밍 콜백
 * @returns 병합된 텍스트와 잘림 여부
 */
export async function streamWithContinuation(
  apiKey: string,
  contents: GeminiContent[],
  options?: ContinuationOptions
): Promise<ContinuationResult> {
  let accumulated = ''
  let truncated = false
  let rounds = 0

  for (let round = 0; round < MAX_CONTINUATION_ROUNDS; round++) {
    rounds = round + 1
    const isLastRound = round === MAX_CONTINUATION_ROUNDS - 1
    let roundTruncated = false

    // 이어쓰기 라운드에서는 지금까지의 출력과 이어쓰기 지시를 대화에 덧붙인다
    const roundContents: GeminiContent[] =
      round === 0
        ? contents
        : [
            ...contents,
            { role: 'model', parts: [{ text: accumulated }] },
            { role: 'user', parts: [{ text: CONTINUATION_INSTRUCTION }] },
          ]

    const roundHooks = options?.hooks ? options.hooks() : { onUsage: options?.onUsage, signal: options?.signal }

    const text = await openRouterService.streamGenerateContent(apiKey, roundContents, {
      model: options?.model,
      tools: options?.tools,
      onUsage: roundHooks.onUsage,
      signal: roundHooks.signal,
      onChunk: (chunk) => {
        const candidate = chunk.candidates?.[0]

        if (candidate?.finishReason === 'MAX_TOKENS') {
          roundTruncated = true

          // 자동 이어쓰기로 복구할 예정이면 호출부에 잘림을 알리지 않는다.
          // (호출부가 사용자에게 잘림 경고를 띄우는 것을 막기 위함)
          if (!isLastRound) {
            options?.onChunk?.({
              candidates: [{ content: candidate.content, finishReason: undefined }],
            })
            return
          }
        }

        options?.onChunk?.(chunk)
      },
    })

    accumulated += text

    if (!roundTruncated) {
      truncated = false
      break
    }

    truncated = true

    if (!isLastRound) {
      devLog.warn(
        `⚠️ [API] 출력이 잘렸습니다. 자동 이어쓰기 진행 (${round + 1}/${MAX_CONTINUATION_ROUNDS - 1})…`
      )
    } else {
      devLog.warn('⚠️ [API] 이어쓰기 한도까지 시도했으나 여전히 잘린 상태입니다.')
    }
  }

  return { text: accumulated, truncated, rounds }
}

/**
 * 프롬프트를 번역한다. 추론 강도를 low로 낮춘 전용 설정을 사용한다.
 *
 * @param apiKey OpenRouter API 키
 * @param text 번역할 텍스트
 * @param targetLang 목표 언어 ('ko' 또는 'en')
 * @returns 번역된 텍스트
 */
export async function translateText(
  apiKey: string,
  text: string,
  targetLang: 'ko' | 'en'
): Promise<string> {
  const direction = targetLang === 'ko' ? 'from English to Korean' : 'from Korean to English'
  const systemPrompt =
    `You are a professional translator. Translate the following AI prompt ${direction}. ` +
    'Maintain the original structure, formatting, and technical terms. ' +
    'Output only the translated text without any additional explanations.'

  return openRouterService.generateContent(
    apiKey,
    [{ role: 'user', parts: [{ text }] }],
    {
      // 번역은 사용자가 고른 본문 모델과 무관하게 보조 모델로 라우팅한다.
      // 사용자가 Pro를 선택했더라도 번역까지 Pro 단가로 처리되지 않도록 한다.
      model: AUX_MODEL,
      system: systemPrompt,
      config: TRANSLATION_CONFIG,
    }
  )
}
