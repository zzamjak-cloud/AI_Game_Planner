/**
 * 문서 수정 체인 (`gp_revise_batch`) — 앱 채팅에서 "○○을 바꿔줘" 를 이어서 보내는 것과 같다.
 *
 * - 체인 하나 = 기존 문서 1건 + 순차 수정 지시 N개. 단계마다 직전 결과를 "현재 문서"로 넣고
 *   직전 대화를 히스토리로 넣는다(앱과 같은 프롬프트: 요청 부분만 수정, 나머지 유지).
 * - 출발 문서: 앱 세션(session_id — 대화 히스토리·템플릿도 이어받는다) · 파일(source_path) · 본문(content).
 * - 체인끼리는 병렬, 체인 안은 순차. 단계마다 `<이름>_stepNN.md` 를 저장한다(과금된 중간 결과를 버리지 않는다).
 * - 앱 세션은 수정하지 않는다. save_to_app 이면 최종 결과를 새 세션으로 보낸다.
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { z } from 'zod'

import { TemplateType } from '../../src/types/promptTemplate'
import type { ChatTurn } from '../../src/lib/prompts/documentPrompt'
import { appendReferenceFiles } from '../../src/lib/prompts/documentPrompt'
import { extractGameNameFromAnalysis, extractGameNameFromPlanning } from '../../src/lib/utils/markdown'

import { getSession, resolveTemplate, type StoredSession } from './appdata'
import { assertReadableDocument } from './env'
import type { WorkUnit } from './engine'
import { generateAnalysis, generatePlanning, type GenerationResult } from './generate'
import { sendToApp } from './inbox'
import { documentBaseName, preview, toGplan } from './output'
import { runPlan } from './runner'
import { guarded, resolveDestDir, resolveModel, runSchema, templateSchema, type RegisterTools, type RunInput } from './toolkit'

type DocKind = 'planning' | 'analysis'

interface ReviseTaskInput {
  name?: string
  kind?: DocKind
  session_id?: string
  source_path?: string
  content?: string
  instructions: string[]
  template?: { id?: string; path?: string; content?: string }
}

interface ReviseBatchInput extends RunInput {
  tasks: ReviseTaskInput[]
  write_gplan?: boolean
}

/** 출발 문서 파일 읽기 (.md·.txt 본문 / .gplan 세션 내보내기) */
function readSource(path: string, dataDir: string): { markdown: string; session?: Partial<StoredSession> } {
  const full = resolve(path)
  if (!existsSync(full)) throw new Error(`문서를 찾을 수 없습니다: ${full}`)
  assertReadableDocument(full, dataDir)
  const text = readFileSync(full, 'utf-8')
  if (extname(full).toLowerCase() === '.gplan') {
    const session = JSON.parse(text) as Partial<StoredSession>
    return { markdown: session.markdownContent ?? '', session }
  }
  return { markdown: text }
}

