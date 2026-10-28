// MCP 수신함 가져오기 — gp-mcp(AI 에이전트)가 남긴 템플릿·세션·아이디어를 앱 스토어에 반영한다.
//
// gp-mcp 는 앱 저장소(settings.json)에 직접 쓰지 않고 `<app_data_dir>/mcp-inbox/*.json` 에 항목을 남긴다.
// 앱이 유일한 저장소 쓰기 주체로 남도록, 여기서 스토어에 반영 → 저장 → ack(파일 삭제) 순서로 처리한다.
// 저장·삭제가 실패해 같은 항목을 다시 읽어도 결과가 같도록(멱등) 만든다:
//   세션 id 는 수신함 파일 이름에서 정해지고, 같은 템플릿(이름·종류·본문)·같은 아이디어 id 는 건너뛴다.
// 형식은 mcp/src/inbox.ts 와 맞춘다.

import { useAppStore, ChatSession, SessionType } from '../../store/useAppStore'
import { PromptTemplate, TemplateType } from '../../types/promptTemplate'
import { GameIdea } from '../../types/idea'
import { saveIdeas, saveSessions, saveTemplates } from '../store'
import { validateTemplateContent, validateTemplateName } from '../utils/template'
import { devLog } from '../utils/logger'
import { ackMcpInbox, takeMcpInbox } from './mcpService'

// 이 앱이 이해하는 수신함 항목 형식 버전·종류
const INBOX_VERSION = 1
const KNOWN_KINDS = new Set(['template', 'session', 'ideas'])

// 반영했지만 지우지 못한 파일 (백신 잠금 등) — 앱이 켜져 있는 동안 다시 가져오지 않는다
const handledButUndeleted = new Set<string>()

interface InboxEnvelope {
  version?: number
  kind?: string
  payload?: unknown
}

interface TemplatePayload {
  template?: { name?: unknown; type?: unknown; content?: unknown; description?: unknown; language?: unknown }
  replace_existing?: boolean
}

interface SessionPayload {
  session?: Partial<ChatSession>
}

interface IdeasPayload {
  ideas?: GameIdea[]
}

export interface InboxImportResult {
  templates: number
  sessions: number
  ideas: number
  // 형식이 맞지 않아 버린 항목 수
  rejected: number
}

// 템플릿 항목 반영 → 반영했으면 true
function applyTemplate(payload: TemplatePayload): boolean {
  const t = payload.template
  const name = typeof t?.name === 'string' ? t.name.trim() : ''
  const content = typeof t?.content === 'string' ? t.content : ''
  const type = t?.type === TemplateType.ANALYSIS ? TemplateType.ANALYSIS : t?.type === TemplateType.PLANNING ? TemplateType.PLANNING : null
  if (!type || !validateTemplateName(name).valid || !validateTemplateContent(content).valid) return false

  const description = typeof t?.description === 'string' ? t.description : undefined
  const store = useAppStore.getState()
  // 이미 같은 템플릿이 있으면 반영한 것으로 본다 (재가져오기 멱등)
  if (store.templates.some((x) => x.name === name && x.type === type && x.content === content)) return true
  // 같은 이름·종류의 사용자 템플릿만 갱신한다 (기본 템플릿은 바꾸지 않는다)
  const target = payload.replace_existing
    ? store.templates.find((x) => !x.isDefault && x.name === name && x.type === type)
    : undefined

  if (target) {
    store.updateTemplate(target.id, { content, description: description ?? target.description })
  } else {
    store.addTemplate({
      name,
      type,
      content,
      description,
      isDefault: false,
      language: t?.language === 'en' ? 'en' : 'ko',
    } as Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>)
  }
  return true
}

// 수신함 파일 → 세션 id (같은 파일을 다시 가져와도 같은 id 라 중복되지 않는다)
function sessionIdFor(file: string): string {
  return `session-mcp-${file.replace(/\.json$/, '')}`
}

// 세션 항목 → 새 세션 (현재 보고 있는 세션은 바꾸지 않는다)
function toSession(payload: SessionPayload, id: string): ChatSession | null {
  const s = payload.session
  if (!s || typeof s.title !== 'string' || typeof s.markdownContent !== 'string' || !Array.isArray(s.messages)) return null
  const now = Date.now()
  return {
    id,
    type: s.type === SessionType.ANALYSIS ? SessionType.ANALYSIS : SessionType.PLANNING,
    title: s.title,
    messages: s.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'),
    markdownContent: s.markdownContent,
    createdAt: now,
    updatedAt: now,
    templateId: typeof s.templateId === 'string' ? s.templateId : undefined,
    gameName: typeof s.gameName === 'string' ? s.gameName : undefined,
    analysisStatus: s.type === SessionType.ANALYSIS ? 'completed' : undefined,
  }
}

