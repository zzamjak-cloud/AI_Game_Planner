/**
 * 게임 분석 배치 (`gp_analyze_batch`) — 앱 분석 세션과 같은 분석 래퍼·템플릿·웹 검색으로 게임 여러 개를 분석한다.
 *
 * - 작업 하나 = 게임 1개 = 요청 1회(+잘리면 자동 이어쓰기). 웹 검색(`:online`) 비용이 함께 든다.
 * - 앱과 같은 요청: 첫 사용자 메시지가 게임명이다 (추가 지시는 게임명 뒤에 붙인다).
 * - 결과: `<게임명>_분석.md` (+ 선택 `.gplan`), save_to_app 이면 앱 분석 세션으로 보낸다.
 */

import { z } from 'zod'

import { TemplateType } from '../../src/types/promptTemplate'

import { resolveTemplate } from './appdata'
import type { WorkUnit } from './engine'
import { generateAnalysis } from './generate'
import { sendToApp } from './inbox'
import { documentBaseName, preview, toGplan } from './output'
import { runPlan } from './runner'
import { guarded, resolveDestDir, resolveModel, runSchema, templateSchema, type RegisterTools, type RunInput } from './toolkit'

interface AnalyzeBatchInput extends RunInput {
  games: (string | { game: string; name?: string; instruction?: string })[]
  template?: { id?: string; path?: string; content?: string }
  instruction?: string
  write_gplan?: boolean
}

async function analyzeBatch(dataDir: string, input: AnalyzeBatchInput) {
  const model = resolveModel(dataDir, input.model)
  const destDir = resolveDestDir(dataDir, input.dest_dir, 'analysis')
  const template = resolveTemplate(dataDir, input.template, TemplateType.ANALYSIS)
  if (template.type === TemplateType.PLANNING) {
    throw new Error(`기획 템플릿(${template.name})으로는 분석할 수 없습니다. 분석 템플릿을 지정하세요.`)
  }

  const units: WorkUnit[] = []
  const breakdown: unknown[] = []
  for (const [index, raw] of input.games.entries()) {
    const task = typeof raw === 'string' ? { game: raw } : raw
    const game = task.game.trim()
    if (!game) throw new Error(`games[${index}]: 게임명이 비어 있습니다.`)
    const extra = [input.instruction, typeof raw === 'string' ? undefined : raw.instruction].filter(Boolean).join('\n')
    // 앱은 게임명만 보낸다 — 추가 지시가 있을 때만 뒤에 붙인다
    const message = extra ? `${game}\n\n${extra}` : game
    const label = task.name ?? game

    breakdown.push({ game, template: template.name, template_id: template.id ?? null, request_preview: preview(message, 200) })

    units.push({
      label,
      requests: 1,
      costKind: 'analysis',
      run: async (ctx) => {
        const base = documentBaseName(task.name, `${game}_분석`, `analysis_${index + 1}`)
        const result = await generateAnalysis(
          {
            apiKey: ctx.apiKey,
            model,
            hooks: ctx.hooks,
            onPartial: (md) => ctx.save(destDir, `${base}_partial`, 'md', md),
          },
          { templatePrompt: template.content, message }
        )
        if (!result.markdown.trim()) throw new Error(`분석 본문이 비어 있습니다. 모델 응답: ${preview(result.chatText, 200)}`)
        const file = ctx.save(destDir, base, 'md', result.markdown)
        if (result.truncated) ctx.warn('보고서가 이어쓰기 한도 내에서 완결되지 않았을 수 있습니다')

        const session = {
          type: 'analysis' as const,
          // 앱 generateSessionTitle 과 같은 제목 (스토어를 번들에 넣지 않으려고 직접 만든다)
          title: `${game} 분석`,
          messages: [
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: result.chatText },
          ],
          markdownContent: result.markdown,
          templateId: template.id,
          gameName: game,
          analysisStatus: 'completed' as const,
        }
        const gplan = input.write_gplan ? ctx.save(destDir, base, 'gplan', toGplan(session)) : undefined
        const inbox = input.save_to_app ? sendToApp(dataDir, { kind: 'session', payload: { session } }) : undefined
        return { game, file, gplan, sent_to_app: !!inbox, chars: result.markdown.length, truncated: result.truncated }
      },
    })
  }

  return runPlan(dataDir, {
    ...input,
    kind: 'analysis',
    model,
    units,
    destDir,
    defaultConcurrency: 3,
    breakdown,
    meta: { template: template.name, template_id: template.id ?? null, save_to_app: !!input.save_to_app },
  })
}

export const registerAnalysisTools: RegisterTools = (server, { dataDir }) => {
  server.registerTool(
    'gp_analyze_batch',
    {
      description: [
        'GamePlanner 분석 세션과 같은 방식(분석 래퍼 + 분석 템플릿 + 웹 검색)으로 게임 여러 개의 분석 보고서를 만들어 마크다운 파일로 저장한다 (백그라운드 작업).',
        'games: 게임명 목록 또는 {game, name, instruction}. 게임 1개 = 요청 1회(웹 검색 비용 포함).',
        'template: 분석 템플릿 {id|path|content}, 생략하면 앱에서 선택된 분석 템플릿.',
        'save_to_app=true 면 완료된 보고서를 앱 분석 세션으로 추가한다.',
      ].join(' '),
      inputSchema: {
        games: z
          .array(
            z.union([
              z.string(),
              z.object({
                game: z.string().describe('게임명'),
                name: z.string().optional().describe('파일 이름 (기본 "<게임명>_분석")'),
                instruction: z.string().optional().describe('이 게임만의 추가 지시 (예: "BM 위주로")'),
              }),
            ])
          )
          .min(1)
          .max(200),
        template: templateSchema,
        instruction: z.string().optional().describe('모든 게임 공통 추가 지시'),
        write_gplan: z.boolean().optional().describe('앱에서 "세션 불러오기"로 열 수 있는 .gplan 도 함께 저장 (기본 false)'),
        ...runSchema,
      },
    },
    (input) => guarded(() => analyzeBatch(dataDir, input as AnalyzeBatchInput))
  )
}
