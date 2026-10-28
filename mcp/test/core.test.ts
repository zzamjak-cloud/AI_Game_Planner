/**
 * gp-mcp 핵심 규칙 테스트 — 앱과 같은 프롬프트·파싱, 경로 보호, 수신함 형식, 템플릿 해석 (API 호출 없음)
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TemplateType } from '../../src/types/promptTemplate'
import { SYSTEM_INSTRUCTION } from '../../src/lib/systemInstruction'
import { SECTIONED_MODE_OVERRIDE } from '../../src/lib/services/sectionedGeneration'
import {
  appendReferenceFiles,
  buildAnalysisContents,
  buildPlanningContents,
  parseDocumentResponse,
  withSectionedOverride,
} from '../../src/lib/prompts/documentPrompt'
import { buildIdeaUserPrompt, rollIdeaSeed } from '../../src/lib/ideaPrompt'

import { assertReadableDocument, assertWritable, isInside, sanitizeName, writeUnique } from '../src/env'
import { listTemplates, resolveTemplate } from '../src/appdata'
import { pendingInbox, sendToApp } from '../src/inbox'
import { ideaToMarkdown, toGplan } from '../src/output'
import { planningSections } from '../src/generate'
import { templateStructure } from '../src/templates'
import { ideaToPlanningRequest } from '../src/planning'

function tempDataDir(settings: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-mcp-data-'))
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ openrouter_api_key: 'sk-test-not-real', ...settings }))
  return dir
}

describe('프롬프트 구성 (앱과 공유)', () => {
  test('기획: 시스템 지시문 → 확인 응답 → 최근 대화 → 요청, 현재 기획서는 시스템 메시지에 붙는다', () => {
    const contents = buildPlanningContents({
      message: '난이도를 높여줘',
      currentMarkdown: '# 기존',
      history: [
        { role: 'user', content: '고양이 게임' },
        { role: 'assistant', content: '완료' },
      ],
    })
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user'])
    expect(contents[0].parts[0].text!.startsWith(SYSTEM_INSTRUCTION)).toBe(true)
    expect(contents[0].parts[0].text).toContain('<current_markdown>\n# 기존\n</current_markdown>')
    expect(contents[4].parts[0].text).toBe('난이도를 높여줘')
  })

  test('기획: 대화 히스토리는 최근 8개만', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }) as const)
    const contents = buildPlanningContents({ message: 'x', history })
    expect(contents.length).toBe(2 + 8 + 1)
    expect(contents[2].parts[0].text).toBe('m12')
  })

  test('분석: 히스토리 마지막이 같은 게임명이면 요청을 중복으로 넣지 않는다 (앱 분석 세션 흐름)', () => {
    const contents = buildAnalysisContents({ message: 'Royal Match', history: [{ role: 'user', content: 'Royal Match' }] })
    expect(contents.filter((c) => c.parts[0].text === 'Royal Match').length).toBe(1)
    expect(contents[0].parts[0].text).toContain('# 사용자 정의 프롬프트\n기본 분석 템플릿을 사용합니다.')
  })

  test('섹션 모드 지시는 첫 메시지에만 붙는다', () => {
    const contents = withSectionedOverride(buildPlanningContents({ message: 'x' }))
    expect(contents[0].parts[0].text!.endsWith(SECTIONED_MODE_OVERRIDE)).toBe(true)
    expect(contents[2].parts[0].text).toBe('x')
  })

  test('참조 파일은 요청과 관련된 것만, 앱과 같은 머리말로 붙는다', () => {
    const now = Date.now()
    const out = appendReferenceFiles('SYS', [{ id: '1', fileName: 'a.md', filePath: '', fileType: 'markdown', content: '고양이 생선 가게', createdAt: now, updatedAt: now }], '고양이')
    expect(out.startsWith('SYS\n\n---\n\n# 참조 파일')).toBe(true)
    expect(out).toContain('[참조 파일 1: a.md (markdown)]\n고양이 생선 가게')
    expect(appendReferenceFiles('SYS', [], 'x')).toBe('SYS')
  })

  test('기본 기획 템플릿은 9개 섹션으로 분할 생성된다', () => {
    expect(planningSections(SYSTEM_INSTRUCTION, true).length).toBe(9)
    expect(planningSections(SYSTEM_INSTRUCTION, false).length).toBe(0)
  })

  test('딸깍 추가 방향은 넘길 때만 프롬프트에 들어간다 (앱 딸깍은 그대로)', () => {
    const seed = rollIdeaSeed()
    expect(buildIdeaUserPrompt(seed, [])).not.toContain('추가 방향')
    expect(buildIdeaUserPrompt(seed, [], '퍼즐')).toContain('## 추가 방향 (반드시 반영하되, 재료와 충돌하면 이 방향을 우선하십시오)\n퍼즐')
  })
})

describe('응답 파싱 (앱과 공유)', () => {
  test('태그 안은 문서, 밖은 대화', () => {
    const r = parseDocumentResponse('안녕\n<markdown_content>\n# 문서\n</markdown_content>\n끝', 'planning')
    expect(r.markdown).toBe('\n# 문서\n')
    expect(r.chatText).toBe('안녕\n\n끝')
  })

  test('기획: 태그 없는 짧은 응답은 대화로만 본다', () => {
    expect(parseDocumentResponse('무엇을 바꿀까요?', 'planning')).toEqual({ chatText: '무엇을 바꿀까요?', markdown: '', unclosed: false })
  })

  test('분석: 태그가 없어도 문서로 보고 인용 번호를 지운다', () => {
    const r = parseDocumentResponse('매출 1위 [1, 2] 입니다', 'analysis')
    expect(r.markdown).toBe('매출 1위  입니다')
  })

  test('닫히지 않은 태그는 부분 문서로', () => {
    const r = parseDocumentResponse('<markdown_content># 반쯤', 'planning')
    expect(r).toEqual({ chatText: '', markdown: '# 반쯤', unclosed: true })
  })
})

describe('경로 보호', () => {
  const dataDir = tempDataDir()

  test('앱 데이터 폴더 안에는 쓸 수 없고, 이름이 비슷한 형제 폴더는 허용한다', () => {
    expect(() => assertWritable(join(dataDir, 'out'), dataDir)).toThrow('앱 데이터 폴더 안에는 쓸 수 없습니다')
    expect(() => assertWritable(`${dataDir}-exports`, dataDir)).not.toThrow()
    expect(isInside(join(dataDir, 'a', 'b'), dataDir)).toBe(true)
  })

  test('앱 데이터 폴더 파일(API 키가 든 settings.json)은 참조 문서로 읽지 않는다', () => {
    expect(() => assertReadableDocument(join(dataDir, 'settings.json'), dataDir)).toThrow('참조 문서로 쓸 수 없습니다')
  })

  test('writeUnique 는 덮어쓰지 않고 _2 를 붙인다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gp-mcp-out-'))
    const a = writeUnique(dir, 'plan', 'md', 'a')
    const b = writeUnique(dir, 'plan', 'md', 'b')
    expect(b.endsWith('plan_2.md')).toBe(true)
    expect(readFileSync(a, 'utf-8')).toBe('a')
  })

  test('파일 이름 정리 (금지 문자·Windows 예약 이름)', () => {
    expect(sanitizeName('a/b:c*?', 'x')).toBe('a_b_c__')
    expect(sanitizeName('con', 'x')).toBe('con_')
    expect(sanitizeName('   ', 'x')).toBe('x')
  })
})

describe('템플릿 해석', () => {
  test('기본 템플릿은 저장값이 아니라 코드 내용을 쓴다 (앱이 시작 때 덮어쓰는 규칙)', () => {
    const dataDir = tempDataDir({
      prompt_templates: [
        { id: 'default-planning', name: '기본', type: 'planning', content: '오래된 내용', isDefault: true, createdAt: 0, updatedAt: 0 },
        { id: 'template-1', name: '내 템플릿', type: 'planning', content: '내 내용'.repeat(20), isDefault: false, createdAt: 0, updatedAt: 0 },
      ],
      current_planning_template_id: 'template-1',
    })
    const templates = listTemplates(dataDir)
    expect(templates.find((t) => t.id === 'default-planning')!.content).toBe(SYSTEM_INSTRUCTION)
    // 저장소에 없는 기본 템플릿(분석·스토리)도 목록에 있다
    expect(templates.some((t) => t.id === 'default-analysis')).toBe(true)
    // 지정이 없으면 앱에서 선택된 템플릿
    expect(resolveTemplate(dataDir, undefined, TemplateType.PLANNING).id).toBe('template-1')
  })

  test('선택된 템플릿이 지워졌으면 기본 템플릿으로, 없는 id 를 지정하면 오류', () => {
    const dataDir = tempDataDir({ current_analysis_template_id: 'gone' })
    expect(resolveTemplate(dataDir, undefined, TemplateType.ANALYSIS).id).toBe('default-analysis')
    expect(() => resolveTemplate(dataDir, { id: 'nope' }, TemplateType.PLANNING)).toThrow('템플릿을 찾을 수 없습니다')
    expect(() => resolveTemplate(dataDir, { id: 'a', content: 'b' }, TemplateType.PLANNING)).toThrow('하나만')
  })

  test('.prompt 파일(앱 내보내기 JSON)과 일반 텍스트 파일을 읽는다', () => {
    const dataDir = tempDataDir()
    const dir = mkdtempSync(join(tmpdir(), 'gp-mcp-tpl-'))
    writeFileSync(join(dir, 'a.prompt'), JSON.stringify({ name: '분석 A', type: 'analysis', content: '본문' }))
    writeFileSync(join(dir, 'b.md'), '# 마크다운 본문')
    expect(resolveTemplate(dataDir, { path: join(dir, 'a.prompt') }, TemplateType.ANALYSIS)).toMatchObject({ name: '분석 A', type: 'analysis', content: '본문' })
    expect(resolveTemplate(dataDir, { path: join(dir, 'b.md') }, TemplateType.PLANNING)).toMatchObject({ name: 'b.md', content: '# 마크다운 본문' })
  })

  test('기획 템플릿 구조 미리보기: 양식 블록의 최상위 섹션 / 분할 불가', () => {
    expect(templateStructure(TemplateType.PLANNING, SYSTEM_INSTRUCTION).sections!.length).toBe(9)
    expect(templateStructure(TemplateType.PLANNING, '# 하나\n# 둘').mode).toContain('단일 호출')
  })
})

describe('앱 수신함·결과 형식', () => {
  test('수신함 항목은 버전·종류를 담아 .json 으로 완성되고(.tmp 없음) 대기 목록에 보인다', () => {
    const dataDir = tempDataDir()
    sendToApp(dataDir, { kind: 'template', payload: { template: { name: 'T', type: TemplateType.PLANNING, content: 'c' } } })
    sendToApp(dataDir, { kind: 'ideas', payload: { ideas: [] } })
    const files = readdirSync(join(dataDir, 'mcp-inbox'))
    expect(files.every((f) => f.endsWith('.json'))).toBe(true)
    const entry = JSON.parse(readFileSync(join(dataDir, 'mcp-inbox', files.sort()[0]), 'utf-8'))
    expect(entry).toMatchObject({ version: 1, source: 'gp-mcp', kind: 'template' })
    expect(pendingInbox(dataDir)).toMatchObject({ count: 2, by_kind: { template: 1, ideas: 1 }, templates: ['T'] })
  })

  test('.gplan 은 앱 세션 내보내기 형식(1.1)과 같다', () => {
    const gplan = JSON.parse(toGplan({ type: 'planning', title: 't', messages: [], markdownContent: '# x' }))
    expect(gplan).toMatchObject({ type: 'planning', title: 't', markdownContent: '# x', version: '1.1', versions: [], referenceFiles: [] })
    expect(gplan.id.startsWith('session-')).toBe(true)
  })

  test('아이디어 → 마크다운·기획 요청 (빈 심리 훅·영감 소재는 쓰지 않는다)', () => {
    const md = ideaToMarkdown({ title: '비만 점프', lines: ['a', 'b', 'c'], hook: '', inspiration: '' })
    expect(md).toBe('# 비만 점프\n\n1. a\n2. b\n3. c')
    expect(ideaToPlanningRequest({ title: 'T', lines: ['a'], hook: 'h', inspiration: '' }, '30대 여성')).toContain('## 추가 요청\n30대 여성')
  })
})
