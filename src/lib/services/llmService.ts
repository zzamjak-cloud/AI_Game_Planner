// 앱 전용 LLM 디스패치 — Claude 키가 있으면 Claude, 없으면 OpenRouter
// mcp/는 이 모듈을 쓰지 않고 openRouterService를 직접 쓴다 (스토어·Tauri 비의존 유지).

import { useAppStore } from '../../store/useAppStore'
import type { GeminiContent } from '../../types/gemini'
import { normalizeClaudeModel } from '../constants/claude'
import {
  openRouterService,
  streamWithContinuation as streamWithContinuationOpenRouter,
  translateText as translateTextOpenRouter,
  type ContinuationOptions,
  type ContinuationResult,
  type GenerateContentOptions,
  type StreamContentOptions,
} from './openRouterService'
import {
  generateContentClaude,
  streamWithContinuationClaude,
  type ClaudeStreamResult,
} from './anthropicService'

// 번역·요약 같은 보조 작업용 저가 모델
const CLAUDE_AUX_MODEL = 'claude-haiku-5-5'

function claudeSettings() {
  const { anthropicApiKey, claudeModel } = useAppStore.getState()
  const key = anthropicApiKey?.trim()
  return key ? { key, model: normalizeClaudeModel(claudeModel) } : null
}

// OpenRouter 또는 Claude 키가 하나라도 있는지
export function hasLlmKey(): boolean {
  const { apiKey, anthropicApiKey } = useAppStore.getState()
  return !!(apiKey?.trim() || anthropicApiKey?.trim())
}

export function isClaudeActive(): boolean {
  return claudeSettings() !== null
}

export async function streamWithContinuation(
  apiKey: string,
  contents: GeminiContent[],
  options?: ContinuationOptions
): Promise<ContinuationResult | ClaudeStreamResult> {
  // Claude 분기는 라운드별 hooks·onUsage를 쓰지 않는다 (앱은 둘 다 넘기지 않음)
  const claude = claudeSettings()
  if (!claude) return streamWithContinuationOpenRouter(apiKey, contents, options)

  return streamWithContinuationClaude(claude.key, claude.model, contents, {
    onChunk: options?.onChunk,
    signal: options?.hooks ? options.hooks().signal : options?.signal,
    webSearch: !!options?.tools?.length,
  })
}

export async function generateContent(
  apiKey: string,
  contents: GeminiContent[],
  options?: GenerateContentOptions
): Promise<string> {
  const claude = claudeSettings()
  if (!claude) return openRouterService.generateContent(apiKey, contents, options)

  return generateContentClaude(claude.key, claude.model, contents, {
    system: options?.system,
    config: options?.config,
    signal: options?.signal,
  })
}

export async function streamGenerateContent(
  apiKey: string,
  contents: GeminiContent[],
  options?: Omit<StreamContentOptions, 'onChunk'>
): Promise<string> {
  const claude = claudeSettings()
  if (!claude) return openRouterService.streamGenerateContent(apiKey, contents, options)

  // 요약 같은 보조 작업이므로 저가 모델·낮은 추론 강도를 쓴다
  return generateContentClaude(claude.key, CLAUDE_AUX_MODEL, contents, {
    config: { max_tokens: 8192, reasoning: { effort: 'low' } },
    signal: options?.signal,
  })
}

export async function translateText(
  apiKey: string,
  text: string,
  targetLang: 'ko' | 'en'
): Promise<string> {
  const claude = claudeSettings()
  if (!claude) return translateTextOpenRouter(apiKey, text, targetLang)

  const direction = targetLang === 'ko' ? 'from English to Korean' : 'from Korean to English'
  return generateContentClaude(claude.key, CLAUDE_AUX_MODEL, [{ role: 'user', parts: [{ text }] }], {
    system:
      `You are a professional translator. Translate the following AI prompt ${direction}. ` +
      'Maintain the original structure, formatting, and technical terms. ' +
      'Output only the translated text without any additional explanations.',
    config: { max_tokens: 8192, reasoning: { effort: 'low' } },
  })
}
