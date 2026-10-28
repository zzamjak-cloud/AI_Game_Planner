// 체크리스트 및 피드백 타입 정의

export enum ChecklistCategory {
  MARKET_ANALYSIS = 'market_analysis',      // 시장 분석
  GAME_DESIGN = 'game_design',              // 게임 디자인
  MONETIZATION = 'monetization',          // 수익화
  BALANCING = 'balancing',                  // 밸런싱
  RETENTION = 'retention',                  // 리텐션
  TECHNICAL = 'technical',                  // 기술적 요구사항
  COMPLETENESS = 'completeness',            // 완성도
}

export interface ChecklistItem {
  id: string
  category: ChecklistCategory
  title: string
  description: string
  required: boolean                          // 필수 항목 여부
  checked: boolean
  feedback?: string                         // AI 피드백
  suggestions?: string[]                    // 개선 제안
}

export interface ChecklistResult {
  category: ChecklistCategory
  items: ChecklistItem[]
  score: number                              // 0-100 점수
  totalItems: number
  checkedItems: number
  requiredItems: number
  checkedRequiredItems: number
}

export interface DocumentValidation {
  overallScore: number                       // 전체 완성도 점수 (0-100)
  results: ChecklistResult[]
  criticalIssues: ChecklistItem[]           // 필수 항목 중 미완료
  recommendations: string[]                 // AI 추천 사항
  lastValidatedAt: number
}

