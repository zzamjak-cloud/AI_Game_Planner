// Claude(Anthropic) 분석 엔진 설정
// Haiku 계열은 web_search_20260209 도구를 지원하지 않아 제외한다.

export const CLAUDE_MODELS = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5', description: '기본 · 고품질' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', description: '빠름 · 저렴' },
  { value: 'claude-fable-5-2', label: 'Claude Fable 5.2', description: '최고 성능 · 고가' },
] as const

export const DEFAULT_CLAUDE_MODEL: string = CLAUDE_MODELS[0].value

export function normalizeClaudeModel(model: string | null | undefined): string {
  return CLAUDE_MODELS.some((m) => m.value === model) ? (model as string) : DEFAULT_CLAUDE_MODEL
}
