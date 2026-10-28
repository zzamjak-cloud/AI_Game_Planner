/**
 * GamePlanner 앱 데이터 접근 (헤드리스)
 *
 * - API 키·모델: 앱이 `settings.json`(Tauri plugin-store)에 저장한 값을 읽는다.
 *   환경변수 `OPENROUTER_API_KEY` 가 있으면 그것을 우선한다. **키는 어떤 응답에도 싣지 않는다.**
 * - 앱 저장소(settings.json)에는 절대 쓰지 않는다. 앱에 넣을 것은 수신함(inbox.ts)으로만 보낸다.
 * - 결과 파일은 앱 데이터 폴더 밖에만 쓴다 (`assertWritable`). → docs/mcp.md
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { DEFAULT_CHAT_MODEL, normalizeChatModel, type ChatModel } from '../../src/lib/constants/api'

/** Tauri 번들 식별자 — 앱 데이터 디렉토리 이름 (`tauri.conf.json` 의 `identifier`) */
export const BUNDLE_IDENTIFIER = 'com.zzamjak.ai-game-planner'
/** 앱이 등록 시 실제 데이터 디렉토리를 넘겨주는 환경변수 (`src-tauri/src/mcp_setup.rs` 와 같은 이름) */
export const DATA_DIR_ENV = 'GAMEPLANNER_DATA_DIR'

/** OS 별 Tauri `app_data_dir` 후보 (앞이 우선) */
function candidateDataDirs(): string[] {
  const dirs: string[] = []
  const fromEnv = process.env[DATA_DIR_ENV]
  if (fromEnv) dirs.push(fromEnv)
  const home = homedir()
  switch (platform()) {
    case 'win32':
      dirs.push(join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), BUNDLE_IDENTIFIER))
      break
    case 'darwin':
      dirs.push(join(home, 'Library', 'Application Support', BUNDLE_IDENTIFIER))
      break
    default:
      dirs.push(join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), BUNDLE_IDENTIFIER))
      dirs.push(join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), BUNDLE_IDENTIFIER))
  }
  return dirs
}

export function resolveDataDir(): string {
  const dirs = candidateDataDirs()
  return dirs.find((d) => existsSync(join(d, 'settings.json'))) ?? dirs[0]
}

/** MCP 서버 자체 상태(비용 기록 등)를 두는 폴더 — 앱 데이터와 분리한다 */
export function stateDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'win32':
      return join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), BUNDLE_IDENTIFIER, 'mcp')
    case 'darwin':
      return join(home, 'Library', 'Caches', BUNDLE_IDENTIFIER, 'mcp')
    default:
      return join(process.env.XDG_CACHE_HOME ?? join(home, '.cache'), BUNDLE_IDENTIFIER, 'mcp')
  }
}

/** 기본 출력 루트: ~/Downloads/GamePlanner/MCP */
export function defaultOutputRoot(): string {
  return join(homedir(), 'Downloads', 'GamePlanner', 'MCP')
}

/** 작업 종류별 기본 출력 폴더: <루트>/<종류>_<YYYYMMDD-HHmmss> */
export function defaultDestDir(kind: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return join(defaultOutputRoot(), `${kind}_${stamp}`)
}

// ───────────────────────── 경로 보호 ─────────────────────────

/** 존재하는 가장 가까운 조상까지 실제 경로(심볼릭 링크·junction·8.3 이름 해소)로 바꾸고 나머지를 붙인다 */
function realish(path: string): string {
  let existing = resolve(path)
  const rest: string[] = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) break
    rest.unshift(basename(existing))
    existing = parent
  }
  let real = existing
  try {
    real = realpathSync.native(existing)
  } catch {
    // 해소 실패 시 resolve 결과 그대로
  }
  return join(real, ...rest)
}

