// 세션 관련 상수

export const DEFAULT_TEMPLATE_IDS = {
  PLANNING: 'default-planning',
  ANALYSIS: 'default-analysis',
} as const

export const AUTO_SAVE_DEBOUNCE_MS = 500 // 자동 저장 디바운스 시간 (ms)

export const SESSION_TITLE_PATTERNS = {
  PLANNING: /^🎮\s*\*\*(.+?)\s*게임\s*기획서\*\*/m,
  ANALYSIS: /<!--\s*ANALYSIS_TITLE:\s*(.+?)\s*게임\s*분석\s*보고서\s*-->/m,
} as const

