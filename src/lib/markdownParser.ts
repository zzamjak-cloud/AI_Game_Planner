// 마크다운 파싱 유틸리티

export interface MarkdownCategory {
  header: string
  level: number
  content: string
  fullText: string // 헤더 포함 전체 텍스트
}

/**
 * 마크다운을 카테고리별로 분리
 */
export function parseMarkdownCategories(markdown: string): MarkdownCategory[] {
  const lines = markdown.split('\n')
  const categories: MarkdownCategory[] = []
  let currentCategory: MarkdownCategory | null = null
  let currentContent: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headerMatch) {
      // 이전 카테고리 저장
      if (currentCategory) {
        currentCategory.content = currentContent.join('\n')
        currentCategory.fullText = `${currentCategory.header}\n${currentCategory.content}`
        categories.push(currentCategory)
      }

      // 새 카테고리 시작
      const level = headerMatch[1].length
      const header = line
      currentCategory = {
        header,
        level,
        content: '',
        fullText: '',
      }
      currentContent = []
    } else if (currentCategory) {
      currentContent.push(line)
    }
  }

  // 마지막 카테고리 저장
  if (currentCategory) {
    currentCategory.content = currentContent.join('\n')
    currentCategory.fullText = `${currentCategory.header}\n${currentCategory.content}`
    categories.push(currentCategory)
  }

  return categories
}

/**
 * 카테고리 배열을 마크다운으로 재조합
 */
export function combineMarkdownCategories(categories: MarkdownCategory[]): string {
  return categories.map(cat => cat.fullText).join('\n\n')
}

/**
 * 간단한 해시 함수 (변경 감지용)
 */
export function simpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * 두 카테고리 배열을 비교하여 변경된 카테고리 찾기
 */
export function findChangedCategories(
  original: MarkdownCategory[],
  current: MarkdownCategory[]
): number[] {
  const changedIndices: number[] = []

  // 헤더로 매칭 (같은 헤더를 가진 카테고리 비교)
  for (let i = 0; i < current.length; i++) {
    const currentCat = current[i]
    const originalCat = original.find(cat => cat.header === currentCat.header)

    if (!originalCat) {
      // 새 카테고리
      changedIndices.push(i)
    } else {
      // 내용 비교
      const currentHash = simpleHash(currentCat.content.trim())
      const originalHash = simpleHash(originalCat.content.trim())
      if (currentHash !== originalHash) {
        changedIndices.push(i)
      }
    }
  }

  return changedIndices
}

