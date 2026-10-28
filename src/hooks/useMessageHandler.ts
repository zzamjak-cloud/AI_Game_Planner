// 메시지 처리 로직을 담당하는 커스텀 훅

import { useAppStore, SessionType } from '../store/useAppStore'
import { useGeminiChat } from './useGeminiChat'
import { useGameAnalysis } from './useGameAnalysis'
import { SYSTEM_INSTRUCTION } from '../lib/systemInstruction'
import { appendReferenceFiles } from '../lib/prompts/documentPrompt'
import { saveSessionImmediately } from '../lib/utils/sessionSave'
import { devLog } from '../lib/utils/logger'
import { handleError } from '../lib/errorHandler'

interface MessageHandlerCallbacks {
  onChatUpdate?: (text: string) => void
  onMarkdownUpdate?: (markdown: string) => void
  onComplete?: (finalChatText: string) => void
  onError?: (error: Error) => void
}

export function useMessageHandler() {
  const {
    apiKey,
    addMessage,
    setMarkdownContent,
    setIsLoading,
    updateAnalysisStatus,
    getTemplateById,
    currentPlanningTemplateId,
    currentAnalysisTemplateId,
  } = useAppStore()

  const { sendMessage } = useGeminiChat()
  const { analyzeGame } = useGameAnalysis()

  const handleSendMessage = async (
    message: string,
    callbacks: MessageHandlerCallbacks = {}
  ) => {
    if (!apiKey) {
      throw new Error('API Key를 먼저 설정해주세요')
    }

    // 세션이 없으면 에러 발생 (자동 생성 제거)
    const store = useAppStore.getState()
    if (!store.currentSessionId || store.sessions.length === 0) {
      throw new Error('세션이 없습니다. + 버튼을 클릭하여 새 세션을 생성해주세요.')
    }

    // 현재 상태 가져오기
    const currentState = useAppStore.getState()
    const currentSession = currentState.sessions.find(s => s.id === currentState.currentSessionId)

    // 디버그 로그 제거
    // console.log('📋 현재 세션 정보:', {
    //   sessionId: currentSession?.id,
    //   sessionType: currentSession?.type,
    //   sessionTitle: currentSession?.title,
    //   currentSessionType: currentState.currentSessionType
    // })

    // 분석 모드인 경우
    if (currentSession?.type === SessionType.ANALYSIS) {
      return handleAnalysisMessage(
        message,
        currentSession,
        currentState,
        callbacks
      )
    }

    // 기획 모드인 경우
    return handlePlanningMessage(
      message,
      currentSession,
      currentState,
      callbacks
    )
  }

  const handleAnalysisMessage = async (
    message: string,
    currentSession: ReturnType<typeof useAppStore.getState>['sessions'][0],
    currentState: ReturnType<typeof useAppStore.getState>,
    callbacks: MessageHandlerCallbacks
  ) => {
    // 디버그 로그 제거
    // console.log('🔍 분석 모드로 실행')

    // 현재 상태 가져오기 (메시지 추가 전)
    const chatHistory = [...currentState.messages] // 현재까지의 대화 히스토리
    const currentAnalysisContent = currentState.markdownContent // 현재 분석 내용

    // 템플릿 기반 시스템 프롬프트 로드
    const template = getTemplateById(currentSession.templateId || currentAnalysisTemplateId || 'default-analysis')
    const systemPrompt = template?.content || ''

    // 디버그 로그 제거
    // console.log('📋 사용 중인 분석 템플릿:', template?.name || '기본 분석 템플릿')

    // 세션 생성 시 이미 추가된 사용자 메시지와 중복되지 않도록 처리
    const lastMessage = currentState.messages[currentState.messages.length - 1]
    const isDuplicateUserMessage =
      lastMessage?.role === 'user' && lastMessage.content === message

    if (!isDuplicateUserMessage) {
      addMessage({ role: 'user', content: message })
    }
    setIsLoading(true)

    // 분석 상태 업데이트
    updateAnalysisStatus(currentSession.id, 'running')

    try {
      // 대화 히스토리와 현재 분석 내용, 템플릿 프롬프트를 함께 전달
      await analyzeGame(
        apiKey!,
        message,
        {
          onChatUpdate: (text) => {
            callbacks.onChatUpdate?.(text)
          },
          onMarkdownUpdate: (markdown) => {
            setMarkdownContent(markdown)
            callbacks.onMarkdownUpdate?.(markdown)
            // 마크다운 업데이트 시 즉시 저장 (중요한 변화 지점)
            saveSessionImmediately().catch(err => console.error('마크다운 업데이트 저장 실패:', err))
          },
          onComplete: async (finalChatText) => {
            updateAnalysisStatus(currentSession.id, 'completed')
            if (finalChatText.trim()) {
              addMessage({ role: 'assistant', content: finalChatText })
            }
            setIsLoading(false)
            // 분석 완료 후 즉시 세션 저장
            await saveSessionImmediately()
            callbacks.onComplete?.(finalChatText)
          },
          onError: (error) => {
            console.error('분석 오류:', error)
            updateAnalysisStatus(currentSession.id, 'failed')
            const userMessage = handleError(error).userMessage
            addMessage({
              role: 'assistant',
              content: `분석 중 오류가 발생했습니다: ${userMessage}`,
            })
            setIsLoading(false)
            callbacks.onError?.(error)
          },
        },
        chatHistory, // 대화 히스토리 전달
        currentAnalysisContent, // 현재 분석 내용 전달
        systemPrompt // 템플릿 프롬프트 전달
      )
    } catch (error) {
      console.error('분석 실행 오류:', error)
      updateAnalysisStatus(currentSession.id, 'failed')
      setIsLoading(false)
      callbacks.onError?.(error instanceof Error ? error : new Error('알 수 없는 오류가 발생했습니다'))
    }
  }

  const handlePlanningMessage = async (
    message: string,
    currentSession: ReturnType<typeof useAppStore.getState>['sessions'][0] | undefined,
    currentState: ReturnType<typeof useAppStore.getState>,
    callbacks: MessageHandlerCallbacks
  ) => {
    devLog.log('📝 기획 모드 실행')
    
    const chatHistory = [...currentState.messages] // 현재까지의 대화 히스토리
    const currentMarkdownContent = currentState.markdownContent // 현재 기획서

    // 템플릿 기반 시스템 프롬프트 로드
    const template = getTemplateById(currentSession?.templateId || currentPlanningTemplateId || 'default-planning')
    let systemPrompt = template?.content || SYSTEM_INSTRUCTION

    // 참조 파일이 있으면 시스템 프롬프트에 추가 (최적화: 관련 파일만 필터링, 요약 우선 사용)
    systemPrompt = appendReferenceFiles(systemPrompt, currentSession?.referenceFiles, message)

    // 디버그 로그 제거
    // console.log('📋 사용 중인 기획 템플릿:', template?.name || '기본 기획 템플릿')
    // if (currentSession?.referenceFiles && currentSession.referenceFiles.length > 0) {
    //   console.log('📎 참조 파일 개수:', currentSession.referenceFiles.length)
    // }

    // 사용자 메시지 추가
    addMessage({ role: 'user', content: message })
    setIsLoading(true)

    try {
      // 대화 히스토리와 현재 마크다운, 템플릿 프롬프트를 함께 전달
      await sendMessage(
        apiKey!,
        message,
        {
          onChatUpdate: (text) => {
            callbacks.onChatUpdate?.(text)
          },
          onMarkdownUpdate: (markdown) => {
            setMarkdownContent(markdown)
            callbacks.onMarkdownUpdate?.(markdown)
            // 마크다운 업데이트 시 즉시 저장 (중요한 변화 지점)
            saveSessionImmediately().catch(err => console.error('마크다운 업데이트 저장 실패:', err))
          },
          onComplete: async (finalChatText) => {
            if (finalChatText.trim()) {
              addMessage({ role: 'assistant', content: finalChatText })
            }
            setIsLoading(false)
            // 채팅 완료 후 즉시 세션 저장
            await saveSessionImmediately()
            callbacks.onComplete?.(finalChatText)
          },
          onError: (error) => {
            console.error('OpenRouter API Error:', error)
            const userMessage = handleError(error).userMessage
            addMessage({
              role: 'assistant',
              content: `오류가 발생했습니다: ${userMessage}`,
            })
            setIsLoading(false)
            callbacks.onError?.(error)
          },
        },
        chatHistory, // 대화 히스토리 전달
        currentMarkdownContent, // 현재 기획서 전달
        systemPrompt // 템플릿 프롬프트 전달
      )
    } catch (error) {
      console.error('Error:', error)
      addMessage({
        role: 'assistant',
        content: '오류가 발생했습니다. 다시 시도해주세요.',
      })
      setIsLoading(false)
      callbacks.onError?.(error instanceof Error ? error : new Error('알 수 없는 오류가 발생했습니다'))
    }
  }

  return { handleSendMessage }
}

