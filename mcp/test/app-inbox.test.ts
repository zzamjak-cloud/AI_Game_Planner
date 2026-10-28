/**
 * 수신함 계약 테스트 — 서버가 쓴 항목(mcp/src/inbox.ts)을 앱 가져오기 코드(src/lib/services/mcpInbox.ts)가
 * 그대로 반영하는지 확인한다. Tauri 경계(invoke·plugin-store 저장)만 가짜로 바꾸고 스토어는 진짜 zustand 를 쓴다.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TemplateType, type PromptTemplate } from '../../src/types/promptTemplate'
import type { GameIdea } from '../../src/types/idea'

import { sendToApp } from '../src/inbox'

const dataDir = mkdtempSync(join(tmpdir(), 'gp-inbox-app-'))
writeFileSync(join(dataDir, 'settings.json'), '{}')
const inbox = join(dataDir, 'mcp-inbox')
const saved: { templates?: PromptTemplate[]; sessions?: unknown[]; ideas?: GameIdea[] } = {}
// true 면 ack 가 파일을 지우지 못한 것처럼 동작한다 (백신 잠금 재현)
let ackFails = false

// Rust command 대신 수신함 폴더를 직접 읽고 지운다 (mcp_commands.rs 와 같은 규칙: .json 만, 이름순)
mock.module('../../src/lib/services/mcpService', () => ({
  takeMcpInbox: async () => {
    try {
      return readdirSync(inbox)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((file) => ({ file, content: readFileSync(join(inbox, file), 'utf-8') }))
    } catch {
      return []
    }
  },
  ackMcpInbox: async (files: string[]) => {
    if (ackFails) return files
    files.forEach((f) => rmSync(join(inbox, f)))
    return []
  },
}))
// 앱 저장소(plugin-store) 저장 대신 마지막 저장값을 기록한다
mock.module('../../src/lib/store', () => ({
  saveTemplates: async (t: PromptTemplate[]) => void (saved.templates = t),
  saveSessions: async (s: unknown[]) => void (saved.sessions = s),
  saveIdeas: async (i: GameIdea[]) => void (saved.ideas = i),
}))

const { importMcpInbox } = await import('../../src/lib/services/mcpInbox')
const { useAppStore } = await import('../../src/store/useAppStore')

const userTemplate: PromptTemplate = {
  id: 'template-1',
  name: '내 템플릿',
  type: TemplateType.PLANNING,
  content: '기존 내용 '.repeat(10),
  isDefault: false,
  createdAt: 0,
  updatedAt: 0,
}
const idea = (id: string, starred = false): GameIdea => ({ id, title: id, lines: ['a', 'b', 'c'], hook: 'h', inspiration: 'i', starred, createdAt: 0 })

beforeEach(() => {
  rmSync(inbox, { recursive: true, force: true })
  for (const key of Object.keys(saved)) delete saved[key as keyof typeof saved]
  ackFails = false
  useAppStore.setState({ templates: [userTemplate], sessions: [], currentSessionId: 'keep-me', ideas: [idea('old')], currentIdeaId: 'old' })
})

describe('앱 수신함 가져오기', () => {
  test('템플릿: 새로 추가 / replace_existing 이면 같은 이름 사용자 템플릿 갱신, 저장 후 수신함을 비운다', async () => {
    const content = '새 본문 '.repeat(10)
    sendToApp(dataDir, { kind: 'template', payload: { template: { name: '새 템플릿', type: TemplateType.ANALYSIS, content } } })
    sendToApp(dataDir, { kind: 'template', payload: { template: { name: '내 템플릿', type: TemplateType.PLANNING, content }, replace_existing: true } })
    const result = await importMcpInbox()
    expect(result).toMatchObject({ templates: 2, rejected: 0 })
    const templates = useAppStore.getState().templates
    expect(templates.length).toBe(2)
    expect(templates.find((t) => t.name === '새 템플릿')).toMatchObject({ type: 'analysis', isDefault: false, content })
    expect(templates.find((t) => t.id === 'template-1')!.content).toBe(content)
    expect(saved.templates).toEqual(templates)
    expect(readdirSync(inbox)).toEqual([])
  })

  test('세션: 현재 세션은 그대로 두고 새 id 로 추가한다', async () => {
    sendToApp(dataDir, {
      kind: 'session',
      payload: { session: { type: 'analysis', title: 'X 분석', messages: [{ role: 'user', content: 'X' }], markdownContent: '# 보고서', gameName: 'X', analysisStatus: 'completed' } },
    })
    await importMcpInbox()
    const state = useAppStore.getState()
    expect(state.currentSessionId).toBe('keep-me')
    expect(state.sessions.length).toBe(1)
    expect(state.sessions[0]).toMatchObject({ type: 'analysis', title: 'X 분석', gameName: 'X', analysisStatus: 'completed', markdownContent: '# 보고서' })
    expect(state.sessions[0].id.startsWith('session-mcp-')).toBe(true)
    expect(saved.sessions).toEqual(state.sessions)
  })

  test('아이디어: 나중 항목이 앞에, 같은 id 는 건너뛰고, 표시 중인 아이디어는 유지', async () => {
    sendToApp(dataDir, { kind: 'ideas', payload: { ideas: [idea('b'), idea('a')] } })
    await new Promise((r) => setTimeout(r, 5)) // 파일 이름 시각 접두사가 달라지도록
    sendToApp(dataDir, { kind: 'ideas', payload: { ideas: [idea('c'), idea('old')] } })
    const result = await importMcpInbox()
    const state = useAppStore.getState()
    expect(state.ideas.map((i) => i.id)).toEqual(['c', 'b', 'a', 'old'])
    expect(state.currentIdeaId).toBe('old')
    expect(result!.ideas).toBe(3) // 실제로 새로 들어간 수 (old 는 이미 있음)
    expect(saved.ideas).toEqual(state.ideas)
  })

  test('깨진 항목은 버리고, 모르는 버전은 남겨 둔다', async () => {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, '1-broken.json'), '{not json')
    writeFileSync(join(inbox, '2-future.json'), JSON.stringify({ version: 99, kind: 'template', payload: {} }))
    writeFileSync(join(inbox, '3-bad-template.json'), JSON.stringify({ version: 1, kind: 'template', payload: { template: { name: 'x', type: 'planning', content: '짧음' } } }))
    const result = await importMcpInbox()
    expect(result).toMatchObject({ templates: 0, rejected: 2 })
    expect(readdirSync(inbox)).toEqual(['2-future.json'])
    expect(useAppStore.getState().templates).toEqual([userTemplate])
  })

  test('파일을 지우지 못해도 같은 항목을 다시 가져오지 않는다 (세션·템플릿 중복 없음)', async () => {
    ackFails = true
    sendToApp(dataDir, { kind: 'session', payload: { session: { type: 'planning', title: 'P', messages: [], markdownContent: '# p' } } })
    sendToApp(dataDir, { kind: 'template', payload: { template: { name: '새 템플릿', type: TemplateType.PLANNING, content: '본문 '.repeat(20) } } })
    await importMcpInbox()
    // 같은 프로세스에서 다시 확인해도, 앱을 재시작해 기억이 사라진 뒤 다시 읽어도 중복되지 않는다
    expect(await importMcpInbox()).toBeNull()
    const { importMcpInbox: freshImport } = await import(`../../src/lib/services/mcpInbox?fresh=${Date.now()}`)
    await freshImport()
    const state = useAppStore.getState()
    expect(state.sessions.length).toBe(1)
    expect(state.templates.filter((t) => t.name === '새 템플릿').length).toBe(1)
  })

  test('모르는 종류(kind)는 지우지 않고 남겨 둔다', async () => {
    sendToApp(dataDir, { kind: 'session', payload: { session: { type: 'planning', title: 'P', messages: [], markdownContent: '# p' } } })
    const { mkdirSync } = await import('node:fs')
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, 'zz-new-kind.json'), JSON.stringify({ version: 1, kind: 'storyboard', payload: {} }))
    await importMcpInbox()
    expect(readdirSync(inbox)).toEqual(['zz-new-kind.json'])
  })

  test('수신함이 비어 있으면 아무것도 저장하지 않는다', async () => {
    expect(await importMcpInbox()).toBeNull()
    expect(saved).toEqual({})
  })
})
