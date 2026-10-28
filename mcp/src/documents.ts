/**
 * 참조 문서 로딩 (헤드리스) — 앱과 같은 변환 규칙(`src/lib/utils/documentText.ts`)으로 텍스트를 만든다.
 *
 * 지원: 직접 텍스트(content) · 파일(pdf·xlsx·xls·csv·md·markdown·txt·json) · URL(웹페이지·구글 스프레드시트)
 * 결과는 앱 세션의 참조 파일(ReferenceFile)과 같은 형태라, 기획 프롬프트에 앱과 같은 규칙으로 붙는다
 * (`appendReferenceFiles` — 요청과 관련된 파일만, 10만 자 상한).
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'

import type { ReferenceFile } from '../../src/types/referenceFile'
import {
  csvToText,
  excelToText,
  googleSheetCsvUrl,
  htmlToText,
  isGoogleSheetUrl,
  pdfDocumentToText,
} from '../../src/lib/utils/documentText'
import { MAX_FILE_SIZE_CHARS, truncateFileContent } from '../../src/lib/utils/fileOptimization'

import { assertReadableDocument } from './env'

export interface DocumentInput {
  /** 프롬프트에 보일 문서 이름 */
  name?: string
  /** 직접 넣는 본문 */
  content?: string
  /** 파일 경로 (pdf·xlsx·xls·csv·md·markdown·txt·json) */
  path?: string
  /** 웹페이지 또는 구글 스프레드시트 URL */
  url?: string
}

let pdfjsReady: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null

/**
 * pdf.js (Node legacy 빌드). 워커를 별도 파일로 띄우지 않고 번들에 넣어 같은 스레드에서 돌린다 —
 * 단일 스크립트(gp-mcp.mjs)로 배포하므로 워커 파일 경로를 찾을 수 없다.
 */
async function loadPdfJs() {
  pdfjsReady ??= (async () => {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    return import('pdfjs-dist/legacy/build/pdf.mjs')
  })().catch((error) => {
    // 실패한 promise 를 캐시하면 재시작 전까지 모든 PDF 가 실패한다 — 다음 호출에서 다시 시도하게 비운다
    pdfjsReady = null
    throw error
  })
  return pdfjsReady
}

async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await loadPdfJs()
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 }).promise
  try {
    return { text: await pdfDocumentToText(pdf), pageCount: pdf.numPages }
  } finally {
    // 같은 스레드 워커에 문서가 남지 않게 정리한다
    await pdf.destroy()
  }
}

interface LoadedText {
  text: string
  type: string
  metadata?: ReferenceFile['metadata']
}

async function readPath(path: string, dataDir: string): Promise<LoadedText> {
  const full = resolve(path)
  if (!existsSync(full)) throw new Error(`참조 문서를 찾을 수 없습니다: ${full}`)
  assertReadableDocument(full, dataDir)
  const ext = extname(full).toLowerCase().slice(1)
  const bytes = readFileSync(full)
  switch (ext) {
    case 'pdf': {
      const { text, pageCount } = await pdfToText(new Uint8Array(bytes))
      return { text, type: 'pdf', metadata: { pageCount } }
    }
    case 'xlsx':
    case 'xls': {
      const { text, sheetCount } = excelToText(new Uint8Array(bytes))
      return { text, type: 'excel', metadata: { sheetCount } }
    }
    case 'csv':
      return { text: csvToText(bytes.toString('utf-8')), type: 'csv' }
    case 'md':
    case 'markdown':
      return { text: bytes.toString('utf-8'), type: 'markdown' }
    case 'txt':
    case 'json':
      return { text: bytes.toString('utf-8'), type: ext === 'txt' ? 'text' : 'json' }
    default:
      throw new Error(`지원하지 않는 문서 형식입니다: ${full} (pdf·xlsx·xls·csv·md·txt·json)`)
  }
}

async function readUrl(url: string): Promise<LoadedText> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`http(s) URL 만 지원합니다: ${url}`)
  const sheet = isGoogleSheetUrl(url)
  const response = await fetch(sheet ? googleSheetCsvUrl(url) : url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`문서 다운로드 실패 (${response.status}): ${url}`)
  const body = await response.text()
  return sheet ? { text: csvToText(body), type: 'google-spreadsheet' } : { text: htmlToText(body), type: 'webpage' }
}

/**
 * 문서 목록 → ReferenceFile[] (앱 세션 참조 파일과 같은 형태). 본문은 앱과 같은 10만 자 상한으로 자른다.
 */
export async function loadDocuments(dataDir: string, docs: DocumentInput[] | undefined): Promise<ReferenceFile[]> {
  if (!docs || docs.length === 0) return []
  const out: ReferenceFile[] = []
  for (const [index, doc] of docs.entries()) {
    let loaded: LoadedText = { text: doc.content ?? '', type: 'text' }
    if (!loaded.text && doc.path) loaded = await readPath(doc.path, dataDir)
    else if (!loaded.text && doc.url) loaded = await readUrl(doc.url)
    if (!loaded.text.trim()) throw new Error(`참조 문서[${index}] 에 내용이 없습니다 (content·path·url 중 하나 필요).`)
    const text = loaded.text.length > MAX_FILE_SIZE_CHARS ? truncateFileContent(loaded.text) : loaded.text
    const now = Date.now()
    out.push({
      id: `mcp-doc-${index}`,
      fileName: doc.name ?? (doc.path ? basename(doc.path) : doc.url ?? `document-${index + 1}`),
      filePath: doc.path ?? doc.url ?? '',
      fileType: loaded.type,
      content: text,
      metadata: loaded.metadata,
      createdAt: now,
      updatedAt: now,
    })
  }
  return out
}
