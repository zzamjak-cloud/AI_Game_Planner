# AI 에이전트 연동 (MCP 서버 `gp-mcp`)

로컬 AI 에이전트(Claude Code CLI·데스크톱, Codex CLI·데스크톱, Claude 데스크톱)가 GamePlanner 의
**기획서 작성·게임 분석·딸깍 아이디어·템플릿 기능을 배치로** 쓰고, 결과(마크다운·JSON)를 받아 다른 용도로
활용하게 하는 MCP stdio 서버. 앱이 **꺼져 있어도** 앱 설정의 OpenRouter 키·모델로 동작한다.
구조는 StyleStudio 의 `ss-mcp` 와 같다(등록·런타임·배포 방식 공유).

- 서버는 TypeScript(`mcp/`)이고 **앱 소스(`src/`)를 그대로 번들**한다 — 템플릿·시스템 지시문·분석 래퍼·섹션 분할 생성·
  자동 이어쓰기·응답 파싱·딸깍 프롬프트가 앱과 같은 코드라 결과가 어긋나지 않는다.
- 앱에는 **JS 번들 `gp-mcp.mjs`(약 3MB — pdf.js·xlsx·zod 가 대부분)만** 넣고 사용자 PC 의 **Node 20.16+** 로 실행한다.
  Node 가 없으면 설정 화면에서 단일 실행 파일(런타임 포함)을 한 번 내려받는다.
- 결과는 파일로 남긴다. 앱에 넣을 것(템플릿·세션·아이디어)은 **수신함(inbox)** 으로만 보낸다 — 아래 "앱 수신함".

## 관련 파일

| 역할 | 파일 |
|------|------|
| 서버 진입점·조회 도구(정보·모델·세션·아이디어·작업) | `mcp/src/index.ts` |
| stdout 보호 (console.log → stderr, **첫 import**) | `mcp/src/stdio-guard.ts` |
| 도구 공통 (응답·오류·공용 zod 스키마·모델/출력 폴더 검증) | `mcp/src/toolkit.ts` |
| **실행 엔진** (작업 단위·동시 실행·타임아웃·비용 집계·매니페스트·취소·정리 훅) | `mcp/src/engine.ts` |
| 실행 흐름 (계획 요약 → dry run → 안전 상한 → 시작 → 대기) | `mcp/src/runner.ts` |
| 문서 생성 (기획: 섹션 분할 / 수정·분석: 단일 호출 + 이어쓰기) | `mcp/src/generate.ts` |
| 기획서 배치 `gp_plan_batch` | `mcp/src/planning.ts` |
| 분석 배치 `gp_analyze_batch` | `mcp/src/analysis.ts` |
| 수정 체인 `gp_revise_batch` | `mcp/src/revise.ts` |
| 딸깍 배치 `gp_idea_batch` | `mcp/src/ideas.ts` |
| 템플릿 조회·등록 | `mcp/src/templates.ts` |
| 앱 저장소 읽기 (템플릿·세션·아이디어) | `mcp/src/appdata.ts` |
| 앱 수신함 쓰기 | `mcp/src/inbox.ts` |
| 앱 데이터 경로·키·경로 보호·안전한 쓰기 | `mcp/src/env.ts` |
| 참조 문서 (pdf·xlsx·csv·md·txt·json·웹·구글 시트) | `mcp/src/documents.ts` (변환 규칙은 앱과 공유: `src/lib/utils/documentText.ts`) |
| 결과 형식 (.gplan·아이디어 마크다운) | `mcp/src/output.ts` |
| 실측 비용 기록·견적 | `mcp/src/costlog.ts` |
| 테스트 (`npm run mcp:test`, bun test) | `mcp/test/*.test.ts` |
| 빌드 (`gp-mcp.mjs` → `src-tauri/binaries/`, `--standalone` 은 릴리스 자산) | `scripts/build-mcp.mjs`, `.github/workflows/release.yml` "MCP" 단계들 |
| 클라이언트 설정 등록·해제, 사본 배치 | `src-tauri/src/mcp_setup.rs` |
| 런타임 결정 (Node 우선 / 실행 파일) · Tauri command · **수신함 command** | `src-tauri/src/mcp_commands.rs` |
| Node 20.16+ 탐지 · 실행 파일 다운로드(SHA-256·버전 검증) | `src-tauri/src/mcp_runtime.rs` |
| 설정 모달 섹션 "AI 에이전트 연동 (MCP)" | `src/components/McpSettingsSection.tsx`, `src/lib/services/mcpService.ts` |
| 앱 쪽 수신함 가져오기 | `src/lib/services/mcpInbox.ts`, `src/hooks/useMcpInbox.ts` |

