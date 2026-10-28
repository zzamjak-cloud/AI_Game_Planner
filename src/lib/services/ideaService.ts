// 딸깍(게임 코어 아이디어) 생성 서비스

import { GameIdea } from '../../types/idea'
import { RequestHooks, openRouterService } from './openRouterService'
import { ApiError } from '../../types/errors'
import { IDEA_GENERATION_CONFIG } from '../constants/api'
import { IDEA_SYSTEM_INSTRUCTION, IdeaSeed, buildIdeaUserPrompt, rollIdeaSeed } from '../ideaPrompt'
import { devLog } from '../utils/logger'

// 모델이 돌려주는 JSON 형태
interface RawIdea {
  title?: unknown
  lines?: unknown
  hook?: unknown
}

/**
 * 모델 응답에서 JSON 객체를 추출해 파싱한다.
 * 코드펜스나 앞뒤 설명이 섞여 와도 첫 '{'부터 마지막 '}'까지를 잘라 시도한다.
 */
function parseIdeaJson(text: string): RawIdea {
  const trimmed = text.trim()

  try {
    return JSON.parse(trimmed) as RawIdea
  } catch {
    // 코드펜스·설명문 제거 후 재시도
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('응답에서 JSON을 찾을 수 없습니다')
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as RawIdea
}

/**
 * 파싱된 JSON을 검증해 GameIdea로 정규화한다.
 * lines가 3개가 아니면 실패로 간주해 재시도 대상으로 넘긴다.
 */
function normalizeIdea(raw: RawIdea, inspiration: string): GameIdea {
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const hook = typeof raw.hook === 'string' ? raw.hook.trim() : ''
  const lines = Array.isArray(raw.lines)
    ? raw.lines.filter((l): l is string => typeof l === 'string').map((l) => l.trim()).filter(Boolean)
    : []

  if (!title || lines.length !== 3) {
    throw new Error(`아이디어 형식이 올바르지 않습니다 (title: ${!!title}, lines: ${lines.length})`)
  }

  return {
    id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    lines,
    hook: hook || '알 수 없음',
    inspiration,
    starred: false,
    createdAt: Date.now(),
  }
}

// 형식 오류 시 재시도 횟수 (API 오류는 openRouterService 쪽에서 별도 재시도)
const MAX_FORMAT_RETRIES = 2

// 배치 생성용 선택 옵션 (MCP 서버가 쓴다. 앱 딸깍은 넘기지 않는다)
export interface IdeaGenerationOptions extends RequestHooks {
  // 아이디어에 반영할 추가 방향 (장르·플랫폼·테마 등)
  focus?: string
  // 실제로 쓰인 seed 를 받는다 (형식 오류로 재시도하면 마지막 seed)
  onSeed?: (seed: IdeaSeed) => void
}

/**
 * 게임 코어 아이디어를 하나 생성한다.
 *
 * @param apiKey OpenRouter API 키
 * @param model 사용자 선택 모델
 * @param recentTitles 최근 아이디어 제목 (중복 회피용)
 * @param options 배치용 선택 옵션
 * @returns 생성된 아이디어
 */
export async function generateGameIdea(
  apiKey: string,
  model: string,
  recentTitles: string[],
  options?: IdeaGenerationOptions
): Promise<GameIdea> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= MAX_FORMAT_RETRIES; attempt++) {
    // 매 시도마다 seed를 새로 뽑아 같은 실패를 반복하지 않게 한다
    const seed = rollIdeaSeed()
    options?.onSeed?.(seed)
    devLog.log(`💡 딸깍 seed (${attempt + 1}/${MAX_FORMAT_RETRIES + 1}):`, seed.summary)

    try {
      const text = await openRouterService.generateContent(
        apiKey,
        [{ role: 'user', parts: [{ text: buildIdeaUserPrompt(seed, recentTitles, options?.focus) }] }],
        {
          model,
          system: IDEA_SYSTEM_INSTRUCTION,
          config: IDEA_GENERATION_CONFIG,
          onUsage: options?.onUsage,
          signal: options?.signal,
        }
      )

      return normalizeIdea(parseIdeaJson(text), seed.summary)
    } catch (error) {
      // API 오류(인증·할당량 등)는 재시도해도 결과가 같으므로 즉시 전파
      if (error instanceof ApiError) throw error
      lastError = error
      devLog.warn('⚠️ 아이디어 파싱 실패, 재시도:', error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('아이디어 생성에 실패했습니다')
}
