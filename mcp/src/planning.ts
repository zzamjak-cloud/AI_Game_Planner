/**
 * 기획서 배치 (`gp_plan_batch`) — 앱 기획 세션과 같은 템플릿·참조 파일·섹션 분할 생성으로 기획서 여러 건을 만든다.
 *
 * - 작업 하나 = 신규 기획서 1건. 입력은 자유 요청(prompt) 또는 딸깍 아이디어(idea / idea_id).
 * - 템플릿은 공통(template) 또는 작업별(tasks[].template). 생략하면 앱에서 현재 선택된 기획 템플릿.
 * - 참조 문서(pdf·xlsx·웹 등)·기존 앱 세션의 참조 파일을 앱과 같은 규칙으로 시스템 프롬프트에 붙인다.
 * - 결과: `<이름>.md` (+ 선택 `.gplan`), save_to_app 이면 앱 수신함으로 세션을 보낸다.
 */

import { z } from 'zod'

import { TemplateType } from '../../src/types/promptTemplate'
import type { GameIdea } from '../../src/types/idea'
import type { ReferenceFile } from '../../src/types/referenceFile'
import { appendReferenceFiles } from '../../src/lib/prompts/documentPrompt'
import { extractGameNameFromPlanning } from '../../src/lib/utils/markdown'

import { getSession, listIdeas, resolveTemplate, type ResolvedTemplate } from './appdata'
import { loadDocuments } from './documents'
import type { WorkUnit } from './engine'
import { generatePlanning, planningSections } from './generate'
import { sendToApp } from './inbox'
import { documentBaseName, ideaToMarkdown, preview, toGplan } from './output'
import { runPlan } from './runner'
import { documentsSchema, guarded, resolveDestDir, resolveModel, runSchema, templateSchema, type RegisterTools, type RunInput } from './toolkit'

const ideaSchema = z.object({
  title: z.string(),
  lines: z.array(z.string()).min(1).max(10),
  hook: z.string().optional(),
  inspiration: z.string().optional(),
})

interface PlanTaskInput {
  name?: string
  prompt?: string
  idea?: z.infer<typeof ideaSchema>
  idea_id?: string
  template?: { id?: string; path?: string; content?: string }
  reference_documents?: { name?: string; content?: string; path?: string; url?: string }[]
}

interface PlanBatchInput extends RunInput {
  tasks: PlanTaskInput[]
  template?: { id?: string; path?: string; content?: string }
  reference_documents?: PlanTaskInput['reference_documents']
  reference_session_id?: string
  instruction?: string
  write_gplan?: boolean
}

/** 딸깍 아이디어 → 기획 요청문 */
export function ideaToPlanningRequest(idea: Pick<GameIdea, 'title' | 'lines' | 'hook' | 'inspiration'>, instruction?: string): string {
  return [
    '아래 게임 코어 아이디어를 바탕으로 게임 기획서를 작성해주세요.',
    '',
    ideaToMarkdown(idea, '##'),
    instruction ? `\n## 추가 요청\n${instruction}` : '',
  ]
    .join('\n')
    .trim()
}