**앱과 공유하려고 순수 함수로 뺀 모듈** (React·Tauri·스토어 비의존 — 여기에 그런 의존을 넣으면 MCP 번들이 깨진다):
`src/lib/prompts/documentPrompt.ts`(기획·분석 대화 구성, 참조 파일 첨부, 섹션 모드 지시, 응답 파싱 ← `useGeminiChat`·`useGameAnalysis`·`useMessageHandler`),
`src/lib/utils/documentText.ts`(엑셀·CSV·구글 시트·PDF 텍스트 ← `fileParser`).
`openRouterService` 의 `onUsage`·`signal`, `generateSectioned` 의 `hooks`, `generateGameIdea` 의 `options`, `buildIdeaUserPrompt` 의 `focus` 는
MCP 전용 선택 인자다 — 앱은 넘기지 않으므로 동작이 같다.

## 도구

| 도구 | 용도 | API 호출 |
|------|------|---------|
| `gp_info` | 데이터 경로, 키 설정 여부·출처(env/settings), 크레딧, 앱 모델, 기본 출력 폴더, 수신함 대기, 작업 목록 | 키 조회 1회 |
| `gp_models` | 선택 가능한 본문 모델·보조 모델·생성 파라미터·작업 종류별 실측 평균 비용 | 없음 |
| `gp_list_sessions` / `gp_get_session` | 앱에 저장된 기획서·분석 보고서 목록 / 본문·대화·참조 파일 | 없음 |
| `gp_export_sessions` | 세션들을 md·.gplan 으로 내보내기 (id 목록 또는 type·query 필터) | 없음 |
| `gp_list_ideas` | 딸깍 히스토리 (즐겨찾기·검색, json·md 저장) | 없음 |
| `gp_idea_batch` | 딸깍과 같은 랜덤 재료 조합으로 아이디어 N개. `focus`/`focuses` 로 방향 지정 | 아이디어당 1회 |
| `gp_plan_batch` | 템플릿 기반 기획서 N건 (prompt · idea · idea_id). 참조 문서·세션 참조 파일 | 기획서당 섹션 수만큼 |
| `gp_analyze_batch` | 게임 N개 분석 보고서 (분석 래퍼 + 템플릿 + 웹 검색) | 게임당 1회 |
| `gp_revise_batch` | 기존 문서(세션·파일·본문)에 수정 지시를 순차 적용, 단계별 파일 | 단계당 1회 |
| `gp_list_templates` / `gp_get_template` | 템플릿 목록(선택·등록 대기 포함) / 본문·생성 구조·.prompt 저장 | 없음 |
| `gp_register_template` | 템플릿 검증(앱과 같은 규칙) → 앱 수신함으로 등록. `dry_run` 으로 섹션 분할 구성 미리보기 | 없음 |
| `gp_job_status` / `gp_cancel_job` | 작업 진행·결과 / 취소(대기 중인 요청·다음 섹션·다음 단계를 보내지 않음) | 없음 |

생성 도구 공통(`toolkit.runSchema`): `model`(앱에서 고를 수 있는 모델만, 기본은 앱 설정), `dest_dir`, `concurrency`(문서 3·아이디어 6, 최대 8),
안전 상한 `max_requests`(기본 300 — **최악 요청 수**로 판정: 예상 요청(기획서는 섹션 수) × 3, 자동 이어쓰기·딸깍 형식 재시도 포함. dry run 에 `estimated_requests`·`max_requests_possible` 둘 다 보인다)·`max_cost_usd`(실측 견적이 있을 때만), `dry_run`, `wait_seconds`(기본 40), `save_to_app`.

### 앱과 같은 생성 경로

