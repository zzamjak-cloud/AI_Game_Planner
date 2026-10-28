/**
 * 결과 형식 — 파일 이름, 앱 세션 내보내기(.gplan) 형식, 아이디어 마크다운
 */

import type { GameIdea } from '../../src/types/idea'

import { sanitizeName } from './env'
import type { InboxSessionPayload } from './inbox'

/** 앱 세션 내보내기(.gplan) 형식 버전 — `Sidebar.handleExportSession` 과 같다 */
export const GPLAN_VERSION = '1.1'

/** 앱 세션 형태 → .gplan JSON (앱 "세션 불러오기" 로 그대로 열 수 있다) */
export function toGplan(session: InboxSessionPayload['session'] & { createdAt?: number; updatedAt?: number }): string {
  const now = Date.now()
  return JSON.stringify(
    {
      id: `session-${now}-${Math.random().toString(36).slice(2, 11)}`,
      type: session.type,
      title: session.title,
      messages: session.messages,
      markdownContent: session.markdownContent,
      createdAt: session.createdAt ?? now,
      updatedAt: session.updatedAt ?? now,
      gameName: session.gameName,
      analysisStatus: session.analysisStatus,
      templateId: session.templateId,
      versions: [],
      referenceFiles: [],
      exportedAt: now,
      version: GPLAN_VERSION,
    },
    null,
    2
  )
}

/** 아이디어 → 마크다운 (앱 Notion 내보내기와 같은 구성) */
export function ideaToMarkdown(idea: Pick<GameIdea, 'title' | 'lines' | 'hook' | 'inspiration'>, heading = '#'): string {
  const lines = [`${heading} ${idea.title}`, '', ...idea.lines.map((line, index) => `${index + 1}. ${line}`)]
  // 직접 넘긴 아이디어는 심리 훅·영감 소재가 없을 수 있다 — 빈 항목은 쓰지 않는다
  if (idea.hook?.trim()) lines.push('', `**건드리는 심리**: ${idea.hook}`)
  if (idea.inspiration?.trim()) lines.push('', `**영감 소재**: ${idea.inspiration}`)
  return lines.join('\n')
}

/** 문서 파일 이름: 지정 이름 → 게임명 → 기본값 (금지 문자 정리) */
export function documentBaseName(preferred: string | undefined, extracted: string | null | undefined, fallback: string): string {
  return sanitizeName(preferred || extracted || fallback, fallback)
}

/** 응답에 보일 짧은 미리보기 (첫 줄 몇 개) */
export function preview(markdown: string, maxChars = 300): string {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, '').trim()
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}
