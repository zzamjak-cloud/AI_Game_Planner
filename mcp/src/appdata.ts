/**
 * 앱 저장소 읽기 — 템플릿·세션(기획서·분석 보고서)·딸깍 아이디어 (읽기 전용)
 *
 * 앱과 같은 규칙으로 읽는다:
 * - 기본 템플릿(default-*)은 앱이 시작할 때 코드 내용으로 덮어쓰므로 저장값 대신 코드(DEFAULT_TEMPLATES)를 쓴다.
 * - 저장된 템플릿이 없으면 기본 템플릿만 있는 것으로 본다.
 */

import { readFileSync, existsSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'

import { DEFAULT_TEMPLATES } from '../../src/lib/templateDefaults'
import { TemplateType, type PromptTemplate } from '../../src/types/promptTemplate'
import type { GameIdea } from '../../src/types/idea'
import type { ReferenceFile } from '../../src/types/referenceFile'

import { assertReadableDocument, readSettings } from './env'

type Json = Record<string, unknown>

/** 앱 세션 형태 (스토어의 ChatSession 중 MCP 가 쓰는 필드) */
export interface StoredSession {
  id: string
  type: string
  title: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  markdownContent: string
  createdAt: number
  updatedAt: number
  gameName?: string
  templateId?: string
  analysisStatus?: string
  referenceFiles?: ReferenceFile[]
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function safeSettings(dataDir: string): Json {
  return readSettings(dataDir)
}

// ───────────────────────── 템플릿 ─────────────────────────

/** 앱이 실제로 쓰는 템플릿 목록 (기본 템플릿은 코드 내용, 사용자 템플릿은 저장값) */
export function listTemplates(dataDir: string): PromptTemplate[] {
  let stored: PromptTemplate[] = []
  try {
    stored = (asArray(safeSettings(dataDir).prompt_templates) as PromptTemplate[]).filter(
      (t) => t && typeof t.id === 'string' && typeof t.content === 'string'
    )
  } catch {
    // 앱 데이터가 없으면 기본 템플릿만
  }
  const defaults = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]))
  const merged = stored.map((t) => (defaults.has(t.id) ? { ...t, content: defaults.get(t.id)!.content } : t))
  // 저장소에 없는 기본 템플릿은 앱이 시작 때 복구하므로 목록에 넣는다
  for (const def of DEFAULT_TEMPLATES) {
    if (!merged.some((t) => t.id === def.id)) merged.push(def)
  }
  return merged
}

/** 현재 선택된 기획/분석 템플릿 id (앱 설정, 없으면 기본) */
export function currentTemplateIds(dataDir: string): { planning: string; analysis: string } {
  try {
    const settings = safeSettings(dataDir)
    return {
      planning: typeof settings.current_planning_template_id === 'string' ? settings.current_planning_template_id : 'default-planning',
      analysis: typeof settings.current_analysis_template_id === 'string' ? settings.current_analysis_template_id : 'default-analysis',
    }
  } catch {
    return { planning: 'default-planning', analysis: 'default-analysis' }
  }
}

export interface TemplateInput {
  /** 앱 템플릿 id (gp_list_templates) */
  id?: string
  /** 템플릿 파일 (.prompt — 앱 내보내기 JSON / .md·.txt — 본문 그대로) */
  path?: string
  /** 본문 직접 지정 */
  content?: string
}

export interface ResolvedTemplate {
  /** 앱 템플릿이면 id */
  id?: string
  name: string
  type?: TemplateType
  content: string
  source: 'app' | 'file' | 'inline' | 'app-current'
}

/**
 * 템플릿 입력 → 본문. 아무것도 없으면 앱에서 현재 선택된 템플릿(kind 기준)을 쓴다.
 */
