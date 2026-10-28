// API 관련 상수 (OpenRouter 통합 키 기반)

export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1'

// OpenRouter 모델 슬러그 (provider/model 형식)
export const OPENROUTER_MODELS = {
  FLASH: 'google/gemini-3.8-flash',
  PRO: 'google/gemini-3.1-pro-preview',
} as const

// 보조 작업(번역 등) 전용 모델.
// 사용자가 선택하는 본문 모델과 분리한다. 번역·형식 변환처럼 추론이 불필요한 작업을
// 값비싼 본문 모델로 처리하면 낭비이므로, reasoning이 없는 저가 모델로 라우팅한다.
// 3.1 Flash Lite: 입력 $0.25/1M, 출력 $1.5/1M, reasoning 없음 → 출력 예산 낭비 없음
export const AUX_MODEL = 'google/gemini-3.1-flash-lite'

export type ChatModel = (typeof OPENROUTER_MODELS)[keyof typeof OPENROUTER_MODELS]

export const DEFAULT_CHAT_MODEL: ChatModel = OPENROUTER_MODELS.FLASH

// 설정 화면에서 사용자가 선택 가능한 모델 목록
export const SELECTABLE_MODELS: Array<{ value: ChatModel; label: string; description: string }> = [
  { value: OPENROUTER_MODELS.FLASH, label: 'Gemini 3.8 Flash', description: '최신 Stable Flash, 복잡한 기획 작업에 권장' },
  { value: OPENROUTER_MODELS.PRO, label: 'Gemini 3.1 Pro', description: '심층 추론·장문 분석용 (느리고 비쌈)' },
]

// Gemini API 직접 호출 시절 저장된 모델명 → OpenRouter 슬러그 마이그레이션
const LEGACY_CHAT_MODEL_MIGRATIONS: Record<string, ChatModel> = {
  'google/gemini-3.7-flash': OPENROUTER_MODELS.FLASH,
  'google/gemini-3.6-flash': OPENROUTER_MODELS.FLASH,
  'gemini-3.8-flash': OPENROUTER_MODELS.FLASH,
  'gemini-3.7-flash': OPENROUTER_MODELS.FLASH,
  'gemini-3.6-flash': OPENROUTER_MODELS.FLASH,
  'gemini-3.1-pro-preview': OPENROUTER_MODELS.PRO,
  'gemini-3.1-pro': OPENROUTER_MODELS.PRO,
  'gemini-2.5-pro': OPENROUTER_MODELS.PRO,
}

const SELECTABLE_MODEL_VALUES = new Set<string>(SELECTABLE_MODELS.map((model) => model.value))

/**
 * 사용자 설정값을 선택 가능한 모델로 정규화한다.
 * 저장된 설정에는 항상 SELECTABLE_MODELS 중 하나만 들어가도록 보장한다.
 */
export function normalizeChatModel(model: string | null | undefined): ChatModel {
  if (!model) return DEFAULT_CHAT_MODEL
  if (LEGACY_CHAT_MODEL_MIGRATIONS[model]) return LEGACY_CHAT_MODEL_MIGRATIONS[model]
  if (SELECTABLE_MODEL_VALUES.has(model)) return model as ChatModel
  return DEFAULT_CHAT_MODEL
}

/**
 * API 호출 시점에 실제 사용할 모델 슬러그를 해석한다.
 * 사용자 선택 모델에 더해 코드가 직접 지정하는 내부 모델(AUX_MODEL)도 허용한다.
 * AUX_MODEL은 설정 화면에 노출되지 않지만 코드에서 명시 지정하므로 폴백 대상이 아니다.
 */
export function resolveRequestModel(model: string | null | undefined): string {
  if (model === AUX_MODEL) return AUX_MODEL
  return normalizeChatModel(model)
}

// OpenRouter 추론(reasoning) 강도
// Gemini 3.8 Flash는 reasoning이 필수(mandatory)이며 기본 effort는 medium이다.
// 추론 토큰도 출력 토큰 예산(max_tokens)에서 차감되고 완성 토큰 단가로 과금되므로,
// 추론이 불필요한 작업은 effort를 낮춰 본문 예산과 비용을 확보한다.
export type ReasoningEffort = 'low' | 'medium' | 'high'

// OpenAI 호환 생성 파라미터 (OpenRouter가 지원 가능한 provider로 전달)
// 기획서/분석 보고서 본문 생성용 — 품질이 우선이므로 추론 강도는 모델 기본값(medium)을 따른다.
export const GENERATION_CONFIG = {
  temperature: 0.7,
  top_k: 40,
  top_p: 0.95,
  max_tokens: 65536, // Gemini 3.8 Flash/3.1 Pro Preview 최대 출력 토큰
} as const

// 번역 전용 파라미터
// 번역은 원문 구조를 그대로 옮기는 결정론적 작업이라 다단계 추론이 필요 없다.
// effort를 low로 낮춰 지연과 추론 토큰 비용을 줄인다.
export const TRANSLATION_CONFIG = {
  temperature: 0.3,
  max_tokens: 8192,
  reasoning: { effort: 'low' as ReasoningEffort },
} as const

// 딸깍(게임 아이디어 생성) 전용 파라미터
// 출력은 짧은 JSON 하나지만 다양성이 생명이라 temperature를 높게 잡는다.
// 재료 조합은 코드에서 이미 랜덤화하므로 추론은 low로 충분하다.
export const IDEA_GENERATION_CONFIG = {
  temperature: 1.1,
  top_p: 0.95,
  max_tokens: 4096,
  reasoning: { effort: 'low' as ReasoningEffort },
} as const

export const CHAT_HISTORY_LIMIT = 8 // 최근 대화 히스토리 개수 (비용 최적화를 위해 10 → 8로 축소)
