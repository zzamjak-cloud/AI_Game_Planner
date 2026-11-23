// Store 관련 타입 정의

import { ChatSession } from '../store/useAppStore'
import { PromptTemplate } from './promptTemplate'
import { GameIdea } from './idea'

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export interface Settings {
  openRouterApiKey?: string | null
  chatSessions?: ChatSession[]
  promptTemplates?: PromptTemplate[]
  currentPlanningTemplateId?: string | null
  currentAnalysisTemplateId?: string | null
  windowState?: WindowState
  ideas?: GameIdea[]
  chatModel?: string | null
  anthropicApiKey?: string | null
  claudeModel?: string | null
  quickNoteToken?: string | null
  quickNoteMcpUrl?: string | null
  quickNotePlanningDatabaseId?: string | null
  quickNoteAnalysisDatabaseId?: string | null
  quickNoteIdeaDatabaseId?: string | null
  quickNoteDatabaseTitles?: Record<string, string> | null
}

export interface SaveSettingsParams {
  openRouterApiKey?: string
  chatModel?: string
  anthropicApiKey?: string
  claudeModel?: string
  quickNoteToken?: string
  quickNoteMcpUrl?: string
  quickNotePlanningDatabaseId?: string
  quickNoteAnalysisDatabaseId?: string
  quickNoteIdeaDatabaseId?: string
  quickNoteDatabaseTitles?: Record<string, string>
}

