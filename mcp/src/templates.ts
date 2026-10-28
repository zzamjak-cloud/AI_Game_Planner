/**
 * 템플릿 도구 — 조회(`gp_list_templates`·`gp_get_template`)와 등록(`gp_register_template`)
 *
 * 등록은 앱 수신함으로 보낸다(inbox.ts). 앱이 켜져 있으면 몇 초 안에, 꺼져 있으면 다음 실행 때 템플릿 목록에 들어간다.
 * 등록 전에 앱과 같은 규칙으로 검증하고(이름 1~100자, 본문 50~50,000자), 섹션 분할 구성을 미리 보여 준다 —
 * 기획 템플릿은 출력 양식(<markdown_content> 블록)의 최상위(#) 섹션이 3개 이상이어야 섹션 분할 생성이 된다.
 */

import { dirname, resolve } from 'node:path'
import { z } from 'zod'

import { TemplateType } from '../../src/types/promptTemplate'
import { planSections } from '../../src/lib/services/sectionedGeneration'
import { validateTemplateContent, validateTemplateName } from '../../src/lib/utils/template'

import { currentTemplateIds, listTemplates, readTemplateFile } from './appdata'
import { assertWritable, sanitizeName, writeUnique } from './env'
import { pendingInbox, sendToApp } from './inbox'
import { preview } from './output'
import { guarded, type RegisterTools } from './toolkit'

