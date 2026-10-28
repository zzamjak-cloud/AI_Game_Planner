/**
 * GamePlanner MCP 서버 (`gp-mcp`) — AI 에이전트용 기획·분석·아이디어 배치
 *
 * Claude Code·Codex 같은 로컬 에이전트가 GamePlanner 의 기능(템플릿 기반 기획서 작성, 게임 분석,
 * 딸깍 아이디어 생성, 템플릿 등록, 저장된 기획서·분석 보고서 조회)을 앱 없이 대량으로 쓰게 한다.
 * - 앱이 꺼져 있어도 동작한다. OpenRouter 키·모델은 앱 설정(settings.json)에서 읽는다.
 * - 결과는 파일로 남긴다. 앱에 넣을 것(템플릿·세션·아이디어)은 수신함으로만 보낸다 — 앱 저장소에 직접 쓰지 않는다.
 * - 프롬프트·섹션 분할·응답 파싱은 앱 소스(`src/`)를 그대로 번들해 앱과 어긋나지 않는다.
 * - stdout 은 MCP 프로토콜 전용이다. 진단은 stderr 로만 낸다 (stdio-guard 가 첫 import).
 *
 * → docs/mcp.md
 */

import './stdio-guard'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolve } from 'node:path'
import { z } from 'zod'

import appPackage from '../../package.json'
import {
  AUX_MODEL,
  GENERATION_CONFIG,
  IDEA_GENERATION_CONFIG,
  OPENROUTER_API_BASE_URL,
  SELECTABLE_MODELS,
} from '../../src/lib/constants/api'

import { getSession, listIdeas, listSessions, sessionSummary } from './appdata'
import { allAverages } from './costlog'
import { apiKeySource, assertWritable, defaultDestDir, defaultOutputRoot, getApiKey, getAppChatModel, hasApiKey, resolveDataDir, sanitizeName, stateDir, writeUnique } from './env'
import { getJob, jobSummary, listJobs, waitForJob } from './engine'
import { inboxDir, pendingInbox } from './inbox'
import { ideaToMarkdown, toGplan } from './output'
import { guarded, type ToolContext } from './toolkit'
import { registerAnalysisTools } from './analysis'
import { registerIdeaTools } from './ideas'
import { registerPlanningTools } from './planning'
import { registerReviseTools } from './revise'
import { registerTemplateTools } from './templates'

// 앱 버전과 같다 — 앱이 다운로드한 실행 파일·번들 스크립트가 현재 앱과 맞는지 --version 으로 검증한다
const VERSION: string = appPackage.version
const dataDir = resolveDataDir()
const ctx: ToolContext = { dataDir }

const server = new McpServer(
  { name: 'ai-game-planner', version: VERSION },
  {
    instructions: [
      'GamePlanner(AI 게임 기획 앱)의 기획서 작성·게임 분석·딸깍 아이디어·템플릿 기능을 배치로 쓰는 서버다. 앱이 꺼져 있어도 앱 설정의 OpenRouter 키로 동작하며 결과는 마크다운·JSON 파일로 저장한다.',
      '생성 도구: gp_idea_batch(게임 코어 아이디어 대량) · gp_plan_batch(템플릿 기반 기획서 — 섹션 분할 생성) · gp_analyze_batch(게임 분석 보고서 — 웹 검색) · gp_revise_batch(기존 문서에 수정 지시를 순차 적용).',
      '템플릿: gp_list_templates → gp_get_template(본문·섹션 구조) → gp_register_template(dry_run 으로 검증 후 앱에 등록). 기존 결과물: gp_list_sessions · gp_get_session · gp_export_sessions · gp_list_ideas.',
      '권장 흐름: gp_info(키·모델 확인) → 생성 도구를 dry_run=true 로 호출해 구성·요청 수·견적 확인 → 실행 → gp_job_status 로 진행 확인 → 결과 파일을 읽어 활용.',
      '예: 아이디어 50개(gp_idea_batch) → 마음에 드는 것을 gp_plan_batch tasks[].idea 로 기획서화 → 레퍼런스 게임은 gp_analyze_batch 로 분석.',
      '실행은 백그라운드 작업이다. 기획서 1건은 섹션 수만큼 요청하므로 수 분 걸린다 — 응답이 running 이면 gp_job_status(job_id) 로 다시 조회한다.',
      'save_to_app=true 면 결과를 앱 세션·딸깍 히스토리에 추가한다(앱 수신함 경유). 기본은 파일만 만든다.',
    ].join('\n'),
  }
)

