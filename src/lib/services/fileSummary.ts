// 참고 파일 AI 요약 — 앱 전용 (llmService가 스토어에 의존하므로 mcp가 쓰는 fileOptimization과 분리)

import { GeminiContent } from '../../types/gemini'
import { SUMMARY_MAX_LENGTH } from '../utils/fileOptimization'
import { streamGenerateContent } from './llmService'

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
    
    const summary = await streamGenerateContent(apiKey, contents)
    
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
