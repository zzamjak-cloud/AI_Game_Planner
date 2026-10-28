// 버전 관리 타입 정의

export interface DocumentVersion {
  id: string                    // 버전 ID (version-{timestamp}-{random})
  versionNumber: number         // 버전 번호 (1, 2, 3...)
  markdownContent: string       // 해당 버전의 기획서 내용
  messages: Array<{              // 해당 버전까지의 대화 히스토리
    role: 'user' | 'assistant'
    content: string
  }>
  createdAt: number              // 버전 생성 시간
  createdBy: 'user' | 'ai'      // 버전 생성 주체
  description?: string          // 버전 설명 (사용자가 입력)
  changeSummary?: string        // 변경 사항 요약 (AI가 생성)
}

export interface VersionDiff {
  added: string[]               // 추가된 섹션/내용
  removed: string[]             // 삭제된 섹션/내용
  modified: Array<{              // 수정된 섹션
    section: string
    before: string
    after: string
  }>
}