function isIdea(value: unknown): value is GameIdea {
  const i = value as GameIdea
  return !!i && typeof i.id === 'string' && typeof i.title === 'string' && Array.isArray(i.lines)
}

let running = false

/**
 * 수신함을 한 번 처리한다. 동시에 여러 번 불려도 한 번만 돈다.
 * 반영한 항목과 형식이 깨진 항목은 지우고, 이 앱이 모르는 버전의 항목은 남겨 둔다(앱 업데이트 후 처리).
 */
export async function importMcpInbox(): Promise<InboxImportResult | null> {
  if (running) return null
  running = true
  try {
    const items = (await takeMcpInbox()).filter((item) => !handledButUndeleted.has(item.file))
    if (items.length === 0) return null

    const result: InboxImportResult = { templates: 0, sessions: 0, ideas: 0, rejected: 0 }
    const handled: string[] = []
    const newSessions: ChatSession[] = []
    const newIdeas: GameIdea[] = []

    for (const item of items) {
      let entry: InboxEnvelope
      try {
        entry = JSON.parse(item.content) as InboxEnvelope
      } catch {
        console.error('[MCP 수신함] JSON 이 아닌 항목을 버립니다:', item.file)
        result.rejected++
        handled.push(item.file)
        continue
      }
      if (entry.version !== INBOX_VERSION || !KNOWN_KINDS.has(entry.kind ?? '')) {
        devLog.warn('[MCP 수신함] 모르는 버전·종류 — 앱 업데이트 후 처리하도록 남겨 둡니다:', item.file, entry.version, entry.kind)
        continue
      }

      let ok = false
      if (entry.kind === 'template') {
        ok = applyTemplate((entry.payload ?? {}) as TemplatePayload)
        if (ok) result.templates++
      } else if (entry.kind === 'session') {
        const session = toSession((entry.payload ?? {}) as SessionPayload, sessionIdFor(item.file))
        if (session) {
          // 이미 가져온 세션이면 건너뛴다 (저장·삭제 실패 뒤 다시 읽은 경우)
          if (!useAppStore.getState().sessions.some((s) => s.id === session.id)) {
            newSessions.push(session)
            result.sessions++
          }
          ok = true
        }
      } else if (entry.kind === 'ideas') {
        const ideas = ((entry.payload ?? {}) as IdeasPayload).ideas
        if (Array.isArray(ideas)) {
          const valid = ideas.filter(isIdea).map((i) => ({ ...i, starred: !!i.starred }))
          // 수신함은 이름순 = 생성순이므로 나중 항목이 앞에 오게 쌓는다
          newIdeas.unshift(...valid)
          ok = true
        }
      }
      if (!ok) {
        console.error('[MCP 수신함] 형식이 맞지 않는 항목을 버립니다:', item.file)
        result.rejected++
      }
      handled.push(item.file)
    }

    // 반영 → 저장을 마친 뒤에만 수신함을 지운다 (도중에 앱이 꺼져도 다음 실행 때 다시 가져온다)
    // 저장을 기다리는 사이 사용자가 바꾼 상태를 덮어쓰지 않도록 항상 최신 상태 위에 합친다
    if (result.templates > 0) {
      await saveTemplates(useAppStore.getState().templates)
    }
    if (newSessions.length > 0) {
      useAppStore.setState((state) => ({ sessions: [...state.sessions, ...newSessions] }))
      await saveSessions(useAppStore.getState().sessions)
    }
    if (newIdeas.length > 0) {
      const before = new Set(useAppStore.getState().ideas.map((i) => i.id))
      useAppStore.getState().importIdeas(newIdeas)
      // 알림에는 실제로 새로 들어간 개수만
      result.ideas = new Set(newIdeas.filter((i) => !before.has(i.id)).map((i) => i.id)).size
      await saveIdeas(useAppStore.getState().ideas)
    }
    for (const file of await ackMcpInbox(handled)) {
      console.error('[MCP 수신함] 반영했지만 파일을 지우지 못했습니다 (다시 가져오지 않음):', file)
      handledButUndeleted.add(file)
    }

    devLog.log('📥 [MCP 수신함] 가져오기:', result)
    return result
  } catch (error) {
    console.error('[MCP 수신함] 가져오기 실패:', error)
    return null
  } finally {
    running = false
  }
}
