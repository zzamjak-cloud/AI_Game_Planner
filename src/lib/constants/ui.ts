// UI 관련 상수

export const CHAT_PANEL_WIDTH = {
  MIN: 20, // 최소 너비 (%)
  MAX: 80, // 최대 너비 (%)
  DEFAULT: 40, // 기본 너비 (%)
} as const

export const ZOOM_LEVEL = {
  MIN: 50, // 최소 줌 (%)
  MAX: 200, // 최대 줌 (%)
  DEFAULT: 100, // 기본 줌 (%)
  STEP: 10, // 줌 단계 (%)
} as const

export const TEXTAREA_HEIGHT = {
  MIN_LINES: 4,
  MAX_LINES: 10,
  LINE_HEIGHT: 24, // px
} as const

