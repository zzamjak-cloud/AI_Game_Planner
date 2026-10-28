// 세션 핸들러 공통 인터페이스 및 유틸리티

import { Message } from '../../store/useAppStore'
import { PromptTemplate } from '../../types/promptTemplate'

export interface SessionHandlerContext {
  apiKey: string
  message: string
  chatHistory: Message[]
  currentContent: string
  systemPrompt: string
  template?: PromptTemplate
}

export interface SessionHandlerCallbacks {
  onChatUpdate?: (text: string) => void
  onMarkdownUpdate?: (markdown: string) => void
  onComplete?: (finalChatText: string) => void
  onError?: (error: Error) => void
}

export interface SessionHandler {
  handle: (
    context: SessionHandlerContext,
    callbacks: SessionHandlerCallbacks
  ) => Promise<void>
}

