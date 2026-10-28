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
  notionApiKey?: string | null
  notionPlanningDatabaseId?: string | null
  notionAnalysisDatabaseId?: string | null
  notionIdeaDatabaseId?: string | null
  oldNotionDbId?: string | null
  chatSessions?: ChatSession[]
  promptTemplates?: PromptTemplate[]
  currentPlanningTemplateId?: string | null
  currentAnalysisTemplateId?: string | null
  windowState?: WindowState
  ideas?: GameIdea[]
  chatModel?: string | null
}

export interface SaveSettingsParams {
  openRouterApiKey?: string
  notionApiKey?: string
  notionPlanningDatabaseId?: string
  notionAnalysisDatabaseId?: string
  notionIdeaDatabaseId?: string
  chatModel?: string
}

