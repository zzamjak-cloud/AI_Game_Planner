// 참조 파일 타입 정의

export interface ReferenceFile {
  id: string
  fileName: string
  filePath: string
  fileType: string
  content: string // 파싱된 텍스트 내용
  summary?: string // 파일 내용 요약 (비용 최적화용)
  metadata?: {
    pageCount?: number
    sheetCount?: number
  }
  createdAt: number
  updatedAt: number
}

