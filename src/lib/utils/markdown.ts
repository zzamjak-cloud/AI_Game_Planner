// 마크다운 관련 유틸리티

/**
 * 마크다운에서 게임명 추출 (기획서)
 */
export function extractGameNameFromPlanning(markdown: string): string | null {
  const match = markdown.match(/^🎮\s*\*\*(.+?)\s*게임\s*기획서\*\*/m)
  return match ? match[1].trim() : null
}

/**
 * 마크다운에서 게임명 추출 (분석 보고서)
 */
export function extractGameNameFromAnalysis(markdown: string): string | null {
  const match = markdown.match(/<!--\s*ANALYSIS_TITLE:\s*(.+?)\s*게임\s*분석\s*보고서\s*-->/m)
  return match ? match[1].trim() : null
}

/**
 * 마크다운에서 HTML 주석 제거
 */
export function removeHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 기획서에서 벤치마킹 게임명 추출
 */
export function extractBenchmarkGames(markdown: string): string[] {
  const games: string[] = []
  
  // "벤치마킹 게임:" 또는 "레퍼런스 게임:" 섹션에서 게임명 추출
  const benchmarkMatch = markdown.match(/(?:벤치마킹|레퍼런스).*?게임[:\s]*([\s\S]*?)(?=\n#|\n---|$)/i)
  if (benchmarkMatch) {
    const content = benchmarkMatch[1]
    // 리스트 항목에서 게임명 추출 (예: "- **게임명**", "- 게임명", "• 게임명")
    const gameMatches = content.match(/(?:[-•*]|\d+\.)\s*\*{0,2}([^*\n]+?)\*{0,2}(?:\s*\([^)]+\))?/g)
    if (gameMatches) {
      gameMatches.forEach(match => {
        // 마크다운 포맷 제거
        const gameName = match
          .replace(/^[-•*\d.\s]+/, '') // 리스트 마커 제거
          .replace(/\*+/g, '') // 볼드 제거
          .replace(/\s*\([^)]+\)/g, '') // 괄호 내용 제거
          .trim()
        if (gameName && gameName.length > 1 && gameName.length < 100) {
          games.push(gameName)
        }
      })
    }
  }
  
  // 중복 제거 및 정리
  return [...new Set(games)].filter(Boolean)
}

/**
 * 기획서에서 언급된 모든 게임명 추출 (벤치마킹 외에도)
 */
export function extractMentionedGames(markdown: string): string[] {
  const games: string[] = []
  
  // 벤치마킹 게임 추출
  const benchmarkGames = extractBenchmarkGames(markdown)
  games.push(...benchmarkGames)
  
  // "유사 장르의 성공작", "레퍼런스" 등의 패턴에서 게임명 추출
  const patterns = [
    /(?:유사|비슷한|참고|레퍼런스).*?게임[:\s]*([^\n]+)/gi,
    /(?:성공작|인기작|인기 게임)[:\s]*([^\n]+)/gi,
    /(?:예시|사례)[:\s]*([^\n]+)/gi,
  ]
  
  patterns.forEach(pattern => {
    const matches = markdown.matchAll(pattern)
    for (const match of matches) {
      const content = match[1]
      // 게임명 추출 (괄호, 설명 제거)
      const gameName = content
        .split(/[,/]/)[0] // 첫 번째 항목만
        .replace(/\s*\([^)]+\)/g, '') // 괄호 내용 제거
        .replace(/\*+/g, '') // 볼드 제거
        .trim()
      
      if (gameName && gameName.length > 1 && gameName.length < 100 && !games.includes(gameName)) {
        games.push(gameName)
      }
    }
  })
  
  return [...new Set(games)].filter(Boolean)
}

/**
 * 마크다운에서 Google Search 출처 참조 번호 제거
 * 예: "텍스트 ([1], [2], [3])" → "텍스트"
 * 예: "텍스트 ([1])" → "텍스트"
 */
export function removeCitationNumbers(markdown: string): string {
  // 1단계: 인용 번호 제거 (예: [1], [2, 3, 4])
  let result = markdown.replace(/\[\d+(?:,\s*\d+)*\]/g, '')

  // 2단계: 빈 괄호 또는 쉼표/공백만 있는 괄호 제거
  // 예: "텍스트 (, , , )" → "텍스트 "
  // 예: "텍스트 ()" → "텍스트 "
  result = result.replace(/\s*\([,\s]*\)/g, '')

  return result
}