/** 템플릿이 생성에 어떻게 쓰이는지 미리보기 */
export function templateStructure(type: TemplateType, content: string) {
  if (type === TemplateType.ANALYSIS) {
    return {
      mode: '분석 — 앱 분석 래퍼(출력 형식·링크 규칙) 뒤에 이 템플릿이 "사용자 정의 프롬프트"로 들어간다. 단일 호출 + 웹 검색',
      headers: content.split('\n').filter((l) => /^#\s+\S/.test(l)).map((l) => l.replace(/^#\s+/, '').trim()),
    }
  }
  const sections = planSections(content)
  return {
    mode:
      sections.length > 0
        ? `섹션 분할 생성 — 신규 기획서는 섹션 ${sections.length}개를 순차 생성한다 (섹션당 요청 1회)`
        : '단일 호출 — <markdown_content> 출력 양식 블록이 없거나 최상위(#) 섹션이 3개 미만이다',
    sections: sections.map((s) => s.title),
  }
}

export const registerTemplateTools: RegisterTools = (server, { dataDir }) => {
  server.registerTool(
    'gp_list_templates',
    {
      description: '앱 템플릿 목록(기획·분석). 기본 템플릿과 사용자 템플릿, 현재 선택된 템플릿, 앱이 아직 가져가지 않은 등록 대기 템플릿.',
      inputSchema: {
        type: z.enum(['planning', 'analysis']).optional().describe('템플릿 종류 필터'),
      },
    },
    ({ type }) =>
      guarded(() => {
        const current = currentTemplateIds(dataDir)
        const templates = listTemplates(dataDir)
          .filter((t) => !type || t.type === type)
          .map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            is_default: t.isDefault,
            selected: t.id === current.planning || t.id === current.analysis,
            description: t.description ?? null,
            chars: t.content.length,
            updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
          }))
        return { total: templates.length, templates, pending_registration: pendingInbox(dataDir).templates }
      })
  )

  server.registerTool(
    'gp_get_template',
    {
      description:
        '템플릿 본문과 생성 구조(기획: 섹션 분할 목록 / 분석: 헤더)를 돌려준다. save_path 를 주면 앱에서 가져올 수 있는 .prompt 파일로도 저장한다.',
      inputSchema: {
        id: z.string().describe('템플릿 id (gp_list_templates)'),
        save_path: z.string().optional().describe('.prompt 로 저장할 절대 경로 (덮어쓰지 않는다)'),
      },
    },
    ({ id, save_path }) =>
      guarded(() => {
        const template = listTemplates(dataDir).find((t) => t.id === id)
        if (!template) throw new Error(`템플릿을 찾을 수 없습니다: ${id}. gp_list_templates 로 id 를 확인하세요.`)
        let saved: string | undefined
        if (save_path) {
          const full = resolve(save_path)
          assertWritable(full, dataDir)
          const base = sanitizeName(full.replace(/^.*[\\/]/, '').replace(/\.prompt$/i, ''), 'template')
          saved = writeUnique(dirname(full), base, 'prompt', JSON.stringify(template, null, 2))
        }
        return {
          id: template.id,
          name: template.name,
          type: template.type,
          is_default: template.isDefault,
          description: template.description ?? null,
          structure: templateStructure(template.type, template.content),
          content: template.content,
          saved_to: saved ?? null,
        }
      })
  )

  server.registerTool(
    'gp_register_template',
    {
      description: [
        '기획·분석 템플릿을 GamePlanner 앱에 등록한다. 앱 수신함으로 보내며, 앱이 켜져 있으면 몇 초 안에, 꺼져 있으면 다음 실행 때 템플릿 목록에 추가된다.',
        'content 또는 path(.prompt·.md·.txt) 로 본문을 준다. dry_run=true 면 검증과 생성 구조(섹션 분할 목록)만 돌려준다 — 등록 전에 확인하라.',
        '기획 템플릿은 <markdown_content> … </markdown_content> 출력 양식 안에 최상위(#) 섹션을 3개 이상 두어야 섹션 분할 생성이 된다(기본 템플릿 참고: gp_get_template id=default-planning).',
        'replace_existing=true 면 같은 이름의 사용자 템플릿을 갱신한다(기본 템플릿은 바꿀 수 없다).',
      ].join(' '),
      inputSchema: {
        name: z.string().optional().describe('템플릿 이름 (path 가 .prompt 면 생략 가능)'),
        type: z.enum(['planning', 'analysis']).optional().describe('종류 (path 가 .prompt 면 생략 가능, 기본 planning)'),
        content: z.string().optional().describe('템플릿 본문'),
        path: z.string().optional().describe('템플릿 파일 (.prompt — 앱 내보내기 JSON / .md·.txt)'),
        description: z.string().optional(),
        replace_existing: z.boolean().optional().describe('같은 이름의 사용자 템플릿을 갱신 (기본 false — 새로 추가)'),
        dry_run: z.boolean().optional(),
      },
    },
    (input) =>
      guarded(() => {
        if (!!input.content === !!input.path) throw new Error('content 와 path 중 하나만 지정하세요.')
        const fromFile = input.path ? readTemplateFile(input.path, dataDir) : undefined
        const content = input.content ?? fromFile!.content
        const name = (input.name ?? fromFile?.name ?? '').trim()
        const type = (input.type as TemplateType | undefined) ?? fromFile?.type ?? TemplateType.PLANNING
        const description = input.description ?? fromFile?.description

        const errors = [validateTemplateName(name), validateTemplateContent(content)].filter((v) => !v.valid).map((v) => v.error)
        if (!name) errors.unshift('name 이 필요합니다.')
        const existing = listTemplates(dataDir).filter((t) => t.name === name)
        if (existing.some((t) => t.isDefault) && input.replace_existing) errors.push(`"${name}" 은 기본 템플릿이라 바꿀 수 없습니다. 다른 이름을 쓰세요.`)

        const structure = templateStructure(type, content)
        const result = {
          name,
          type,
          chars: content.length,
          structure,
          action: existing.length > 0 && input.replace_existing ? '같은 이름 템플릿 갱신' : existing.length > 0 ? '새로 추가 (같은 이름이 이미 있음)' : '새로 추가',
          preview: preview(content, 200),
        }
        if (errors.length > 0) return { ok: false, errors, ...result }
        if (input.dry_run) return { ok: true, dry_run: true, ...result, note: '등록하려면 dry_run 을 빼고 다시 호출한다.' }

        const inboxFile = sendToApp(dataDir, {
          kind: 'template',
          payload: { template: { name, type, content, description, language: 'ko' }, replace_existing: !!input.replace_existing },
        })
        return {
          ok: true,
          ...result,
          inbox_file: inboxFile,
          note: '앱 수신함으로 보냈다. 앱이 켜져 있으면 몇 초 안에, 꺼져 있으면 다음 실행 때 템플릿 목록에 추가된다 (gp_list_templates 의 pending_registration 으로 대기 여부 확인).',
        }
      })
  )
}