// ───────────────────────── 조회 ─────────────────────────

server.registerTool(
  'gp_info',
  {
    description: '서버 상태: 앱 데이터 경로, OpenRouter 키 설정 여부·출처와 크레딧, 앱에서 고른 모델, 기본 출력 폴더, 수신함 대기 항목, 진행 중 작업.',
    inputSchema: {},
  },
  () =>
    guarded(async () => {
      let credit: unknown = null
      if (hasApiKey(dataDir)) {
        try {
          const res = await fetch(`${OPENROUTER_API_BASE_URL}/key`, {
            headers: { Authorization: `Bearer ${getApiKey(dataDir)}` },
            signal: AbortSignal.timeout(15_000),
          })
          const body = (await res.json()) as { data?: Record<string, unknown> }
          const d = body.data ?? {}
          credit = { usage_usd: d.usage ?? null, limit_usd: d.limit ?? null, limit_remaining_usd: d.limit_remaining ?? null }
        } catch {
          credit = '조회 실패'
        }
      }
      return {
        version: VERSION,
        data_dir: dataDir,
        api_key_configured: hasApiKey(dataDir),
        // env 면 OPENROUTER_API_KEY 환경변수 계정으로 과금된다 (앱에 저장된 키가 아님)
        api_key_source: apiKeySource(),
        credit,
        app_model: getAppChatModel(dataDir),
        default_output_dir: defaultOutputRoot(),
        state_dir: stateDir(),
        inbox: { dir: inboxDir(dataDir), pending: pendingInbox(dataDir) },
        jobs: listJobs().map((j) => ({ job_id: j.id, kind: j.kind, status: j.status, progress: `${j.completed + j.failed}/${j.total}` })),
      }
    })
)

server.registerTool(
  'gp_models',
  {
    description: '선택 가능한 본문 모델, 보조 모델, 생성 파라미터, 작업 종류별 실측 평균 비용(작업 단위 1건당).',
    inputSchema: {},
  },
  () =>
    guarded(() => ({
      models: SELECTABLE_MODELS.map((m) => ({ id: m.value, label: m.label, description: m.description })),
      app_model: getAppChatModel(dataDir),
      aux_model: AUX_MODEL,
      generation_config: GENERATION_CONFIG,
      idea_generation_config: IDEA_GENERATION_CONFIG,
      analysis_web_search: '분석은 모델 슬러그에 :online 을 붙여 OpenRouter 웹 검색을 켠다 (검색 비용 별도)',
      measured_costs: allAverages(),
    }))
)

// ───────────────────────── 앱 결과물 (세션·아이디어) ─────────────────────────

server.registerTool(
  'gp_list_sessions',
  {
    description: '앱에 저장된 기획서·분석 보고서 세션 목록(최근 수정순, 본문 제외). gp_get_session·gp_export_sessions·gp_revise_batch 의 session_id 로 쓴다.',
    inputSchema: {
      type: z.enum(['planning', 'analysis']).optional(),
      query: z.string().optional().describe('제목·게임명에 포함될 문자열'),
      limit: z.number().int().positive().optional().describe('최대 결과 수 (기본 50)'),
    },
  },
  ({ type, query, limit }) =>
    guarded(() => {
      const q = query?.toLowerCase()
      const sessions = listSessions(dataDir)
        .filter((s) => !type || s.type === type)
        .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.gameName ?? '').toLowerCase().includes(q))
      return { total: sessions.length, sessions: sessions.slice(0, limit ?? 50).map(sessionSummary) }
    })
)

