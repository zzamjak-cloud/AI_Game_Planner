// 설정 관리 슬라이스

import { StateCreator } from 'zustand'
import { DEFAULT_CHAT_MODEL, normalizeChatModel, type ChatModel } from '../../lib/constants/api'
import { DEFAULT_CLAUDE_MODEL, normalizeClaudeModel } from '../../lib/constants/claude'
import { DEFAULT_QUICKNOTE_MCP_URL } from '../../lib/constants/quicknote'


export interface SettingsSlice {
  // 앱 설정 상태
  apiKey: string | null
  chatModel: ChatModel
  anthropicApiKey: string | null
  claudeModel: string
  quickNoteToken: string | null
  quickNoteMcpUrl: string
  quickNotePlanningDatabaseId: string | null
  quickNoteAnalysisDatabaseId: string | null
  quickNoteIdeaDatabaseId: string | null
  // 용도(planning/analysis/idea) → 표시용 데이터베이스 제목
  quickNoteDatabaseTitles: Record<string, string>
  isLoading: boolean

  // 설정 관리 메서드
  setApiKey: (key: string | null) => void
  setChatModel: (model: string | null | undefined) => void
  setAnthropicApiKey: (key: string | null) => void
  setClaudeModel: (model: string | null | undefined) => void
  setQuickNoteToken: (token: string | null) => void
  setQuickNoteMcpUrl: (url: string | null | undefined) => void
  setQuickNotePlanningDatabaseId: (id: string | null) => void
  setQuickNoteAnalysisDatabaseId: (id: string | null) => void
  setQuickNoteIdeaDatabaseId: (id: string | null) => void
  setQuickNoteDatabaseTitles: (titles: Record<string, string> | null | undefined) => void
  setIsLoading: (loading: boolean) => void
}

export const createSettingsSlice: StateCreator<
  SettingsSlice,
  [],
  [],
  SettingsSlice
> = (set) => ({
  // 초기 상태
  apiKey: null,
  chatModel: DEFAULT_CHAT_MODEL,
  anthropicApiKey: null,
  claudeModel: DEFAULT_CLAUDE_MODEL,
  quickNoteToken: null,
  quickNoteMcpUrl: DEFAULT_QUICKNOTE_MCP_URL,
  quickNotePlanningDatabaseId: null,
  quickNoteAnalysisDatabaseId: null,
  quickNoteIdeaDatabaseId: null,
  quickNoteDatabaseTitles: {},
  isLoading: false,

  // API Key 설정
  setApiKey: (key) => set({ apiKey: key }),

  // 채팅에 사용할 AI 모델 설정
  setChatModel: (model) => set({ chatModel: normalizeChatModel(model) }),

  setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),
  setClaudeModel: (model) => set({ claudeModel: normalizeClaudeModel(model) }),
  setQuickNoteToken: (token) => set({ quickNoteToken: token }),
  setQuickNoteMcpUrl: (url) => set({ quickNoteMcpUrl: url?.trim() || DEFAULT_QUICKNOTE_MCP_URL }),
  setQuickNotePlanningDatabaseId: (id) => set({ quickNotePlanningDatabaseId: id }),
  setQuickNoteAnalysisDatabaseId: (id) => set({ quickNoteAnalysisDatabaseId: id }),
  setQuickNoteIdeaDatabaseId: (id) => set({ quickNoteIdeaDatabaseId: id }),
  setQuickNoteDatabaseTitles: (titles) => set({ quickNoteDatabaseTitles: titles ?? {} }),

  // 로딩 상태
  setIsLoading: (loading) => set({ isLoading: loading }),
})
