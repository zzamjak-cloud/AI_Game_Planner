// 파일 최적화 유틸리티 함수

import { ReferenceFile } from '../../types/referenceFile'
import { openRouterService } from '../services/openRouterService'
import { GeminiContent } from '../../types/gemini'

/**
 * 파일 크기 제한 상수 (토큰 기준으로 대략 계산)
 * 1 토큰 ≈ 4자 (한글 기준)
 */
export const MAX_FILE_SIZE_CHARS = 100000 // 10만자 (약 25,000 토큰)
export const MAX_REFERENCE_FILES = 3 // 최대 포함할 참조 파일 개수
export const MAX_ATTACHED_FILES = 2 // 최대 포함할 첨부 파일 개수
export const SUMMARY_MAX_LENGTH = 500 // 요약 최대 길이 (자)

/**
 * 사용자 메시지에서 키워드 추출
 */
export function extractKeywords(message: string): string[] {
  // 불용어 제거
  const stopWords = ['을', '를', '이', '가', '은', '는', '의', '에', '에서', '로', '으로', '와', '과', '도', '만', '까지', '부터', '에게', '께', '한테', '더', '또', '그리고', '또는', '하지만', '그런데', '그래서', '그러나', '그러면', '그렇다면', '이렇게', '그렇게', '저렇게', '이것', '그것', '저것', '이런', '그런', '저런', '이렇게', '그렇게', '저렇게']
  
  // 문장 부호 제거 및 소문자 변환
  const cleaned = message
    .toLowerCase()
    .replace(/[.,!?;:()\[\]{}'"]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1) // 1글자 단어 제외
  
  // 불용어 제거 및 고유 키워드만 반환
  const keywords = [...new Set(cleaned.filter(word => !stopWords.includes(word)))]
  
  return keywords.slice(0, 10) // 최대 10개 키워드
}

/**
 * 파일 관련성 점수 계산
 */
export function calculateRelevanceScore(
  file: ReferenceFile,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0.5 // 키워드가 없으면 중간 점수
  
  let score = 0
  const fileName = file.fileName.toLowerCase()
  const fileContent = file.content.toLowerCase()
  const fileSummary = (file.summary || '').toLowerCase()
  
  // 파일명 매칭 (높은 가중치)
  const fileNameMatches = keywords.filter(keyword => fileName.includes(keyword)).length
  score += fileNameMatches * 2
  
  // 요약 매칭 (중간 가중치)
  if (fileSummary) {
    const summaryMatches = keywords.filter(keyword => fileSummary.includes(keyword)).length
    score += summaryMatches * 1.5
  }
  
  // 내용 매칭 (낮은 가중치, 하지만 빈도 고려)
  keywords.forEach(keyword => {
    const contentMatches = (fileContent.match(new RegExp(keyword, 'g')) || []).length
    score += Math.min(contentMatches * 0.1, 1) // 최대 1점
  })
  
  return score / keywords.length // 평균 점수
}

/**
 * 파일이 사용자 메시지와 관련이 있는지 확인 (레거시 호환성)
 */
export function isFileRelevant(file: ReferenceFile, keywords: string[]): boolean {
  return calculateRelevanceScore(file, keywords) >= 0.1
}

/**
 * 관련 파일만 필터링하여 반환 (점수 기반 정렬)
 */
export function filterRelevantFiles(
  files: ReferenceFile[],
  userMessage: string,
  maxFiles: number = MAX_REFERENCE_FILES
): ReferenceFile[] {
  if (files.length === 0) return []
  
  const keywords = extractKeywords(userMessage)
  
  // 모든 파일에 점수 부여
  const filesWithScores = files.map(file => ({
    file,
    score: calculateRelevanceScore(file, keywords)
  }))
  
  // 점수 순으로 정렬
  filesWithScores.sort((a, b) => b.score - a.score)
  
  // 점수가 0.1 이상인 파일만 필터링 (너무 낮은 점수 제외)
  const relevantFiles = filesWithScores
    .filter(item => item.score >= 0.1)
    .map(item => item.file)
  
  // 관련 파일이 없거나 적으면 상위 N개 반환
  if (relevantFiles.length === 0 || relevantFiles.length < maxFiles) {
    return filesWithScores.slice(0, maxFiles).map(item => item.file)
  }
  
  // 관련 파일이 많으면 최대 개수만 반환
  return relevantFiles.slice(0, maxFiles)
}

/**
 * 파일 내용을 토큰 수 기준으로 자르기
 * 대략적인 계산: 1 토큰 ≈ 4자 (한글 기준)
 */
export function truncateFileContent(
  content: string,
  maxChars: number = MAX_FILE_SIZE_CHARS
): string {
  if (content.length <= maxChars) {
    return content
  }
  
  // 문장 단위로 자르기 (마지막 문장이 잘리지 않도록)
  const truncated = content.substring(0, maxChars)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('\n')
  )
  
  if (lastSentenceEnd > maxChars * 0.8) {
    return truncated.substring(0, lastSentenceEnd + 1) + '\n\n[내용이 잘렸습니다. 전체 내용은 파일에서 확인하세요.]'
  }
  
  return truncated + '\n\n[내용이 잘렸습니다. 전체 내용은 파일에서 확인하세요.]'
}

/**
 * 파일 크기 검증
 */
export function validateFileSize(content: string): {
  valid: boolean
  truncated?: string
  originalSize: number
} {
  const originalSize = content.length
  
  if (originalSize <= MAX_FILE_SIZE_CHARS) {
    return { valid: true, originalSize }
  }
  
  return {
    valid: false,
    truncated: truncateFileContent(content),
    originalSize
  }
}

/**
 * 파일 내용 요약 생성 (AI 사용)
 */
export async function generateFileSummary(
  content: string,
  fileName: string,
  apiKey: string
): Promise<string> {
  try {
    // 내용이 너무 짧으면 요약 불필요
    if (content.length < 500) {
      return content
    }
    
    // 내용이 너무 길면 앞부분만 사용하여 요약
    const contentToSummarize = content.length > 50000 
      ? content.substring(0, 50000) + '\n\n[... 중간 생략 ...]'
      : content
    
    const prompt = `다음 파일의 내용을 ${SUMMARY_MAX_LENGTH}자 이내로 요약해주세요. 주요 내용과 핵심 포인트를 포함하세요.

파일명: ${fileName}

파일 내용:
${contentToSummarize}

요약:`
    
    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
    
    const summary = await openRouterService.streamGenerateContent(apiKey, contents)
    
    // 요약 길이 제한
    return summary.length > SUMMARY_MAX_LENGTH 
      ? summary.substring(0, SUMMARY_MAX_LENGTH) + '...'
      : summary
  } catch (error) {
    console.error('파일 요약 생성 실패:', error)
    // 요약 실패 시 간단한 요약 반환
    return content.length > SUMMARY_MAX_LENGTH
      ? content.substring(0, SUMMARY_MAX_LENGTH) + '...'
      : content
  }
}

/**
 * 간단한 텍스트 기반 요약 생성 (AI 없이)
 */
export function generateSimpleSummary(content: string, maxLength: number = SUMMARY_MAX_LENGTH): string {
  if (content.length <= maxLength) {
    return content
  }
  
  // 첫 문단과 마지막 문단을 포함한 요약
  const lines = content.split('\n').filter(line => line.trim().length > 0)
  
  if (lines.length <= 3) {
    return content.substring(0, maxLength) + '...'
  }
  
  const firstPart = lines.slice(0, 2).join('\n')
  const lastPart = lines.slice(-2).join('\n')
  const summary = `${firstPart}\n\n[... 중간 생략 ...]\n\n${lastPart}`
  
  return summary.length > maxLength
    ? summary.substring(0, maxLength) + '...'
    : summary
}