async function reviseBatch(dataDir: string, input: ReviseBatchInput) {
  const model = resolveModel(dataDir, input.model)
  const destDir = resolveDestDir(dataDir, input.dest_dir, 'revise')

  const units: WorkUnit[] = []
  const breakdown: unknown[] = []
  for (const [index, task] of input.tasks.entries()) {
    const sources = [task.session_id, task.source_path, task.content].filter((v) => v !== undefined && v !== '')
    if (sources.length !== 1) throw new Error(`tasks[${index}]: session_id · source_path · content 중 하나만 지정하세요.`)
    const instructions = task.instructions.map((s) => s.trim()).filter(Boolean)
    if (instructions.length === 0) throw new Error(`tasks[${index}]: instructions 가 비어 있습니다.`)

    // 출발 문서·대화·템플릿
    let markdown = task.content ?? ''
    let session: Partial<StoredSession> | undefined
    if (task.session_id) {
      session = getSession(dataDir, task.session_id)
      markdown = session.markdownContent ?? ''
    } else if (task.source_path) {
      ;({ markdown, session } = readSource(task.source_path, dataDir))
    }
    if (!markdown.trim()) throw new Error(`tasks[${index}]: 수정할 문서 본문이 비어 있습니다.`)

    const kind: DocKind = task.kind ?? (session?.type === 'analysis' ? 'analysis' : 'planning')
    const templateType = kind === 'analysis' ? TemplateType.ANALYSIS : TemplateType.PLANNING
    // 템플릿: 지정값 → 세션 템플릿 → 앱에서 선택된 템플릿
    const template = resolveTemplate(dataDir, task.template ?? (session?.templateId ? { id: session.templateId } : undefined), templateType)
    const history: ChatTurn[] = (session?.messages ?? []).filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
    )
    const extracted = kind === 'analysis' ? extractGameNameFromAnalysis(markdown) : extractGameNameFromPlanning(markdown)
    const fallback = `revise_${index + 1}`
    const label =
      task.name ??
      (task.source_path ? basename(task.source_path, extname(task.source_path)) : undefined) ??
      session?.title ??
      extracted ??
      fallback
    const base = documentBaseName(label, extracted, fallback)

    breakdown.push({
      task: label,
      kind,
      source: task.session_id ? `session:${task.session_id}` : task.source_path ?? 'content',
      template: template.name,
      history_turns: history.length,
      steps: instructions.map((s) => preview(s, 120)),
    })

    units.push({
      label,
      requests: instructions.length,
      costKind: kind === 'analysis' ? 'revise-analysis' : 'revise-plan',
      run: async (ctx) => {
        let current = markdown
        const turns = [...history]
        const steps: { step: number; file: string; truncated: boolean }[] = []
        let last: GenerationResult | undefined
        for (const [i, instruction] of instructions.entries()) {
          const step = String(i + 1).padStart(2, '0')
          const env = {
            apiKey: ctx.apiKey,
            model,
            hooks: ctx.hooks,
            onPartial: (md: string) => ctx.save(destDir, `${base}_step${step}_partial`, 'md', md),
          }
          last =
            kind === 'analysis'
              ? await generateAnalysis(env, { templatePrompt: template.content, message: instruction, currentAnalysis: current, history: turns })
              : await generatePlanning(env, {
                  // 앱처럼 세션 참조 파일을 수정 요청에도 붙인다
                  systemPrompt: appendReferenceFiles(template.content, session?.referenceFiles, instruction),
                  message: instruction,
                  currentMarkdown: current,
                  history: turns,
                })
          if (!last.markdown.trim()) {
            // 모델이 문서 없이 대화로만 답했다 — 문서는 그대로 두고 다음 단계로
            ctx.warn(`${i + 1}단계: 문서 없이 대화로만 응답 — "${preview(last.chatText, 120)}"`)
          } else {
            current = last.markdown
            steps.push({ step: i + 1, file: ctx.save(destDir, `${base}_step${step}`, 'md', current), truncated: last.truncated })
          }
          if (last.truncated) ctx.warn(`${i + 1}단계: 이어쓰기 한도 내에서 완결되지 않았을 수 있습니다`)
          turns.push({ role: 'user', content: instruction }, { role: 'assistant', content: last.chatText })
        }

        const sessionOut = {
          type: kind,
          title: `${session?.title ?? extracted ?? label} (수정)`,
          messages: turns,
          markdownContent: current,
          templateId: template.id,
          gameName: session?.gameName,
          analysisStatus: kind === 'analysis' ? ('completed' as const) : undefined,
        }
        const gplan = input.write_gplan ? ctx.save(destDir, base, 'gplan', toGplan(sessionOut)) : undefined
        const inbox = input.save_to_app ? sendToApp(dataDir, { kind: 'session', payload: { session: sessionOut } }) : undefined
        return {
          final_file: steps[steps.length - 1]?.file ?? null,
          steps,
          gplan,
          sent_to_app: !!inbox,
          last_reply: last ? preview(last.chatText, 300) : null,
        }
      },
    })
  }

  return runPlan(dataDir, {
    ...input,
    kind: 'revise',
    model,
    units,
    destDir,
    defaultConcurrency: 3,
    breakdown,
    meta: { save_to_app: !!input.save_to_app },
  })
}

export const registerReviseTools: RegisterTools = (server, { dataDir }) => {
  server.registerTool(
    'gp_revise_batch',
    {
      description: [
        '기존 기획서·분석 보고서에 수정 지시를 순차로 적용한다 — 앱 채팅에서 이어서 요청하는 것과 같다 (요청 부분만 수정, 나머지 유지).',
        'tasks[]: 문서 1건 + instructions[](순서대로 적용, 단계당 요청 1회). 출발 문서는 session_id(앱 세션 — 대화·템플릿·참조 파일도 이어받음) · source_path(.md/.gplan) · content 중 하나.',
        '단계마다 <이름>_stepNN.md 를 저장한다. 앱 세션은 바꾸지 않으며 save_to_app=true 면 최종본을 새 세션으로 추가한다.',
      ].join(' '),
      inputSchema: {
        tasks: z
          .array(
            z.object({
              name: z.string().optional().describe('파일 이름'),
              kind: z.enum(['planning', 'analysis']).optional().describe('문서 종류 (세션이면 세션 타입, 아니면 planning)'),
              session_id: z.string().optional().describe('앱 세션 id (gp_list_sessions)'),
              source_path: z.string().optional().describe('문서 파일 (.md·.txt 또는 .gplan)'),
              content: z.string().optional().describe('문서 본문 직접 지정'),
              instructions: z.array(z.string()).min(1).max(20).describe('순서대로 적용할 수정 지시'),
              template: templateSchema.describe('생략하면 세션 템플릿 → 앱에서 선택된 템플릿'),
            })
          )
          .min(1)
          .max(100),
        write_gplan: z.boolean().optional().describe('최종본을 .gplan 으로도 저장 (기본 false)'),
        ...runSchema,
      },
    },
    (input) => guarded(() => reviseBatch(dataDir, input as ReviseBatchInput))
  )
}
