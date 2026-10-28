// 기획서·분석 보고서 요청 구성과 응답 파싱 (순수 함수 — React·Tauri 비의존)
//
// 앱 훅(useGeminiChat·useGameAnalysis·useMessageHandler)과 MCP 서버(mcp/)가
// 같은 프롬프트·같은 파싱 규칙을 쓰도록 한 곳에 둔다. 여기에 스토어·Tauri 의존을 넣으면 MCP 번들이 깨진다.

import { GeminiContent } from '../../types/gemini'
import { ReferenceFile } from '../../types/referenceFile'
import { SYSTEM_INSTRUCTION } from '../systemInstruction'
import { createAnalysisSystemPrompt } from '../analysisInstruction'
import { CHAT_HISTORY_LIMIT } from '../constants/api'
import { SECTIONED_MODE_OVERRIDE } from '../services/sectionedGeneration'
import { filterRelevantFiles, validateFileSize, MAX_FILE_SIZE_CHARS } from '../utils/fileOptimization'
import { removeCitationNumbers } from '../utils/markdown'

// 대화 한 턴 (스토어의 Message 와 같은 형태 — 스토어를 import 하지 않으려고 따로 둔다)
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

// 템플릿이 없을 때 분석 래퍼에 넘기는 기본 문구
export const DEFAULT_ANALYSIS_PROMPT_FALLBACK = '기본 분석 템플릿을 사용합니다.'

// 최근 대화 히스토리를 모델 대화 형식으로 변환
function historyContents(history: ChatTurn[] | undefined): GeminiContent[] {
  if (!history || history.length === 0) return []
  return history.slice(-CHAT_HISTORY_LIMIT).map((msg) => ({
    role: msg.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: msg.content }],
  }))
}

/**
 * 참조 파일 내용을 기획 시스템 프롬프트 뒤에 붙인다.
 * 사용자 메시지와 관련된 파일만 고르고, 크기에 따라 요약·일부·전체를 선택한다.
 *
 * @param systemPrompt 템플릿 프롬프트
 * @param referenceFiles 세션 참조 파일
 * @param message 이번 사용자 요청 (관련 파일 선별 기준)
 * @returns 참조 파일 섹션이 붙은 시스템 프롬프트 (붙일 파일이 없으면 원본 그대로)
 */
export function appendReferenceFiles(
  systemPrompt: string,
  referenceFiles: ReferenceFile[] | undefined,
  message: string
): string {
  if (!referenceFiles || referenceFiles.length === 0) return systemPrompt

  // 사용자 메시지와 관련된 파일만 필터링
  const relevantFiles = filterRelevantFiles(referenceFiles, message)
  if (relevantFiles.length === 0) return systemPrompt

  const referenceContent = relevantFiles.map((file, index) => {
    // 스마트 포함 전략:
    // 1. 요약이 있고 파일이 크면 요약만 사용
    // 2. 요약이 있지만 파일이 작으면 요약 + 전체 내용
    // 3. 요약이 없으면 크기 제한 적용하여 전체 내용 사용
    let content: string
    let useSummary = false
    let includeFullContent = false

    if (file.summary && file.summary.length > 0) {
      // 요약이 있는 경우
      if (file.content.length > MAX_FILE_SIZE_CHARS) {
        // 파일이 크면 요약만 사용
        content = file.summary
        useSummary = true
      } else if (file.content.length > 5000) {
        // 파일이 중간 크기면 요약 + 일부 내용
        const validation = validateFileSize(file.content)
        const truncatedContent = validation.truncated || file.content
        content = `${file.summary}\n\n---\n\n[전체 내용 일부]\n${truncatedContent}`
        useSummary = true
        includeFullContent = true
      } else {
        // 파일이 작으면 전체 내용 사용
        content = file.content
      }
    } else {
      // 요약이 없으면 크기 제한 적용하여 전체 내용 사용
      const validation = validateFileSize(file.content)
      content = validation.truncated || file.content
    }

    const sizeInfo = useSummary && file.content.length > MAX_FILE_SIZE_CHARS
      ? ` (요약 포함, 원본 ${(file.content.length / 1000).toFixed(0)}K자)`
      : includeFullContent
      ? ` (요약 + 일부 내용, 원본 ${(file.content.length / 1000).toFixed(0)}K자)`
      : file.content.length > content.length
      ? ` (${(file.content.length / 1000).toFixed(0)}K자 중 일부만 포함됨)`
      : ''

    return `[참조 파일 ${index + 1}: ${file.fileName} (${file.fileType})${sizeInfo}]\n${content}`
  }).join('\n\n---\n\n')

  const fileCountInfo = referenceFiles.length > relevantFiles.length
    ? `\n(참고: 총 ${referenceFiles.length}개 참조 파일 중 사용자 요청과 관련된 ${relevantFiles.length}개만 포함했습니다)`
    : ''

  return `${systemPrompt}\n\n---\n\n# 참조 파일${fileCountInfo}\n다음 참조 파일들의 내용을 참고하여 기획서를 작성하세요. 이 파일들의 내용을 분석하고 기획서에 반영하세요.\n\n${referenceContent}`
}

