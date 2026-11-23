// QuickNote 전송용 문서 분할 (순수 함수 — 네트워크·스토어 비의존)
//
// QuickNote는 저장 시 본문이 마크다운의 7~9배로 부풀어 페이지당 한도(358,400바이트)에 걸린다.
// 표가 많은 문서는 약 45KB에서 이미 실패하므로 페이지당 마크다운을 28,000바이트로 제한한다.

import { MAX_PAGE_MD } from '../constants/quicknote'

export interface QuickNotePlanPage {
  title: string
  content: string
  // 이 페이지의 하위 페이지 (문서 순서)
  children: QuickNotePlanPage[]
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

interface HeadingSection {
  heading: string
  text: string
}

// 코드 펜스 밖에서 정확히 level개의 #로 시작하는 헤딩 기준으로 나눈다
function splitByHeading(text: string, level: number): { intro: string; sections: HeadingSection[] } {
  const pattern = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`)
  const introLines: string[] = []
  const sections: Array<{ heading: string; lines: string[] }> = []
  let inFence = false

  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const match = !inFence ? line.match(pattern) : null
    if (match) {
      sections.push({ heading: match[1].replace(/\*\*/g, '').trim(), lines: [line] })
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line)
    } else {
      introLines.push(line)
    }
  }

  return {
    intro: introLines.join('\n').trim(),
    sections: sections.map((s) => ({ heading: s.heading, text: s.lines.join('\n').trim() })),
  }
}

// 문단·표·코드 블록 단위로 쪼갠다 (표와 코드 블록은 한 덩어리)
function toBlocks(text: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  let inTable = false

  const flush = () => {
    if (current.length > 0) blocks.push(current.join('\n'))
    current = []
  }

  for (const line of text.split('\n')) {
    if (inFence) {
      current.push(line)
      if (/^\s*```/.test(line)) {
        inFence = false
        flush()
      }
      continue
    }
    if (/^\s*```/.test(line)) {
      flush()
      inTable = false
      inFence = true
      current.push(line)
      continue
    }
    const isTableLine = /^\s*\|/.test(line)
    if (line.trim() === '') {
      flush()
      inTable = false
      continue
    }
    if (isTableLine !== inTable) flush()
    inTable = isTableLine
    current.push(line)
  }
  flush()
  return blocks
}

// 한 블록이 한도를 넘는 최후의 경우에만 줄 단위로 자른다
function splitOversizedBlock(block: string, maxBytes: number): string[] {
  const parts: string[] = []
  let current = ''
  for (const line of block.split('\n')) {
    const next = current ? `${current}\n${line}` : line
    if (current && byteLength(next) > maxBytes) {
      parts.push(current)
      current = line
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts
}

// 블록 경계에서 한도 이하로 묶는다
export function splitAtBoundaries(text: string, maxBytes: number): string[] {
  const parts: string[] = []
  let current = ''
  const blocks = toBlocks(text).flatMap((b) => (byteLength(b) > maxBytes ? splitOversizedBlock(b, maxBytes) : [b]))

  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block
    if (current && byteLength(next) > maxBytes) {
      parts.push(current)
      current = block
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts
}

// 제목 접두어로 쓸 게임 이름: 🎮 제목 줄 → ANALYSIS_TITLE → 행 제목의 " : " 앞부분
export function extractShortName(markdown: string, rowTitle: string): string {
  const planning = markdown.match(/^🎮\s*\*\*(.+?)\s*게임\s*(?:기획서|분석(?:\s*보고서)?)\*\*/m)
  if (planning) return planning[1].trim()
  const analysis = markdown.match(/<!--\s*ANALYSIS_TITLE:\s*(.+?)\s*게임\s*분석\s*보고서\s*-->/)
  if (analysis) return analysis[1].trim()
  return rowTitle.split(' : ')[0].trim() || rowTitle
}

// 분할된 부분들의 페이지 (1/n) 제목과 내용
function partPages(title: string, parts: string[]): QuickNotePlanPage[] {
  return parts.map((content, i) => ({
    title: parts.length > 1 ? `${title} (${i + 1}/${parts.length})` : title,
    content,
    children: [],
  }))
}

/**
 * 문서를 QuickNote 페이지 트리로 계획한다.
 * - 전체가 한도 이하면 행 페이지 하나.
 * - 아니면 행 페이지는 머리말만 담고, 모든 최상위 장이 하위 페이지가 된다.
 *   한도를 넘는 장은 장 페이지(제목+도입부) 아래에 ## 소절 페이지를, 그래도 넘는 소절은 (i/n) 분할 페이지를 둔다.
 */
export function planQuickNoteExport(
  markdown: string,
  rowTitle: string,
  maxBytes: number = MAX_PAGE_MD
): QuickNotePlanPage {
  const doc = markdown.trim()
  if (byteLength(doc) <= maxBytes) return { title: rowTitle, content: doc, children: [] }

  const shortName = extractShortName(doc, rowTitle)
  const pageTitle = (heading: string) => `${shortName} · ${heading}`
  const { intro, sections: chapters } = splitByHeading(doc, 1)

  // 헤딩이 전혀 없는 거대한 문서는 경계 단위 분할 페이지로만 구성한다
  if (chapters.length === 0) {
    return { title: rowTitle, content: '', children: partPages(shortName, splitAtBoundaries(doc, maxBytes)) }
  }

  // 머리말이 한도를 넘는 경우를 대비해 첫 조각만 행에 두고 나머지는 하위 페이지로 보낸다
  const introParts = intro ? splitAtBoundaries(intro, maxBytes) : []
  const root: QuickNotePlanPage = { title: rowTitle, content: introParts[0] ?? '', children: [] }
  root.children.push(...partPages(pageTitle('머리말'), introParts.slice(1)))

  for (const chapter of chapters) {
    const title = pageTitle(chapter.heading)
    if (byteLength(chapter.text) <= maxBytes) {
      root.children.push({ title, content: chapter.text, children: [] })
      continue
    }

    const { intro: chapterIntro, sections: subs } = splitByHeading(chapter.text, 2)
    const introChunks = splitAtBoundaries(chapterIntro, maxBytes)
    const page: QuickNotePlanPage = { title, content: introChunks[0] ?? '', children: [] }
    page.children.push(...partPages(`${title} 도입`, introChunks.slice(1)))

    for (const sub of subs) {
      const subTitle = pageTitle(sub.heading)
      if (byteLength(sub.text) <= maxBytes) {
        page.children.push({ title: subTitle, content: sub.text, children: [] })
      } else {
        page.children.push(...partPages(subTitle, splitAtBoundaries(sub.text, maxBytes)))
      }
    }
    root.children.push(page)
  }

  return root
}

// 페이지 수 (행 포함)
export function countPlanPages(page: QuickNotePlanPage): number {
  return 1 + page.children.reduce((sum, c) => sum + countPlanPages(c), 0)
}
