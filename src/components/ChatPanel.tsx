import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { useAppStore, SessionType } from '../store/useAppStore'
import { AnalysisResult } from './AnalysisResult'

interface ChatPanelProps {
  onSendMessage: (message: string) => void
  currentAssistantMessage?: string
}

export function ChatPanel({ onSendMessage, currentAssistantMessage }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isLoading } = useAppStore()

  // 현재 세션만 선택적으로 구독 (다른 세션 변경 시 리렌더링 방지)
  const currentSession = useAppStore(state =>
    state.sessions.find(s => s.id === state.currentSessionId)
  )

  const isAnalysisMode = currentSession?.type === SessionType.ANALYSIS

  // messages는 현재 세션에서 직접 가져와서 동기화 보장
  const messages = currentSession?.messages || []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // textarea 높이 자동 조절
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // 높이를 초기화하여 scrollHeight를 정확하게 측정
    textarea.style.height = 'auto'

    // 내용에 맞춰 높이 조절 (최소 4줄, 최대 10줄)
    const lineHeight = 24 // px
    const minHeight = lineHeight * 4
    const maxHeight = lineHeight * 10
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)

    textarea.style.height = `${newHeight}px`
  }, [input])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter로 전송
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!currentSession ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">세션이 없습니다</p>
              <p className="text-sm">
                사이드바의 <span className="font-semibold">+</span> 버튼을 클릭하여 새 세션을 생성해주세요
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              {isAnalysisMode ? (
                <>
                  <p className="text-lg font-medium mb-2">게임 분석을 시작하세요</p>
                  <p className="text-sm">
                    분석할 게임명을 입력하면 AI가 상세한 분석 보고서를 작성해드립니다
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">게임 기획서 작성을 시작하세요</p>
                  <p className="text-sm">
                    게임 아이디어를 입력하면 AI가 상세한 기획서를 작성해드립니다
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-gray-400 dark:bg-gray-600 text-white'
                    : 'bg-muted'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && currentAssistantMessage && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2 max-w-[80%]">
              <p className="whitespace-pre-wrap">{currentAssistantMessage}</p>
            </div>
          </div>
        )}
        {isLoading && !currentAssistantMessage && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}

        {/* 분석 결과 표시 (분석 모드 전용) */}
        {isAnalysisMode && currentSession && (
          <AnalysisResult
            sessionId={currentSession.id}
            gameName={currentSession.gameName}
            notionPageUrl={currentSession.notionPageUrl}
            analysisStatus={currentSession.analysisStatus}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !currentSession
                  ? '+ 버튼을 클릭하여 새 세션을 생성해주세요'
                  : isAnalysisMode
                  ? '게임명을 입력하세요. 예시 Brawl Stars, Royale Match (Ctrl/Cmd + Enter로 전송)'
                  : '게임 아이디어를 입력하세요... (Ctrl/Cmd + Enter로 전송)'
              }
              className="w-full px-4 py-3 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none overflow-y-auto"
              style={{ minHeight: '96px' }}
              disabled={isLoading || !currentSession}
            />
          </div>
          
          {/* 전송 버튼 */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !currentSession}
            className="px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
