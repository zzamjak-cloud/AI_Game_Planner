// QuickNote 외부 API(원격 MCP 서버, Streamable HTTP 무상태)

import { fetch } from '@tauri-apps/plugin-http'
import { QUICKNOTE_MAX_CONTENT_BYTES } from '../constants/quicknote'

export interface QuickNoteConfig {
  token: string
  url: string
}

interface ToolResult {
  isError?: boolean
  structuredContent?: unknown
  content?: Array<{ type?: string; text?: string }>
}

let requestId = 0

// SSE 응답이면 마지막 data: 줄의 JSON을 사용한다
function parseResponseBody(contentType: string, text: string): any {
  if (contentType.includes('text/event-stream')) {
    const dataLines = text.split('\n').filter((l) => l.startsWith('data:'))
    const last = dataLines[dataLines.length - 1]
    if (!last) throw new Error('QuickNote 응답이 비어 있습니다')
    return JSON.parse(last.slice(5).trim())
  }
  return JSON.parse(text)
}

export async function callQuickNoteTool(
  cfg: QuickNoteConfig,
  name: string,
  args: Record<string, unknown>,
  options: { preferText?: boolean } = {}
): Promise<unknown> {
  const response = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })

  if (response.status === 401) throw new Error('QuickNote 토큰이 유효하지 않습니다')
  if (response.status === 429) throw new Error('QuickNote 요청이 너무 많습니다. 잠시 후 다시 시도해주세요')

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`QuickNote 요청 실패 (${response.status}): ${rawText.slice(0, 200)}`)
  }

  const body = parseResponseBody(response.headers.get('content-type') ?? '', rawText)
  if (body.error) {
    throw new Error(`QuickNote 오류: ${body.error.message ?? JSON.stringify(body.error)}`)
  }

  const result: ToolResult = body.result ?? {}
  const text = result.content?.[0]?.text
  if (result.isError) throw new Error(`QuickNote 오류: ${text ?? '알 수 없는 오류'}`)

  if (options.preferText) {
    const joined = (result.content ?? []).map((c) => c.text ?? '').join('')
    if (joined) return joined
  }
  if (result.structuredContent !== undefined) return result.structuredContent
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// 링크·ID 입력에서 페이지/데이터베이스 ID를 뽑는다
function extractId(input: string): string {
  const trimmed = input.trim()
  const deepLink = trimmed.match(/^quicknote:\/\/page\/([^/?#\s]+)/)
  if (deepLink) return deepLink[1]
  if (/^https?:\/\//.test(trimmed)) {
    try {
      const page = new URL(trimmed).searchParams.get('page')
      if (page) return page
    } catch {
      // URL이 아니면 그대로 ID로 취급
    }
  }
  return trimmed
}

async function fetchMarkdown(cfg: QuickNoteConfig, id: string): Promise<string> {
  const result = await callQuickNoteTool(cfg, 'fetch', { id }, { preferText: true })
  return typeof result === 'string' ? result : JSON.stringify(result)
}

function extractTitle(markdown: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1].trim() ?? ''
}

export async function resolveQuickNoteDatabase(
  cfg: QuickNoteConfig,
  input: string
): Promise<{ databaseId: string; title: string }> {
  const id = extractId(input)
  if (!id) throw new Error('링크 또는 ID를 입력해주세요')

  const markdown = await fetchMarkdown(cfg, id)

  if (/^type:\s*database\s*$/m.test(markdown)) {
    return { databaseId: id, title: extractTitle(markdown) }
  }

  // 행 페이지는 헤더에 database: 제목 (id: X) 가 있다
  const rowParent = markdown.match(/^database:.*\(id:\s*([^)\s]+)\s*\)/m)
  // 전체 페이지 데이터베이스의 홈 페이지는 본문에 <database ... layout="fullPage" id="..."/> 를 담는다
  const fullPage = markdown.match(/<database\b(?=[^>]*\slayout="fullPage")[^>]*\sid="([^"]+)"/)
  const anyEmbedded = markdown.match(/<database\b[^>]*\sid="([^"]+)"/)
  const databaseId = rowParent?.[1] ?? fullPage?.[1] ?? anyEmbedded?.[1]

  if (!databaseId) {
    throw new Error('데이터베이스를 찾지 못했습니다. 데이터베이스 페이지 링크를 붙여넣어 주세요.')
  }

  const dbMarkdown = await fetchMarkdown(cfg, databaseId)
  return { databaseId, title: extractTitle(dbMarkdown) }
}

export async function createQuickNotePage(
  cfg: QuickNoteConfig,
  databaseId: string,
  title: string,
  markdown: string
): Promise<string | undefined> {
  if (new TextEncoder().encode(markdown).length > QUICKNOTE_MAX_CONTENT_BYTES) {
    throw new Error('본문이 QuickNote 한도(512KB)를 초과해 저장할 수 없습니다')
  }

  const result = (await callQuickNoteTool(cfg, 'create_pages', {
    parent: { databaseId },
    pages: [{ title, content: markdown }],
  })) as { pages?: Array<{ id: string }> } | undefined

  // 생성은 성공했으므로 ID가 없어도 오류로 취급하지 않는다
  return result?.pages?.[0]?.id
}