export interface PlanningRequest {
  // 템플릿 프롬프트 (참조 파일이 붙은 상태). 없으면 기본 시스템 지시문
  systemPrompt?: string
  // 이번 사용자 요청
  message: string
  // 현재 기획서 (수정 요청일 때)
  currentMarkdown?: string
  // 이전 대화 (최근 CHAT_HISTORY_LIMIT 개만 쓴다)
  history?: ChatTurn[]
}

/**
 * 기획 대화 내용을 구성한다: [시스템 지시문(+현재 기획서)] → [확인 응답] → [최근 대화] → [이번 요청]
 */
export function buildPlanningContents(request: PlanningRequest): GeminiContent[] {
  // 1. 시스템 지시문 (동적 프롬프트 지원)
  let systemMessage = request.systemPrompt || SYSTEM_INSTRUCTION

  // 2. 현재 기획서가 있으면 시스템 메시지에 포함
  if (request.currentMarkdown && request.currentMarkdown.trim()) {
    systemMessage += `\n\n---\n\n# 현재 작성된 기획서\n아래는 현재까지 작성된 기획서입니다. 수정 요청이 들어오면 이 내용을 기반으로 요청된 부분만 수정하고 나머지는 그대로 유지하십시오.\n\n<current_markdown>\n${request.currentMarkdown}\n</current_markdown>`
  }

  return [
    { role: 'user', parts: [{ text: systemMessage }] },
    { role: 'model', parts: [{ text: '네, 이해했습니다. 게임 기획 전문가로서 도와드리겠습니다.' }] },
    // 3. 이전 대화 히스토리
    ...historyContents(request.history),
    // 4. 현재 사용자 메시지
    { role: 'user', parts: [{ text: request.message }] },
  ]
}

/**
 * 섹션 분할 모드: 첫 메시지(시스템 지시문) 뒤에 "전체 재출력" 규칙 무효화 지시를 덧붙인다.
 */
export function withSectionedOverride(contents: GeminiContent[]): GeminiContent[] {
  return contents.map((content, index) =>
    index === 0
      ? {
          ...content,
          parts: [
            {
              text: `${content.parts[0]?.text || ''}

${SECTIONED_MODE_OVERRIDE}`,
            },
          ],
        }
      : content
  )
}

export interface AnalysisRequest {
  // 분석 템플릿 프롬프트 (없으면 기본 문구)
  templatePrompt?: string
  // 이번 사용자 요청 (보통 게임명)
  message: string
  // 현재 분석 보고서 (수정 요청일 때)
  currentAnalysis?: string
  // 이전 대화
  history?: ChatTurn[]
}

/**
 * 분석 대화 내용을 구성한다: [분석 래퍼(+템플릿·현재 보고서)] → [확인 응답] → [최근 대화] → [이번 요청]
 * 히스토리 마지막이 같은 사용자 메시지면 중복으로 넣지 않는다.
 */
export function buildAnalysisContents(request: AnalysisRequest): GeminiContent[] {
  const systemMessage = createAnalysisSystemPrompt(
    request.templatePrompt || DEFAULT_ANALYSIS_PROMPT_FALLBACK,
    request.currentAnalysis
  )

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemMessage }] },
    { role: 'model', parts: [{ text: '네, 이해했습니다. 게임 분석 전문가로서 도와드리겠습니다.' }] },
    ...historyContents(request.history),
  ]

  const lastHistory = request.history?.[request.history.length - 1]
  const messageAlreadyInHistory = lastHistory?.role === 'user' && lastHistory.content === request.message

  if (!messageAlreadyInHistory) {
    contents.push({ role: 'user', parts: [{ text: request.message }] })
  }

  return contents
}

export type DocumentKind = 'planning' | 'analysis'

export interface ParsedDocumentResponse {
  // 태그 밖 대화 텍스트
  chatText: string
  // 태그 안 문서 본문 (없으면 빈 문자열)
  markdown: string
  // <markdown_content> 가 열렸지만 닫히지 않았는지
  unclosed: boolean
}

/**
 * 완료된 응답 전체를 대화 텍스트와 문서 본문으로 나눈다.
 * - 태그가 없으면: 분석은 전체를 문서로, 기획은 100자 초과일 때만 문서로 본다
 * - 분석 문서는 검색 인용 번호([1] 등)를 지운다
 */
export function parseDocumentResponse(fullResponse: string, kind: DocumentKind): ParsedDocumentResponse {
  const clean = (text: string) => (kind === 'analysis' ? removeCitationNumbers(text) : text)
  const parts = fullResponse.split(/<markdown_content>|<\/markdown_content>/)

  if (parts.length === 1) {
    if (kind === 'analysis') {
      return { chatText: '게임 분석이 완료되었습니다.', markdown: clean(fullResponse), unclosed: false }
    }
    if (fullResponse.trim().length > 100) {
      return { chatText: '기획서 작성이 완료되었습니다.', markdown: fullResponse, unclosed: false }
    }
    return { chatText: fullResponse, markdown: '', unclosed: false }
  }

  if (parts.length === 2) {
    // 태그가 열렸지만 닫히지 않은 경우
    return { chatText: parts[0], markdown: clean(parts[1]), unclosed: true }
  }

  // 태그가 열리고 닫힘 — 태그 밖의 내용은 대화로 처리
  return { chatText: parts[0] + (parts[2] || ''), markdown: clean(parts[1]), unclosed: false }
}
