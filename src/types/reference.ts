// 레퍼런스 게임 데이터베이스 타입 정의

export interface ReferenceGame {
  id: string                                 // 레퍼런스 ID
  gameName: string                           // 게임명
  originalAnalysisSessionId?: string        // 원본 분석 세션 ID (있는 경우)
  genre: string[]                            // 장르
  platform: ('ios' | 'android' | 'pc' | 'console')[]
  publisher?: string                        // 퍼블리셔
  releaseDate?: string                      // 출시일
  marketPerformance?: {                     // 시장 성과
    revenue?: string                         // 매출 추정
    ranking?: {                              // 순위
      country: string
      category: string
      position: number
    }[]
    userRating?: number                      // 평점
  }
  keyFeatures: string[]                     // 핵심 특징
  monetizationModel: string[]                // 수익화 모델
  strengths: string[]                        // 강점
  weaknesses: string[]                       // 약점
  markdownContent?: string                  // 분석 보고서 내용 (요약)
  notionPageUrl?: string                    // Notion 페이지 URL
  tags: string[]                            // 태그 (검색용)
  createdAt: number
  updatedAt: number
  isFavorite: boolean                       // 즐겨찾기 여부
}

export interface ReferenceMatch {
  reference: ReferenceGame
  matchScore: number                         // 매칭 점수 (0-100)
  matchReasons: string[]                     // 매칭 이유
  relevance: 'high' | 'medium' | 'low'      // 관련성
}