server.registerTool(
  'gp_get_session',
  {
    description: '앱 세션 하나의 기획서·분석 보고서 본문(마크다운)과 대화. 긴 문서는 max_chars 로 자를 수 있다.',
    inputSchema: {
      session_id: z.string(),
      include_messages: z.boolean().optional().describe('대화 내용 포함 (기본 false)'),
      include_reference_files: z.boolean().optional().describe('참조 파일 본문 포함 (기본 false — 이름만)'),
      max_chars: z.number().int().positive().optional().describe('본문 최대 글자 수'),
    },
  },
  ({ session_id, include_messages, include_reference_files, max_chars }) =>
    guarded(() => {
      const s = getSession(dataDir, session_id)
      const markdown = max_chars && s.markdownContent.length > max_chars ? s.markdownContent.slice(0, max_chars) : s.markdownContent
      return {
        ...sessionSummary(s),
        markdown,
        markdown_truncated: markdown.length < s.markdownContent.length,
        messages: include_messages ? s.messages : undefined,
        reference_files: (s.referenceFiles ?? []).map((f) => ({
          name: f.fileName,
          type: f.fileType,
          chars: f.content.length,
          content: include_reference_files ? f.content : undefined,
        })),
      }
    })
)

server.registerTool(
  'gp_export_sessions',
  {
    description: '앱 세션들의 기획서·분석 보고서를 파일로 내보낸다 (md · .gplan · 둘 다). 대상은 session_ids 또는 type/query 필터. API 호출 없음.',
    inputSchema: {
      session_ids: z.array(z.string()).optional(),
      type: z.enum(['planning', 'analysis']).optional(),
      query: z.string().optional(),
      format: z.enum(['md', 'gplan', 'both']).optional().describe('기본 md'),
      dest_dir: z.string().optional().describe('기본 ~/Downloads/GamePlanner/MCP/export_<시각>'),
    },
  },
  ({ session_ids, type, query, format, dest_dir }) =>
    guarded(() => {
      const dir = dest_dir ? resolve(dest_dir) : defaultDestDir('export')
      assertWritable(dir, dataDir)
      const q = query?.toLowerCase()
      const ids = session_ids ? new Set(session_ids) : undefined
      const sessions = listSessions(dataDir)
        .filter((s) => !ids || ids.has(s.id))
        .filter((s) => !type || s.type === type)
        .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.gameName ?? '').toLowerCase().includes(q))
      if (ids) {
        const missing = [...ids].filter((id) => !sessions.some((s) => s.id === id))
        if (missing.length > 0) throw new Error(`세션을 찾을 수 없습니다: ${missing.join(', ')}`)
      }
      const files: { session_id: string; title: string; md?: string; gplan?: string; skipped?: string }[] = []
      for (const s of sessions) {
        const base = sanitizeName(s.title, s.id)
        if (!s.markdownContent.trim() && (format ?? 'md') === 'md') {
          files.push({ session_id: s.id, title: s.title, skipped: '본문 없음' })
          continue
        }
        const out: (typeof files)[number] = { session_id: s.id, title: s.title }
        if (format !== 'gplan' && s.markdownContent.trim()) out.md = writeUnique(dir, base, 'md', s.markdownContent)
        if (format === 'gplan' || format === 'both') {
          out.gplan = writeUnique(
            dir,
            base,
            'gplan',
            toGplan({
              type: s.type === 'analysis' ? 'analysis' : 'planning',
              title: s.title,
              messages: s.messages,
              markdownContent: s.markdownContent,
              templateId: s.templateId,
              gameName: s.gameName,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
            })
          )
        }
        files.push(out)
      }
      return { dest_dir: dir, count: files.filter((f) => !f.skipped).length, files }
    })
)