- **기획서** (`generate.generatePlanning`): `buildPlanningContents` → 신규 문서면 템플릿의 `<markdown_content>` 양식에서 최상위(#) 섹션을 뽑아
  (`planSections`, 3개 이상일 때) `SECTIONED_MODE_OVERRIDE` 를 붙여 섹션별로 순차 생성(`generateSectioned`). 아니면 단일 호출 + 자동 이어쓰기.
  참조 문서는 앱 세션 참조 파일과 같은 `ReferenceFile` 로 만들어 `appendReferenceFiles`(요청과 관련된 최대 3개, 10만 자 상한)로 붙인다.
- **분석** (`generateAnalysis`): `buildAnalysisContents`(분석 래퍼 + 템플릿) + `google_search` 도구(모델에 `:online`) + 이어쓰기. 첫 요청은 앱처럼 게임명.
- **수정 체인**: 단계마다 직전 결과를 현재 문서로, 직전 대화를 히스토리로 넣는다(앱 채팅과 같다 — 요청 부분만 수정). 세션에서 시작하면 대화·템플릿·참조 파일을 이어받는다.
  모델이 문서 없이 대화로만 답하면 문서는 그대로 두고 경고를 남긴다.
- **딸깍**: `generateGameIdea` 그대로(형식 오류 시 seed 를 바꿔 최대 2회 재시도). 중복 회피 목록은 요청 직전의 "이번 배치 제목 + 앱 히스토리" 최근 15개 —
  병렬 요청끼리는 서로를 모르므로 다양성이 중요하면 `concurrency` 를 낮춘다. `focus` 는 앱에 없는 배치 전용 옵션이다.

### 실행 엔진 (`engine.ts`)

- **WorkUnit**: `{label, requests(예상), maxRequests?, costKind, run(ctx)}`. `ctx.hooks()` 를 **요청마다**(섹션·이어쓰기 라운드마다 — `streamWithContinuation` 의 `hooks` 팩토리) 받는다 — 받을 때 취소를 확인하고(섹션·라운드·단계 사이에서도 멈춤),
  요청당 20분 타임아웃 신호와 usage 집계를 준다. `ctx.save` 는 저장 즉시 결과·매니페스트에 반영한다.
- 실패하면 그때까지 받은 본문(이미 과금됨)을 `<이름>_partial.md` 로 남긴다. 401·402(`ApiError`)는 나머지 단위를 즉시 중단한다.
  429·502·503 재시도는 앱 `postChatCompletion` 이 한다(엔진은 재시도하지 않는다 — 스트림 도중 실패는 이미 과금됐을 수 있다).
- 비용: OpenRouter 가 스트림 마지막 청크에 주는 `usage.cost`(BYOK 면 `upstream_inference_cost` 더함)를 단위·작업에 집계하고,
  성공한 단위의 총비용을 `(작업 종류, 모델)` 별로 기록해 다음 dry run 견적에 쓴다(`stateDir()/cost-history.json`).
- 작업마다 `manifest-<job>.json`(단위별 상태·요청 수·usage·비용·파일·경고·결과). `finalize` 훅은 모든 단위가 끝난 뒤 한 번(아이디어 `ideas.json`·`ideas.md`).
- 실측(2026-10-08, gemini-3.8-flash): 아이디어 1개 약 $0.0012, 짧은 3섹션 기획서 $0.0045, 분석(웹 검색) $0.04, 수정 1단계 $0.02.
  기본 기획 템플릿은 9섹션이라 기획서 1건 = 요청 9회.

## 앱 수신함 (inbox) — MCP 결과를 앱에 넣는 유일한 경로

앱은 저장소(`settings.json`, Tauri plugin-store)를 메모리에 들고 있다가 통째로 저장한다. 앱이 켜진 상태에서 바깥이 저장소를 고치면
다음 저장 때 사라지므로, 서버는 저장소에 **절대 쓰지 않고** `<app_data_dir>/mcp-inbox/` 에 항목 파일을 남긴다.

- 서버(`inbox.sendToApp`): `{version: 1, source, created_at, kind, payload}` 를 `<시각>-<id>-<kind>.json.tmp` 로 쓴 뒤 이름을 바꿔 완성한다.
  kind: `template`(이름·종류·본문·설명, `replace_existing`) · `session`(기획서/분석 보고서 세션) · `ideas`(GameIdea 배열, 최신이 앞).
- 앱(`useMcpInbox`): **저장소 로드가 끝난 뒤**(`useAppInitialization.onInitialized`) 시작·창 포커스·10초마다 `mcp_inbox_take` →
  스토어 반영(템플릿 추가/같은 이름 사용자 템플릿 갱신 · 세션 추가(현재 세션은 그대로) · 아이디어 합치기(`importIdeas`, 같은 id 제외, 200개 한도))
  → `saveTemplates`/`saveSessions`/`saveIdeas` → `mcp_inbox_ack`(파일 삭제). 반영·저장 전에 앱이 꺼지면 다음 실행 때 다시 가져온다.
  **가져오기는 멱등이다** — 세션 id 는 수신함 파일 이름에서 정해지고(`session-mcp-<파일>`), 같은 템플릿(이름·종류·본문)·같은 아이디어 id 는 건너뛴다.
  저장이나 삭제가 실패해 같은 항목을 다시 읽어도 중복되지 않는다. ack 는 지우지 못한 파일을 돌려주고 앱은 실행 중 그 파일을 다시 읽지 않는다.
  형식이 깨진 항목은 버리고(ack), 모르는 `version`·`kind` 는 남겨 둔다(앱 업데이트 후 처리). 가져오면 우하단에 5초 알림.
- Rust `mcp_inbox_ack` 는 경로 구분자·`..`·`:` 가 든 이름을 거부한다(다른 파일을 지우지 못하게). `.tmp` 는 읽지 않는다.
- 앱이 꺼져 있으면 다음 실행 때 반영된다. `gp_list_templates.pending_registration`·`gp_info.inbox` 로 대기 항목을 볼 수 있다.

## 배포 방식 · 등록 방식

StyleStudio 와 같다 (`src-tauri/src/mcp_*.rs` 는 식별자만 바꿔 공유).

| 실행 방법 | 등록되는 command / args | 조건 |
|---|---|---|
| **Node (기본)** | node 절대 경로 / [`app_local_data_dir/mcp/gp-mcp.mjs`] | Node 20.16+ 탐지됨 |
| 단일 실행 파일 | `app_local_data_dir/mcp/gp-mcp(.exe)` / [] | Node 없음 → 설정 화면 "실행 파일 다운로드" |

- 실행 파일 다운로드: `https://github.com/zzamjak-cloud/AI_Game_Planner/releases/download/v<앱 버전>/gp-mcp-{windows-x64.exe|macos-universal}.gz` + `.sha256`
  (SHA-256 검증 → gzip 해제 → `--version` 이 앱 버전과 같은지 확인 → 설치). 릴리스 워크플로가 올린다.
- 등록 항목: 이름 `ai-game-planner`, env `GAMEPLANNER_DATA_DIR` = 앱 `app_data_dir`.
  Claude Code `~/.claude.json` · Codex `$CODEX_HOME/config.toml` · Claude 데스크톱 `claude_desktop_config.json`.
  쓰기 전 `.gpbak` 백업, 원자적 교체(`.gptmp` → rename), 우리 항목만 갱신·제거.
- 등록되는 것은 `app_local_data_dir/mcp/` **사본**이다(에이전트가 띄운 서버가 파일을 잠가 앱 업데이트가 멈추지 않게). 앱 시작 시
  등록돼 있고 사본이 번들과 다르면 교체한다(디버그 빌드는 건너뜀).

## 빌드 · 검증

- `npm run mcp:build` (Bun 필요) → `src-tauri/binaries/gp-mcp.mjs`. `npm run tauri:build` 가 먼저 실행한다.
  `--define import.meta.env.DEV=false` 가 필수 — 앱 `logger.ts` 가 Vite 의 `import.meta.env.DEV` 를 읽는다.
- 개발 중(`npm run tauri dev`) 설정 화면에서 등록하려면 먼저 `npm run mcp:build` 를 한 번 실행한다.
- 검증: `npm run mcp:typecheck`, `npm run mcp:test`, `cd src-tauri && cargo test --lib`.
- 산출물은 커밋하지 않는다(`.gitignore` `src-tauri/binaries/gp-mcp*`).

## 안전장치 · 함정

- **앱 데이터에 결과를 쓰지 않는다.** 결과 쓰기는 모두 `env.assertWritable` 을 지난다 — `app_data_dir`·`app_local_data_dir` 안이면 거부.
  (수신함 쓰기만 예외이며 `mcp-inbox/` 한 폴더에만 쓴다.) 모든 결과 파일은 `writeUnique`(`wx`, `_2`…)로만 쓴다.
- **API 키는 어떤 응답에도 싣지 않는다.** 앱 데이터 폴더 파일은 참조 문서·템플릿 파일로 읽지 않는다(`assertReadableDocument`).
  `OPENROUTER_API_KEY` 환경변수가 있으면 우선 — `gp_info.api_key_source` 로 알린다.
- 번들된 앱 코드가 `console.log` 를 쓰면 stdout(JSON-RPC)이 깨진다 → `stdio-guard.ts` 가 첫 import. import 순서를 바꾸지 말 것.
- 공유 모듈에 스토어(`useAppStore`)·Tauri 플러그인 import 를 넣지 말 것 — `lib/utils/session.ts` 처럼 스토어 enum 을 import 하는 모듈도 번들에 스토어를 끌어온다.
- 기본 템플릿(`default-*`)은 저장값 대신 코드 내용을 쓴다(앱이 시작 때 코드 내용으로 덮어쓰므로 같은 결과).
- 작업 목록은 서버 메모리에만 있다 — 서버가 재시작되면 `gp_job_status` 로 찾을 수 없고, 결과는 출력 폴더의 매니페스트로 확인한다.
- PDF 는 텍스트만 읽는다. 참조 문서 요약(앱 참조 파일의 `summary`)은 만들지 않는다 — 10만 자 상한으로 자른 본문을 쓴다.

### 알려진 한계

- 보조 호출 없음. 견적은 실측 평균 기반이라 처음 실행 전에는 금액이 없다(요청 수 상한만 판정).
- 딸깍 형식 오류 재시도는 같은 요청 타임아웃을 공유하고 `requests_made` 에는 1회로 센다(usage·비용은 시도마다 모두 집계).
- 수신함 조회는 이름순 200개까지다 — 남겨 둔 모르는 버전 항목이 앞쪽에 200개 넘게 쌓이면 새 항목이 밀린다(앱 업데이트로 해소).
