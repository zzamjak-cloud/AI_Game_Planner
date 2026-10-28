// 스트리밍 진행 상황 추적 유틸리티

import { devLog } from './logger'

/**
 * 마크다운 템플릿에서 헤더(## 또는 ###) 목록 추출
 */
export function extractHeaders(template: string): string[] {
  const headers: string[] = []
  const lines = template.split('\n')

  for (const line of lines) {
    // #, ##, ### 로 시작하는 헤더 추출
    const match = line.match(/^#{1,3}\s+(.+)$/)
    if (match) {
      let headerText = match[1].trim()

      // **볼드** 마크다운 제거
      headerText = headerText.replace(/\*\*/g, '')

      // HTML 태그 제거
      headerText = headerText.replace(/<[^>]+>/g, '')

      headers.push(headerText)
    }
  }

  devLog.log('📋 추출된 헤더 목록:', headers)
  return headers
}

/**
 * 현재 스트리밍된 마크다운에서 작성 중인 헤더 감지
 */
export function detectCurrentHeader(markdownContent: string, headers: string[]): {
  currentHeader: string | null
  currentIndex: number
  totalCount: number
} {
  const lines = markdownContent.split('\n')
  let lastDetectedHeader: string | null = null
  let lastDetectedIndex = -1

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)$/)
    if (match) {
      let headerText = match[1].trim()

      // **볼드** 마크다운 제거
      headerText = headerText.replace(/\*\*/g, '')

      // HTML 태그 제거
      headerText = headerText.replace(/<[^>]+>/g, '').trim()

      // 헤더 목록에서 찾기 (더 유연한 매칭)
      const index = headers.findIndex(h => {
        const normalizedHeader = h.toLowerCase().trim()
        const normalizedText = headerText.toLowerCase().trim()

        // 정확히 일치하거나 포함 관계
        return normalizedHeader === normalizedText ||
               normalizedText.includes(normalizedHeader) ||
               normalizedHeader.includes(normalizedText)
      })

      if (index !== -1) {
        lastDetectedHeader = headers[index]
        lastDetectedIndex = index
        devLog.log('✅ 헤더 매칭:', lastDetectedHeader, `(${index + 1}/${headers.length})`)
      }
    }
  }

  return {
    currentHeader: lastDetectedHeader,
    currentIndex: lastDetectedIndex,
    totalCount: headers.length
  }
}

/**
 * 진행 상황 메시지 생성
 */
export function generateProgressMessage(
  currentHeader: string | null,
  currentIndex: number,
  totalCount: number
): string {
  if (currentIndex === -1 || !currentHeader) {
    return '기획서 작성 시작 중...'
  }

  const progress = `(${currentIndex + 1}/${totalCount})`
  return `${currentHeader} 작성 중... ${progress}`
}

/**
 * 스트리밍 진행 상황 추적 헬퍼
 */
export class StreamingProgressTracker {
  private headers: string[]
  private lastDetectedIndex: number = -1
  private lastProgressMessage: string = ''

  constructor(template: string) {
    this.headers = extractHeaders(template)
  }

  /**
   * 마크다운 업데이트 시 호출하여 진행 상황 확인
   * 헤더가 변경되었을 때만 새 메시지 반환
   */
  update(markdownContent: string): string | null {
    const { currentHeader, currentIndex, totalCount } = detectCurrentHeader(
      markdownContent,
      this.headers
    )

    // 헤더가 변경되었을 때만 메시지 업데이트
    if (currentIndex !== this.lastDetectedIndex) {
      this.lastDetectedIndex = currentIndex
      this.lastProgressMessage = generateProgressMessage(
        currentHeader,
        currentIndex,
        totalCount
      )
      return this.lastProgressMessage
    }

    return null // 변경 없음
  }

  /**
   * 마지막 진행 상황 메시지 반환
   */
  getLastMessage(): string {
    return this.lastProgressMessage
  }

  /**
   * 전체 헤더 개수 반환
   */
  getTotalCount(): number {
    return this.headers.length
  }
}
