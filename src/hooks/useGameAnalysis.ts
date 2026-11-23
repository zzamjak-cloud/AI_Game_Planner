import { Message, useAppStore } from '../store/useAppStore'
import { ClaudeRefusalError } from '../lib/services/anthropicService'
import { hasLlmKey, isClaudeActive, streamWithContinuation } from '../lib/services/llmService'
import {
  DEFAULT_ANALYSIS_PROMPT_FALLBACK,
  buildAnalysisContents,
  parseDocumentResponse,
} from '../lib/prompts/documentPrompt'
import { removeCitationNumbers } from '../lib/utils/markdown'
import { StreamingProgressTracker } from '../lib/utils/streamingProgress'
import type { GeminiStreamChunk } from '../types/gemini'
import { devLog } from '../lib/utils/logger'

// Claude는 본문 앞에 진행 설명을 붙일 수 있어, 태그가 없으면 첫 헤딩/제목 주석 앞을 버린다
function trimLeadingNarration(text: string): string {
  if (text.includes('<markdown_content>')) return text
  const start = text.search(/^(#{1,6}\s|<!--)/m)
  return start > 0 ? text.slice(start) : text
}

interface AnalysisCallbacks {
  onChatUpdate: (text: string) => void
  onMarkdownUpdate: (markdown: string) => void
  onComplete: (finalChatText: string) => void
  onError: (error: Error) => void
}

export function useGameAnalysis() {
  const analyzeGame = async (
    apiKey: string,
    message: string,
    callbacks: AnalysisCallbacks,
    chatHistory?: Message[],
    currentAnalysis?: string,
    systemPrompt?: string  // 신규: 동적 시스템 프롬프트
  ) => {
    try {
      const useClaude = isClaudeActive()

      // API Key 검증 및 정리 (Claude 키가 있으면 llmService가 그 키를 쓴다)
      const cleanApiKey = String(apiKey || '').trim()
      if (!hasLlmKey()) {
        throw new Error('API Key가 비어있습니다')
      }

      // 대화 구성: [분석 래퍼(+템플릿·현재 보고서)] → [확인 응답] → [최근 대화] → [이번 요청(중복 제외)]
      const contents = buildAnalysisContents({
        templatePrompt: systemPrompt,
        message,
        currentAnalysis,
        history: chatHistory,
      })

      // 디버그 로그 제거
      // console.log('📝 전달되는 컨텍스트:', {
      //   시스템지시문: '포함됨',
      //   현재분석내용: currentAnalysis ? '포함됨 (' + currentAnalysis.length + '자)' : '없음',
      //   대화히스토리: chatHistory?.length || 0,
      //   총메시지수: contents.length
      // })

      let fullResponse = ''

      // 진행 상황 추적기 초기화 (템플릿 프롬프트만 사용)
      const progressTracker = new StreamingProgressTracker(systemPrompt || DEFAULT_ANALYSIS_PROMPT_FALLBACK)
      devLog.log('📊 [분석] 진행 상황 추적 시작 - 헤더 개수:', progressTracker.getTotalCount())

      // 잘리면 자동으로 이어받아 재요청한다.
      const onChunk = (chunk: GeminiStreamChunk) => {
          if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
            const text = chunk.candidates[0].content.parts[0]?.text || ''
            if (text) {
              fullResponse += text
              // 로그 제거: 스트리밍 중 너무 빈번하게 출력됨
              // console.log('텍스트 수신:', text.substring(0, 50) + '...')

              // <markdown_content> 태그 파싱
              const source = useClaude ? trimLeadingNarration(fullResponse) : fullResponse
              const parts = source.split(/<markdown_content>|<\/markdown_content>/)

              let chatText = ''
              let markdownContent = ''

              if (parts.length === 1) {
                // markdown_content 태그가 없음
                // 분석 모드에서는 모든 내용을 마크다운으로 처리 (대비책)
                devLog.warn('⚠️ [분석] <markdown_content> 태그 없음 - 모든 내용을 마크다운으로 처리')
                markdownContent = removeCitationNumbers(source)

                // 진행 상황 추적
                const progressMessage = progressTracker.update(markdownContent)
                if (progressMessage) {
                  callbacks.onChatUpdate(progressMessage)
                } else {
                  callbacks.onChatUpdate(progressTracker.getLastMessage() || '게임 분석 중...')
                }

                callbacks.onMarkdownUpdate(markdownContent)
              } else if (parts.length === 2) {
                // markdown_content 태그가 열렸지만 아직 닫히지 않음
                chatText = parts[0]
                markdownContent = removeCitationNumbers(parts[1])

                // 진행 상황 추적 및 업데이트
                const progressMessage = progressTracker.update(markdownContent)
                if (progressMessage) {
                  // 헤더가 변경되었으면 진행 상황 메시지로 채팅 업데이트
                  callbacks.onChatUpdate(progressMessage)
                } else if (!chatText) {
                  // 진행 메시지가 없으면 기본 메시지 표시
                  callbacks.onChatUpdate(progressTracker.getLastMessage() || '게임 분석 중...')
                }

                callbacks.onMarkdownUpdate(markdownContent)
              } else if (parts.length >= 3) {
                // markdown_content 태그가 열리고 닫힘
                chatText = parts[0] + (parts[2] || '')
                markdownContent = removeCitationNumbers(parts[1])
                callbacks.onChatUpdate(chatText)
                callbacks.onMarkdownUpdate(markdownContent)
              }
            }
          }
        }

      const streamResult = await streamWithContinuation(cleanApiKey, contents, {
        model: useAppStore.getState().chatModel,
        tools: [{ google_search: {} }],
        onChunk,
      })

      const wasMaxTokens = streamResult.truncated
      const stoppedReason = 'stoppedReason' in streamResult ? streamResult.stoppedReason : undefined

      if (useClaude) fullResponse = trimLeadingNarration(fullResponse)

      // 최종 파싱 (태그가 없으면 전체를 분석 보고서로, 인용 번호 제거)
      const parsed = parseDocumentResponse(fullResponse, 'analysis')
      let chatText = parsed.chatText

      if (parsed.unclosed) {
        devLog.warn('⚠️ [분석 완료] 태그가 닫히지 않음 - 부분 처리')
      }

      // 최종 마크다운 업데이트
      callbacks.onMarkdownUpdate(parsed.markdown)

      // MAX_TOKENS 경고 추가
      if (wasMaxTokens) {
        const warningMessage = '\n\n⚠️ 경고: 분석 보고서가 너무 길어서 일부 내용이 잘렸을 수 있습니다. "계속 작성해줘" 또는 "마지막 항목을 완성해줘"라고 요청하세요.'
        chatText = chatText ? chatText + warningMessage : warningMessage
      }

      if (stoppedReason === 'pause_limit') {
        const pauseMessage = '\n\n⚠️ 웹 검색이 길어져 분석이 중간에 멈췄을 수 있습니다. "계속 작성해줘"라고 요청하세요.'
        chatText = chatText ? chatText + pauseMessage : pauseMessage
      }

      callbacks.onComplete(chatText)
    } catch (error) {
      console.error('OpenRouter API Error:', error)
      // 응답 도중 거부되면 스트리밍으로 채운 미리보기를 이전 상태로 되돌린다
      if (error instanceof ClaudeRefusalError) callbacks.onMarkdownUpdate(currentAnalysis ?? '')
      callbacks.onError(
        error instanceof Error ? error : new Error('알 수 없는 오류가 발생했습니다')
      )
    }
  }

  return { analyzeGame }
}
