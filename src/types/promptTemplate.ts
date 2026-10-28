// 템플릿 타입 정의

export enum TemplateType {
  PLANNING = 'planning',  // 기획 세션용 템플릿
  ANALYSIS = 'analysis',  // 분석 세션용 템플릿
}

export interface PromptTemplate {
  id: string                      // 고유 ID (template-{timestamp}-{random})
  name: string                    // 사용자 정의 템플릿 이름
  type: TemplateType              // 템플릿 타입
  content: string                 // 마크다운 형식의 프롬프트 내용 (현재 언어)
  isDefault: boolean              // 기본 템플릿 여부 (true면 삭제/이름변경 불가)
  createdAt: number               // 생성 시간
  updatedAt: number               // 수정 시간
  description?: string            // 템플릿 설명 (선택)
  language?: 'ko' | 'en'         // 템플릿 언어 (번역 기능용)
  translatedContent?: string     // 번역된 내용 캐시 (영어일 경우 한국어, 한국어일 경우 영어)
  contentHash?: string            // 컨텐츠 해시 (변경 감지용)
  translatedContentHash?: string  // 번역된 컨텐츠 해시 (변경 감지용)
}