server.registerTool(
  'gp_list_ideas',
  {
    description: '앱 딸깍 아이디어 히스토리(최신이 앞). starred_only 로 즐겨찾기만. dest_dir 을 주면 ideas.json·ideas.md 로도 저장한다.',
    inputSchema: {
      starred_only: z.boolean().optional(),
      query: z.string().optional().describe('제목·내용·심리 훅에 포함될 문자열'),
      limit: z.number().int().positive().optional().describe('최대 결과 수 (기본 100)'),
      dest_dir: z.string().optional(),
    },
  },
  ({ starred_only, query, limit, dest_dir }) =>
    guarded(() => {
      const q = query?.toLowerCase()
      const ideas = listIdeas(dataDir)
        .filter((i) => !starred_only || i.starred)
        .filter((i) => !q || [i.title, i.hook, ...i.lines].join(' ').toLowerCase().includes(q))
        .slice(0, limit ?? 100)
      let saved: string[] | undefined
      if (dest_dir) {
        const dir = resolve(dest_dir)
        assertWritable(dir, dataDir)
        saved = [
          writeUnique(dir, 'ideas', 'json', JSON.stringify(ideas, null, 2)),
          writeUnique(dir, 'ideas', 'md', ideas.map((i) => ideaToMarkdown(i, '##')).join('\n\n---\n\n')),
        ]
      }
      return { total: ideas.length, ideas, saved: saved ?? null }
    })
)

// ───────────────────────── 생성·템플릿 도구 ─────────────────────────

registerIdeaTools(server, ctx)
registerPlanningTools(server, ctx)
registerAnalysisTools(server, ctx)
registerReviseTools(server, ctx)
registerTemplateTools(server, ctx)

// ───────────────────────── 작업 ─────────────────────────

server.registerTool(
  'gp_job_status',
  {
    description: '배치 작업 진행·결과 조회. wait_seconds 동안 완료를 기다렸다가 응답한다.',
    inputSchema: {
      job_id: z.string(),
      wait_seconds: z.number().min(0).max(600).optional().describe('기본 30초'),
    },
  },
  ({ job_id, wait_seconds }) =>
    guarded(async () => {
      const job = getJob(job_id)
      if (!job) {
        throw new Error(
          `작업을 찾을 수 없습니다: ${job_id}. 서버가 재시작되면 작업 목록이 사라집니다 — 결과는 출력 폴더의 manifest 를 확인하세요.`
        )
      }
      if (job.status === 'running') await waitForJob(job, (wait_seconds ?? 30) * 1000)
      return jobSummary(job)
    })
)

server.registerTool(
  'gp_cancel_job',
  {
    description: '배치 작업 취소. 이미 보낸 요청은 끝까지 받고, 대기 중인 요청(다음 섹션·다음 단계 포함)은 보내지 않는다.',
    inputSchema: { job_id: z.string() },
  },
  ({ job_id }) =>
    guarded(() => {
      const job = getJob(job_id)
      if (!job) throw new Error(`작업을 찾을 수 없습니다: ${job_id}`)
      job.cancelRequested = true
      return jobSummary(job)
    })
)

/**
 * 클라이언트가 연결을 끊으면(stdin 종료) 종료한다. 그대로 두면 프로세스가 남아 실행 파일을 잠근다.
 * 진행 중인 작업은 결과 파일이 남도록 마저 끝내되, 최대 10분까지만 기다린다.
 */
function exitWhenClientGone() {
  let exiting = false
  const shutdown = async () => {
    if (exiting) return
    exiting = true
    const running = listJobs().filter((j) => j.status === 'running')
    if (running.length > 0) {
      console.error(`[gp-mcp] 클라이언트 종료 — 진행 중 작업 ${running.length}개를 마친 뒤 종료합니다`)
      await Promise.race([Promise.all(running.map((j) => j.done)), new Promise((r) => setTimeout(r, 10 * 60_000))])
    }
    process.exit(0)
  }
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)
}

async function main() {
  // 앱이 런타임·다운로드 검증에 쓴다 — 프로토콜을 시작하지 않고 버전만 찍고 끝낸다
  if (process.argv.includes('--version')) {
    process.stdout.write(`${VERSION}\n`)
    process.exit(0)
  }
  await server.connect(new StdioServerTransport())
  exitWhenClientGone()
  // stdout 은 프로토콜 전용 — 진단은 stderr
  console.error(`[gp-mcp ${VERSION}] data_dir=${dataDir} api_key=${hasApiKey(dataDir) ? 'ok' : 'missing'}`)
}

main().catch((error) => {
  console.error('[gp-mcp] 시작 실패:', error)
  process.exit(1)
})
