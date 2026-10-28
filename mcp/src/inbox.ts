/**
 * 앱 수신함 (inbox) — MCP 결과를 앱에 넣는 유일한 경로
 *
 * 서버는 앱 저장소(settings.json)에 직접 쓰지 않는다. 앱이 켜져 있으면 메모리 상태로 저장소를 덮어써
 * 바깥에서 쓴 내용이 사라지기 때문이다. 대신 `<app_data_dir>/mcp-inbox/` 에 항목을 하나씩 남기면
 * 앱이 시작·포커스·주기 확인 때 가져가 스토어에 반영하고 지운다 (`src/hooks/useMcpInbox.ts`).
 *
 * 파일 이름은 시각 접두사로 시작해 이름순 = 생성순이다. `.tmp` 로 쓴 뒤 이름을 바꿔 원자적으로 완성한다.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { PromptTemplate } from '../../src/types/promptTemplate'
import type { GameIdea } from '../../src/types/idea'

import { writeAtomic } from './env'

/** 수신함 폴더 이름 (`src-tauri/src/mcp_commands.rs` 의 INBOX_DIR 과 같다) */
export const INBOX_DIR = 'mcp-inbox'
/** 항목 형식 버전 — 앱이 모르는 버전은 건너뛰고 남겨 둔다 */
export const INBOX_VERSION = 1

/** 앱에 등록할 템플릿 (id 는 앱이 새로 붙인다. replace_existing 이면 같은 이름의 사용자 템플릿을 갱신) */
export interface InboxTemplatePayload {
  template: Pick<PromptTemplate, 'name' | 'type' | 'content'> & { description?: string; language?: 'ko' | 'en' }
  replace_existing?: boolean
}

/** 앱 세션으로 넣을 기획서·분석 보고서 (id 는 앱이 새로 붙인다) */
export interface InboxSessionPayload {
  session: {
    type: 'planning' | 'analysis'
    title: string
    messages: { role: 'user' | 'assistant'; content: string }[]
    markdownContent: string
    templateId?: string
    gameName?: string
    analysisStatus?: 'completed'
  }
}

/** 딸깍 히스토리에 넣을 아이디어 */
export interface InboxIdeasPayload {
  ideas: GameIdea[]
}

export type InboxEntry =
  | { kind: 'template'; payload: InboxTemplatePayload }
  | { kind: 'session'; payload: InboxSessionPayload }
  | { kind: 'ideas'; payload: InboxIdeasPayload }

export function inboxDir(dataDir: string): string {
  return join(dataDir, INBOX_DIR)
}

/** 수신함에 항목 하나를 남긴다 → 파일 경로 */
export function sendToApp(dataDir: string, entry: InboxEntry): string {
  const now = new Date()
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '')
  const path = join(inboxDir(dataDir), `${stamp}-${randomUUID().slice(0, 8)}-${entry.kind}.json`)
  writeAtomic(
    path,
    JSON.stringify({ version: INBOX_VERSION, source: 'gp-mcp', created_at: now.toISOString(), ...entry }, null, 2)
  )
  return path
}

/** 아직 앱이 가져가지 않은 항목 (종류별 개수와 템플릿 이름) */
export function pendingInbox(dataDir: string): { count: number; by_kind: Record<string, number>; templates: string[] } {
  const dir = inboxDir(dataDir)
  const result = { count: 0, by_kind: {} as Record<string, number>, templates: [] as string[] }
  if (!existsSync(dir)) return result
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as InboxEntry
      result.count++
      result.by_kind[entry.kind] = (result.by_kind[entry.kind] ?? 0) + 1
      if (entry.kind === 'template') result.templates.push(entry.payload.template.name)
    } catch {
      // 읽지 못한 항목은 건너뛴다
    }
  }
  return result
}
