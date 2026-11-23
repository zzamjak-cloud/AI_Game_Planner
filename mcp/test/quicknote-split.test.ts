import { describe, expect, test } from 'bun:test'
import {
  byteLength,
  extractShortName,
  planQuickNoteExport,
  splitAtBoundaries,
} from '../../src/lib/utils/quickNoteSplit'

const MAX = 600

function table(rows: number): string {
  return ['| a | b |', '|---|---|', ...Array.from({ length: rows }, (_, i) => `| ${i} | 값${i} |`)].join('\n')
}

describe('QuickNote 문서 분할', () => {
  test('한도 이하면 행 페이지 하나에 전체를 담는다', () => {
    const doc = '🎮 **머지팜 게임 기획서**\n\n# 1. 개요\n짧음'
    const plan = planQuickNoteExport(doc, '머지팜 : 게임 기획서', MAX)
    expect(plan.children).toHaveLength(0)
    expect(plan.content).toBe(doc)
  })

  test('큰 문서는 행에 머리말만 두고 모든 장이 페이지가 된다', () => {
    const doc = `🎮 **머지팜 게임 기획서**\n\n> 메타\n\n# 1. 개요\n짧은 장\n\n# 2. 시스템\n${table(60)}\n\n# 3. 부록\n끝`
    const plan = planQuickNoteExport(doc, '머지팜 : 게임 기획서', MAX)
    expect(plan.content).toContain('🎮')
    expect(plan.content).not.toContain('# 1.')
    const titles = plan.children.map((c) => c.title)
    expect(titles).toEqual(['머지팜 · 1. 개요', '머지팜 · 2. 시스템', '머지팜 · 3. 부록'])
    expect(plan.children[0].content).toBe('# 1. 개요\n짧은 장')
  })

  test('한도를 넘는 장은 ## 소절 페이지로 순서대로 나뉜다', () => {
    const sub = (n: number) => `## 2.${n} 소절\n${table(20)}`
    const doc = `# 1. 개요\n짧음\n\n# 2. 시스템\n도입부\n\n${sub(1)}\n\n${sub(2)}\n\n${sub(3)}`
    const plan = planQuickNoteExport(doc, '게임 : 게임 기획서', MAX)
    const chapter = plan.children[1]
    expect(chapter.content).toBe('# 2. 시스템\n도입부')
    expect(chapter.children.map((c) => c.title)).toEqual([
      '게임 · 2.1 소절',
      '게임 · 2.2 소절',
      '게임 · 2.3 소절',
    ])
  })

  test('소절이 한도를 넘으면 (i/n)으로 나누고 표·코드 블록 안에서는 자르지 않는다', () => {
    const code = '```\n' + Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n') + '\n```'
    const doc = `# 1. 장\n## 1.1 큰 소절\n${table(30)}\n\n${code}\n\n${table(30)}`
    const plan = planQuickNoteExport(doc, '게임 : 게임 분석', MAX)
    const parts = plan.children[0].children
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0].title).toBe(`게임 · 1.1 큰 소절 (1/${parts.length})`)
    for (const p of parts) {
      expect(byteLength(p.content)).toBeLessThanOrEqual(MAX)
      expect((p.content.match(/```/g) ?? []).length % 2).toBe(0)
    }
    // 표 한 줄도 쪼개져 사라지지 않는다
    const joined = parts.map((p) => p.content).join('\n')
    expect(joined).toContain('| 29 | 값29 |')
  })

  test('코드 펜스 안의 # 줄은 헤딩으로 취급하지 않는다', () => {
    const doc = `# 1. 장\n\`\`\`\n# 주석\n\`\`\`\n${table(60)}\n\n# 2. 장\n끝`
    const plan = planQuickNoteExport(doc, 'g : 게임 기획서', MAX)
    expect(plan.children.map((c) => c.title)).toEqual(['g · 1. 장', 'g · 2. 장'])
  })

  test('게임명은 🎮 제목 → ANALYSIS_TITLE → 행 제목 순으로 찾는다', () => {
    expect(extractShortName('🎮 **A 게임 기획서**', 'x : y')).toBe('A')
    expect(extractShortName('<!-- ANALYSIS_TITLE: B 게임 분석 보고서 -->', 'x : y')).toBe('B')
    expect(extractShortName('본문', 'C : 게임 분석')).toBe('C')
  })

  test('splitAtBoundaries는 모든 조각이 한도 이하다', () => {
    const parts = splitAtBoundaries(`${table(100)}\n\n문단\n\n${table(100)}`, MAX)
    for (const p of parts) expect(byteLength(p)).toBeLessThanOrEqual(MAX)
  })
})