async function planBatch(dataDir: string, input: PlanBatchInput) {
  const model = resolveModel(dataDir, input.model)
  const destDir = resolveDestDir(dataDir, input.dest_dir, 'plan')
  const appIdeas = input.tasks.some((t) => t.idea_id) ? listIdeas(dataDir) : []

  // 공통 참조 파일: 기존 세션의 참조 파일 + 공통 문서 (실행 전에 읽어 오류를 일찍 알린다)
  const sharedRefs: ReferenceFile[] = []
  if (input.reference_session_id) sharedRefs.push(...(getSession(dataDir, input.reference_session_id).referenceFiles ?? []))
  sharedRefs.push(...(await loadDocuments(dataDir, input.reference_documents)))
  const sharedTemplate = input.template ? resolveTemplate(dataDir, input.template, TemplateType.PLANNING) : undefined

  const units: WorkUnit[] = []
  const breakdown: unknown[] = []
  for (const [index, task] of input.tasks.entries()) {
    const sources = [task.prompt, task.idea, task.idea_id].filter((v) => v !== undefined)
    if (sources.length !== 1) throw new Error(`tasks[${index}]: prompt · idea · idea_id 중 하나만 지정하세요.`)

    let message: string
    let label: string | undefined = task.name
    if (task.prompt) {
      message = input.instruction ? `${task.prompt}\n\n${input.instruction}` : task.prompt
    } else {
      const idea = task.idea
        ? { hook: '', inspiration: '', ...task.idea }
        : appIdeas.find((i) => i.id === task.idea_id)
      if (!idea) throw new Error(`tasks[${index}]: 앱 아이디어를 찾을 수 없습니다: ${task.idea_id}. gp_list_ideas 로 id 를 확인하세요.`)
      message = ideaToPlanningRequest(idea, input.instruction)
      label ??= idea.title
    }

    const template: ResolvedTemplate = task.template
      ? resolveTemplate(dataDir, task.template, TemplateType.PLANNING)
      : sharedTemplate ?? resolveTemplate(dataDir, undefined, TemplateType.PLANNING)
    if (template.type === TemplateType.ANALYSIS) {
      throw new Error(`tasks[${index}]: 분석 템플릿(${template.name})으로는 기획서를 만들 수 없습니다. 기획 템플릿을 지정하세요.`)
    }
    const refs = [...sharedRefs, ...(await loadDocuments(dataDir, task.reference_documents))]
    // 앱과 같은 규칙: 템플릿 + (요청과 관련된) 참조 파일
    const systemPrompt = appendReferenceFiles(template.content, refs, message)
    const sections = planningSections(systemPrompt, true)
    const unitLabel = label ?? `plan_${index + 1}`

    breakdown.push({
      task: unitLabel,
      template: template.name,
      template_id: template.id ?? null,
      sections: sections.length > 0 ? sections.map((s) => s.title) : '분할 불가 — 단일 호출',
      reference_files: refs.map((r) => r.fileName),
      request_preview: preview(message, 200),
    })

    units.push({
      label: unitLabel,
      requests: Math.max(1, sections.length),
      costKind: 'plan',
      run: async (ctx) => {
        let partialSaved: string | undefined
        const result = await generatePlanning(
          {
            apiKey: ctx.apiKey,
            model,
            hooks: ctx.hooks,
            onPartial: (md) => {
              partialSaved = ctx.save(destDir, `${documentBaseName(label, extractGameNameFromPlanning(md), unitLabel)}_partial`, 'md', md)
            },
          },
          { systemPrompt, message }
        ).catch((error) => {
          if (partialSaved) (error as Error).message += ` — 받은 부분은 ${partialSaved} 에 저장`
          throw error
        })
        if (!result.markdown.trim()) throw new Error(`기획서 본문이 비어 있습니다. 모델 응답: ${preview(result.chatText, 200)}`)

        const gameName = extractGameNameFromPlanning(result.markdown)
        const base = documentBaseName(label, gameName, unitLabel)
        const file = ctx.save(destDir, base, 'md', result.markdown)
        if (result.truncated) ctx.warn('일부 섹션이 이어쓰기 한도 내에서 완결되지 않았을 수 있습니다')

        const session = {
          type: 'planning' as const,
          title: gameName || label || '기획서 초안',
          messages: [
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: result.chatText },
          ],
          markdownContent: result.markdown,
          templateId: template.id,
        }
        const gplan = input.write_gplan ? ctx.save(destDir, base, 'gplan', toGplan(session)) : undefined
        const inbox = input.save_to_app ? sendToApp(dataDir, { kind: 'session', payload: { session } }) : undefined
        return {
          game_name: gameName,
          file,
          gplan,
          sent_to_app: !!inbox,
          chars: result.markdown.length,
          sections: result.sections?.length ?? null,
          truncated: result.truncated,
        }
      },
    })
  }

  return runPlan(dataDir, {
    ...input,
    kind: 'plan',
    model,
    units,
    destDir,
    defaultConcurrency: 3,
    breakdown,
    meta: { reference_session_id: input.reference_session_id ?? null, save_to_app: !!input.save_to_app },
  })
}

export const registerPlanningTools: RegisterTools = (server, { dataDir }) => {
  server.registerTool(
    'gp_plan_batch',
    {
      description: [
        'GamePlanner 기획 세션과 같은 방식(템플릿 + 참조 파일 + 섹션 분할 순차 생성)으로 게임 기획서를 여러 건 만들어 마크다운 파일로 저장한다 (백그라운드 작업).',
        'tasks[]: 기획서 1건씩 — prompt(자유 요청) · idea({title, lines[], hook}) · idea_id(앱 딸깍 히스토리, gp_list_ideas) 중 하나.',
        'template: 공통 기획 템플릿 {id|path|content}, 생략하면 앱에서 선택된 템플릿. 템플릿의 최상위(#) 섹션 수만큼 요청이 나간다(섹션당 1회).',
        'reference_documents / reference_session_id: 참조 문서(pdf·xlsx·csv·md·웹·구글 시트) 또는 앱 세션의 참조 파일.',
        'save_to_app=true 면 완료된 기획서를 앱 기획 세션으로 추가한다. dry_run=true 로 섹션 구성·요청 수·견적을 먼저 확인하라.',
      ].join(' '),
      inputSchema: {
        tasks: z
          .array(
            z.object({
              name: z.string().optional().describe('파일 이름·세션 제목 (생략 시 기획서의 게임명)'),
              prompt: z.string().optional().describe('기획 요청 (예: "고양이가 생선 가게를 운영하는 방치형 게임")'),
              idea: ideaSchema.optional().describe('딸깍 아이디어 객체 (gp_idea_batch 결과 그대로)'),
              idea_id: z.string().optional().describe('앱 딸깍 히스토리의 아이디어 id'),
              template: templateSchema.describe('이 작업만 다른 템플릿'),
              reference_documents: documentsSchema.describe('이 작업만의 참조 문서'),
            })
          )
          .min(1)
          .max(200),
        template: templateSchema,
        reference_documents: documentsSchema.describe('모든 작업 공통 참조 문서'),
        reference_session_id: z.string().optional().describe('앱 세션의 참조 파일을 공통 참조로 (gp_list_sessions)'),
        instruction: z.string().optional().describe('모든 작업 요청 뒤에 덧붙일 공통 지시 (예: "타겟은 30대 여성")'),
        write_gplan: z.boolean().optional().describe('앱에서 "세션 불러오기"로 열 수 있는 .gplan 도 함께 저장 (기본 false)'),
        ...runSchema,
      },
    },
    (input) => guarded(() => planBatch(dataDir, input as PlanBatchInput))
  )
}
