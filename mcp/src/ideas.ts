/**
 * 딸깍 아이디어 배치 (`gp_idea_batch`) — 앱 딸깍 버튼과 같은 랜덤 재료 조합·시스템 지시문으로 아이디어를 대량 생성한다.
 *
 * - 작업 단위 하나 = 아이디어 1개 = 요청 1회(형식 오류면 seed 를 바꿔 최대 2회 더).
 * - 중복 회피: 매 요청 직전에 "이번 배치에서 이미 나온 제목 + 앱 히스토리"의 최근 15개를 넘긴다(앱과 같은 개수).
 *   병렬로 돌기 때문에 동시에 나간 요청끼리는 서로를 모른다 — 다양성이 중요하면 concurrency 를 낮춘다.
 * - focus(추가 방향)는 앱에 없는 배치 전용 옵션이다. focuses 를 주면 아이디어마다 돌아가며 쓴다.
 * - 결과: `ideas.json`(앱 GameIdea 형식) + `ideas.md`. 응답 results 에 아이디어가 그대로 들어간다.
 */

import { z } from 'zod'

import type { GameIdea } from '../../src/types/idea'
import { generateGameIdea } from '../../src/lib/services/ideaService'

import { listIdeas } from './appdata'
import type { WorkUnit } from './engine'
import { sendToApp } from './inbox'
import { ideaToMarkdown } from './output'
import { runPlan } from './runner'
import { guarded, resolveDestDir, resolveModel, runSchema, type RegisterTools, type RunInput } from './toolkit'

/** 중복 회피용으로 모델에 넘길 최근 제목 개수 (앱 useIdeaGenerator 와 같다) */
const RECENT_TITLE_COUNT = 15

interface IdeaBatchInput extends RunInput {
  count: number
  focus?: string
  focuses?: string[]
  avoid_app_history?: boolean
}

async function ideaBatch(dataDir: string, input: IdeaBatchInput) {
  const model = resolveModel(dataDir, input.model)
  const destDir = resolveDestDir(dataDir, input.dest_dir, 'ideas')
  if (input.focus && input.focuses?.length) throw new Error('focus 와 focuses 는 함께 쓰지 않습니다.')
  const focuses = input.focuses?.map((f) => f.trim()).filter(Boolean) ?? (input.focus ? [input.focus] : [])

  // 이번 배치에서 나온 제목 (최신이 앞) — 실행 중에 계속 늘어난다
  const batchTitles: string[] = []
  const appTitles = input.avoid_app_history === false ? [] : listIdeas(dataDir).map((i) => i.title)

  const units: WorkUnit[] = Array.from({ length: input.count }, (_, index) => {
    const focus = focuses.length > 0 ? focuses[index % focuses.length] : undefined
    return {
      label: `idea_${String(index + 1).padStart(3, '0')}`,
      requests: 1,
      costKind: 'idea',
      run: async (ctx) => {
        const recent = [...batchTitles, ...appTitles].slice(0, RECENT_TITLE_COUNT)
        const idea = await generateGameIdea(ctx.apiKey, model, recent, {
          focus,
          // 형식 오류 재시도(최대 2회)는 같은 hooks 를 공유한다 — usage 는 시도마다 모두 집계된다
          ...ctx.hooks(),
        })
        batchTitles.unshift(idea.title)
        return { idea: { ...idea, focus: focus ?? null } }
      },
    }
  })

  const ideasOf = (records: { result?: unknown }[]): GameIdea[] =>
    records
      .map((r) => (r.result as { idea?: GameIdea & { focus?: string | null } } | undefined)?.idea)
      .filter((i): i is GameIdea & { focus?: string | null } => !!i)
      .map(({ focus: _focus, ...idea }) => idea)

  return runPlan(dataDir, {
    ...input,
    kind: 'ideas',
    model,
    units,
    destDir,
    defaultConcurrency: 6,
    breakdown: [{ count: input.count, focuses: focuses.length > 0 ? focuses : '없음 (앱 딸깍과 동일)', avoid_app_history: appTitles.length }],
    meta: { focuses, save_to_app: !!input.save_to_app },
    finalize: ({ records, save }) => {
      // 생성 순서(요청 순서)대로 모은다
      const ideas = ideasOf(records)
      if (ideas.length === 0) return
      save(destDir, 'ideas', 'json', JSON.stringify(ideas, null, 2))
      save(destDir, 'ideas', 'md', ideas.map((idea) => ideaToMarkdown(idea, '##')).join('\n\n---\n\n'))
      // 앱 히스토리는 최신이 앞 — 마지막에 만든 것이 맨 위로 가게 뒤집어 보낸다
      if (input.save_to_app) sendToApp(dataDir, { kind: 'ideas', payload: { ideas: [...ideas].reverse() } })
    },
  })
}

export const registerIdeaTools: RegisterTools = (server, { dataDir }) => {
  server.registerTool(
    'gp_idea_batch',
    {
      description: [
        'GamePlanner 딸깍과 같은 방식(랜덤 영감 소재·심리 트리거·비틀기·포맷 조합)으로 게임 코어 아이디어(제목 + 3줄 + 심리 훅)를 대량 생성한다 (백그라운드 작업, 아이디어 1개 = 요청 1회).',
        'focus: 모든 아이디어에 반영할 추가 방향(예: "퍼즐 장르", "세로 화면 원터치") / focuses: 아이디어마다 돌아가며 쓸 방향 목록.',
        '결과는 ideas.json·ideas.md 와 응답 results[].idea. 마음에 드는 것은 gp_plan_batch 의 tasks[].idea 로 넘겨 기획서로 만든다.',
        'save_to_app=true 면 앱 딸깍 히스토리에 추가한다.',
      ].join(' '),
      inputSchema: {
        count: z.number().int().min(1).max(1000).describe('만들 아이디어 수'),
        focus: z.string().optional().describe('모든 아이디어에 반영할 추가 방향'),
        focuses: z.array(z.string()).max(100).optional().describe('아이디어마다 돌아가며 쓸 방향 목록'),
        avoid_app_history: z.boolean().optional().describe('앱 히스토리 제목을 중복 회피 목록에 넣을지 (기본 true)'),
        ...runSchema,
      },
    },
    (input) => guarded(() => ideaBatch(dataDir, input as IdeaBatchInput))
  )
}