/** target 이 base 안(같은 경로 포함)인지 — 문자열 접두사가 아니라 경로 관계로 판정 (형제 폴더 오탐 방지) */
export function isInside(target: string, base: string): boolean {
  const norm = (p: string) => (platform() === 'win32' ? realish(p).toLowerCase() : realish(p))
  const rel = relative(norm(base), norm(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 보호 폴더: 앱 데이터(settings.json·수신함) 와 앱 로컬 데이터(웹뷰·MCP 사본) */
function protectedDirs(dataDir: string): string[] {
  return [dataDir, dirname(stateDir())]
}

/** 앱 데이터 폴더 파일을 문서로 읽지 못하게 한다 — settings.json 에는 API 키가 있다 */
export function assertReadableDocument(target: string, dataDir: string): void {
  for (const dir of protectedDirs(dataDir)) {
    if (isInside(target, dir)) {
      throw new Error(`GamePlanner 앱 데이터 폴더의 파일은 참조 문서로 쓸 수 없습니다: ${target}`)
    }
  }
}

/**
 * 결과 파일 쓰기 경로가 지나야 하는 검사. 앱 데이터 폴더 안이면 거부한다 —
 * 앱에 넣을 내용은 수신함(inbox.ts)으로만 보낸다는 약속을 여기서 강제한다.
 */
export function assertWritable(target: string, dataDir: string): void {
  for (const dir of protectedDirs(dataDir)) {
    if (isInside(target, dir)) {
      throw new Error(`GamePlanner 앱 데이터 폴더 안에는 쓸 수 없습니다: ${target}. 다른 폴더를 지정하세요.`)
    }
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** 파일·폴더 이름으로 쓸 수 있게 정리 (금지문자·제어문자·Windows 예약 이름) */
export function sanitizeName(name: string, fallback: string): string {
  let cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 60)
    .trim()
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `${cleaned}_`
  return cleaned || fallback
}

/** 새 파일로만 쓴다. 같은 이름이 있으면 _2, _3 … (절대 덮어쓰지 않는다) */
export function writeUnique(dir: string, base: string, ext: string, data: Uint8Array | string): string {
  mkdirSync(dir, { recursive: true })
  for (let i = 1; i < 10_000; i++) {
    const path = join(dir, i === 1 ? `${base}.${ext}` : `${base}_${i}.${ext}`)
    try {
      writeFileSync(path, data, { flag: 'wx' })
      return path
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error(`파일 이름을 정할 수 없습니다: ${base}`)
}

/** 임시 파일에 쓴 뒤 이름을 바꿔 원자적으로 완성한다 (읽는 쪽이 덜 써진 파일을 보지 않게) */
export function writeAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

// ───────────────────────── settings.json ─────────────────────────

interface SettingsCache {
  path: string
  mtimeMs: number
  size: number
  value: Record<string, unknown>
}

let cache: SettingsCache | null = null

/** settings.json 을 읽는다. 바뀌지 않았으면 이전 파싱 결과를 재사용한다. */
export function readSettings(dataDir: string): Record<string, unknown> {
  const path = join(dataDir, 'settings.json')
  if (!existsSync(path)) {
    throw new Error(
      `GamePlanner 데이터를 찾을 수 없습니다 (${path}). GamePlanner 를 한 번 실행해 설정을 저장했는지 확인하세요.`
    )
  }
  const stat = statSync(path)
  if (cache && cache.path === path && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return cache.value
  }
  let value: Record<string, unknown>
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'))
  } catch (error) {
    // 앱이 저장하는 도중이면 잘린 JSON 일 수 있다 — 한 번만 다시 읽는다
    const retry = readFileSync(path, 'utf-8')
    try {
      value = JSON.parse(retry)
    } catch {
      throw new Error(`settings.json 파싱 실패: ${(error as Error).message}`)
    }
  }
  cache = { path, mtimeMs: stat.mtimeMs, size: stat.size, value }
  return value
}

/** OpenRouter API 키. 없으면 사용자가 할 일을 담은 오류를 던진다. */
export function getApiKey(dataDir: string): string {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim()
  if (fromEnv) return fromEnv
  let key: unknown
  try {
    key = readSettings(dataDir).openrouter_api_key
  } catch (error) {
    throw new Error(`OpenRouter API 키를 읽을 수 없습니다: ${(error as Error).message}`)
  }
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('GamePlanner 설정에 OpenRouter API 키가 없습니다. 앱 설정에서 키를 저장하세요.')
  }
  return key.trim()
}

/** 키 출처 — 환경변수가 앱 키를 덮어쓰면 다른 계정으로 과금되므로 gp_info 로 알린다 */
export function apiKeySource(): 'env' | 'settings' {
  return process.env.OPENROUTER_API_KEY?.trim() ? 'env' : 'settings'
}

export function hasApiKey(dataDir: string): boolean {
  try {
    return !!getApiKey(dataDir)
  } catch {
    return false
  }
}

/** 앱 설정에서 고른 본문 모델 (없거나 읽지 못하면 기본 모델) */
export function getAppChatModel(dataDir: string): ChatModel {
  try {
    const model = readSettings(dataDir).chat_model
    return normalizeChatModel(typeof model === 'string' ? model : null)
  } catch {
    return DEFAULT_CHAT_MODEL
  }
}