export function resolveTemplate(dataDir: string, input: TemplateInput | undefined, kind: TemplateType): ResolvedTemplate {
  const given = [input?.id, input?.path, input?.content].filter((v) => v !== undefined && v !== '').length
  if (given > 1) throw new Error('template 은 id · path · content 중 하나만 지정하세요.')

  if (input?.content) {
    return { name: '직접 지정 템플릿', content: input.content, source: 'inline' }
  }
  if (input?.path) {
    const file = readTemplateFile(input.path, dataDir)
    return { ...file, name: file.name ?? basename(input.path), source: 'file' }
  }

  const templates = listTemplates(dataDir)
  const id = input?.id ?? (kind === TemplateType.PLANNING ? currentTemplateIds(dataDir).planning : currentTemplateIds(dataDir).analysis)
  const found = templates.find((t) => t.id === id)
  if (!found) {
    if (input?.id) throw new Error(`템플릿을 찾을 수 없습니다: ${input.id}. gp_list_templates 로 id 를 확인하세요.`)
    // 선택된 템플릿이 지워졌으면 앱처럼 기본 템플릿으로
    const fallback = templates.find((t) => t.id === (kind === TemplateType.PLANNING ? 'default-planning' : 'default-analysis'))!
    return { id: fallback.id, name: fallback.name, type: fallback.type, content: fallback.content, source: 'app-current' }
  }
  return { id: found.id, name: found.name, type: found.type, content: found.content, source: input?.id ? 'app' : 'app-current' }
}

/** 템플릿 파일 읽기: .prompt(JSON, content 필드) 또는 본문 그대로 */
export function readTemplateFile(path: string, dataDir: string): { name?: string; type?: TemplateType; content: string; description?: string } {
  const full = resolve(path)
  if (!existsSync(full)) throw new Error(`템플릿 파일을 찾을 수 없습니다: ${full}`)
  assertReadableDocument(full, dataDir)
  const text = readFileSync(full, 'utf-8')
  if (extname(full).toLowerCase() === '.prompt' || text.trimStart().startsWith('{')) {
    try {
      const json = JSON.parse(text) as Json
      if (typeof json.content === 'string') {
        return {
          name: typeof json.name === 'string' ? json.name : undefined,
          type: json.type === TemplateType.ANALYSIS || json.type === TemplateType.PLANNING ? (json.type as TemplateType) : undefined,
          content: json.content,
          description: typeof json.description === 'string' ? json.description : undefined,
        }
      }
    } catch {
      // JSON 이 아니면 본문 그대로
    }
  }
  return { content: text }
}

// ───────────────────────── 세션 ─────────────────────────

function toSession(raw: Json): StoredSession | null {
  if (typeof raw.id !== 'string') return null
  return {
    id: raw.id,
    type: typeof raw.type === 'string' ? raw.type : 'planning',
    title: typeof raw.title === 'string' ? raw.title : 'untitled',
    messages: (asArray(raw.messages) as StoredSession['messages']).filter((m) => m && typeof m.content === 'string'),
    markdownContent: typeof raw.markdownContent === 'string' ? raw.markdownContent : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    gameName: typeof raw.gameName === 'string' ? raw.gameName : undefined,
    templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
    analysisStatus: typeof raw.analysisStatus === 'string' ? raw.analysisStatus : undefined,
    referenceFiles: Array.isArray(raw.referenceFiles) ? (raw.referenceFiles as ReferenceFile[]) : undefined,
  }
}

/** 앱 세션 전체 (최근 수정순) */
export function listSessions(dataDir: string): StoredSession[] {
  return (asArray(safeSettings(dataDir).chat_sessions) as Json[])
    .map(toSession)
    .filter((s): s is StoredSession => !!s)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getSession(dataDir: string, sessionId: string): StoredSession {
  const session = listSessions(dataDir).find((s) => s.id === sessionId)
  if (!session) throw new Error(`세션을 찾을 수 없습니다: ${sessionId}. gp_list_sessions 로 id 를 확인하세요.`)
  return session
}

/** 목록 응답용 요약 (본문 제외) */
export function sessionSummary(s: StoredSession) {
  return {
    id: s.id,
    type: s.type,
    title: s.title,
    game_name: s.gameName ?? null,
    template_id: s.templateId ?? null,
    analysis_status: s.analysisStatus ?? null,
    markdown_chars: s.markdownContent.length,
    message_count: s.messages.length,
    reference_file_count: s.referenceFiles?.length ?? 0,
    updated_at: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  }
}

// ───────────────────────── 딸깍 아이디어 ─────────────────────────

/** 앱 아이디어 히스토리 (최신이 앞) */
export function listIdeas(dataDir: string): GameIdea[] {
  try {
    return (asArray(safeSettings(dataDir).ideas) as GameIdea[]).filter(
      (i) => i && typeof i.title === 'string' && Array.isArray(i.lines)
    )
  } catch {
    return []
  }
}
