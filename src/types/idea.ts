// 딸깍(게임 아이디어 생성) 관련 타입 정의

/**
 * 딸깍 한 번으로 생성된 게임 코어 아이디어
 */
export interface GameIdea {
  id: string
  // 한 줄짜리 가제 (예: "거꾸로 떨어지는 테트리스")
  title: string
  // 코어 로직 3줄 요약 (정확히 3개)
  lines: string[]
  // 이 아이디어가 건드리는 인간 심리 (예: "손실 회피", "완벽 정리 욕구")
  hook: string
  // 생성 시 랜덤으로 뽑힌 영감 소재 (프롬프트 seed)
  inspiration: string
  // 사용자가 즐겨찾기로 표시했는지
  starred: boolean
  createdAt: number
}
