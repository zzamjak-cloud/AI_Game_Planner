// 섹션 분할 생성 서비스
//
// 배경: 모든 후보 모델의 최대 출력이 65,536 토큰으로 동일하므로, 문서 전체를 한 번의
// 응답에 담는 구조에서는 모델을 바꿔도 잘림을 피할 수 없다. 게다가 Gemini 3.8 Flash는
// reasoning이 필수이며 추론 토큰도 같은 출력 예산에서 차감된다.
//
// 해결: 문서를 최상위 섹션 단위로 나눠 순차 생성한다. 각 섹션이 65,536 예산을 온전히
// 쓰므로 잘림이 사실상 사라지고, 추론 강도를 낮추지 않아도 되어 품질도 함께 올라간다.
// 누적 문서를 대화 뒤에 append-only로 붙이므로 프롬프트 접두부가 안정되어 캐시 적중률이 높다.

import { GeminiContent } from '../../types/gemini'
import { RequestHooks, streamWithContinuation } from './openRouterService'
import { devLog } from '../utils/logger'

// 분할이 의미 있으려면 최소 이 개수 이상의 섹션이 필요하다
const MIN_SECTIONS = 3

export interface SectionPlan {
  // 섹션 제목 (예: "🎯 1. 게임 개요")
  title: string
  // 템플릿에 정의된 해당 섹션의 양식 원문
  spec: string
}

/**
 * 템플릿 안의 출력 양식 블록(<markdown_content> … </markdown_content>)들을 모두 찾는다.
 *
 * SYSTEM_INSTRUCTION에는 태그 사용법을 설명하는 예시 블록과 실제 양식 블록이 함께
 * 존재하므로, 최상위 헤더를 가장 많이 가진 블록을 실제 양식으로 간주한다.
 */
function extractTemplateBody(template: string): string | null {
  const blocks = [...template.matchAll(/<markdown_content>([\s\S]*?)<\/markdown_content>/g)].map(
    (m) => m[1]
  )

  if (blocks.length === 0) return null

  let best: string | null = null
  let bestCount = 0

  for (const block of blocks) {
    const count = countTopLevelHeaders(block)
    if (count > bestCount) {
      bestCount = count
      best = block
    }
  }

  return best
}

// 최상위 헤더(# 하나) 개수. ## 이하는 섹션 분할 단위가 아니므로 제외한다.
function countTopLevelHeaders(body: string): number {
  return body.split('\n').filter((line) => /^#\s+\S/.test(line)).length
}

/**
 * 템플릿을 최상위(#) 섹션 단위로 분할한다.
 *
 * 분할이 불가능하거나 의미가 없으면 빈 배열을 반환한다.
 * 호출부는 빈 배열일 때 기존 단일 호출 경로로 폴백해야 한다.
 *
 * @param template 사용자 템플릿 또는 기본 시스템 지시문
 * @returns 섹션 계획 목록 (분할 불가 시 빈 배열)
 */
export function planSections(template: string): SectionPlan[] {
  const body = extractTemplateBody(template)
  if (!body) {
    devLog.log('📐 [섹션] 출력 양식 블록을 찾지 못함 - 단일 호출로 폴백')
    return []
  }

  const lines = body.split('\n')
  const sections: SectionPlan[] = []
  let current: { title: string; lines: string[] } | null = null

  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/)

    if (match) {
      // 이전 섹션 마감
      if (current) {
        sections.push({ title: current.title, spec: current.lines.join('\n').trim() })
      }
      current = { title: match[1].replace(/\*\*/g, '').trim(), lines: [line] }
      continue
    }

    // 첫 헤더 이전의 머리말(문서 제목 등)은 섹션에 속하지 않으므로 버린다
    if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    sections.push({ title: current.title, spec: current.lines.join('\n').trim() })
  }

  if (sections.length < MIN_SECTIONS) {
    devLog.log(`📐 [섹션] 섹션이 ${sections.length}개뿐이라 분할하지 않음 - 단일 호출로 폴백`)
    return []
  }

  devLog.log(`📐 [섹션] ${sections.length}개 섹션으로 분할:`, sections.map((s) => s.title))
  return sections
}

/**
 * 한 섹션만 작성하도록 지시하는 프롬프트를 만든다.
 */
function buildSectionInstruction(section: SectionPlan, index: number, total: number): string {
  return `지금부터 기획서의 **${index + 1}/${total}번째 섹션 하나만** 작성하십시오.

# 작성할 섹션
${section.title}

# 이 섹션의 양식
${section.spec}

# 절대 준수 사항
- 위에 지정된 섹션 하나만 작성하십시오. 다른 섹션은 절대 작성하지 마십시오.
- \`<markdown_content>\` 태그를 사용하지 마십시오. 마크다운 본문만 출력하십시오.
- 섹션 제목 줄(\`# ${section.title}\`)부터 시작하십시오.
- 설명·머리말·맺음말을 붙이지 마십시오. 섹션 본문만 출력하십시오.
- 이미 확정된 앞 섹션들과 게임명·장르·핵심 게임 루프·수치가 반드시 일관되어야 합니다.
- 이 섹션에 배정된 분량을 충실히 채우십시오. 다음 섹션은 별도로 요청됩니다.`
}

export interface SectionedGenerationCallbacks {
  // 섹션 진입 시 진행 상황 알림
  onProgress: (message: string) => void
  // 누적 마크다운 업데이트 (스트리밍 중 계속 호출됨)
  onMarkdownUpdate: (markdown: string) => void
}

export interface SectionedGenerationResult {
  markdown: string
  truncated: boolean
}

/**
 * 섹션을 순차 생성하여 문서를 완성한다.
 *
 * @param apiKey OpenRouter API 키
 * @param sections 섹션 계획
 * @param baseContents 시스템 지시문·대화 히스토리·사용자 요청까지 포함한 기본 대화
 * @param callbacks 진행 상황 및 마크다운 갱신 콜백
 * @param model 사용할 모델 슬러그
 * @param hooks 요청(섹션·이어쓰기 라운드)마다 부르는 usage 수신·중단 신호 생성기 (MCP 전용, 앱은 생략).
 *   예외를 던지면 남은 섹션을 보내지 않고 중단한다 (MCP 취소)
 * @returns 완성된 마크다운과 잘림 여부
 */
export async function generateSectioned(
  apiKey: string,
  sections: SectionPlan[],
  baseContents: GeminiContent[],
  callbacks: SectionedGenerationCallbacks,
  model?: string,
  hooks?: () => RequestHooks
): Promise<SectionedGenerationResult> {
  let document = ''
  let anyTruncated = false

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    callbacks.onProgress(`${section.title} 작성 중... (${i + 1}/${sections.length})`)

    // 누적 문서를 대화 끝에 붙인다. append-only이므로 프롬프트 접두부가 안정되어
    // 프롬프트 캐시(입력 단가의 1/10)가 잘 적용된다.
    const contents: GeminiContent[] = [...baseContents]

    if (document) {
      contents.push({
        role: 'model',
        parts: [{ text: document }],
      })
    }

    contents.push({
      role: 'user',
      parts: [{ text: buildSectionInstruction(section, i, sections.length) }],
    })

    let sectionText = ''

    const result = await streamWithContinuation(apiKey, contents, {
      model,
      hooks,
      onChunk: (chunk) => {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (!text) return

        sectionText += text
        // 확정된 문서 + 현재 작성 중인 섹션을 합쳐 실시간 반영
        callbacks.onMarkdownUpdate(joinSections(document, sectionText))
      },
    })

    if (result.truncated) {
      anyTruncated = true
      devLog.warn(`⚠️ [섹션] "${section.title}" 섹션이 이어쓰기 한도 내에서 완결되지 않았습니다.`)
    }

    document = joinSections(document, stripStrayTags(result.text || sectionText))
    callbacks.onMarkdownUpdate(document)
  }

  return { markdown: document, truncated: anyTruncated }
}

// 섹션 사이를 빈 줄로 구분해 이어붙인다
function joinSections(document: string, next: string): string {
  if (!document) return next
  return `${document.replace(/\s+$/, '')}\n\n${next}`
}

// 모델이 지시를 무시하고 태그를 붙인 경우를 정리한다
function stripStrayTags(text: string): string {
  return text.replace(/<\/?markdown_content>/g, '').trim()
}

/**
 * 섹션 분할 모드에서 시스템 지시문 뒤에 덧붙이는 규칙 무효화 지시문.
 *
 * 기본 시스템 지시문에는 "수정 시에도 기획서 전체를 처음부터 끝까지 다시 출력하라"는
 * 규칙이 있어 섹션 단위 생성과 정면으로 충돌한다. 섹션 모드에서는 이를 명시적으로 무효화한다.
 */
export const SECTIONED_MODE_OVERRIDE = `---

# 🚨 섹션 분할 작성 모드 (위의 출력 규칙보다 우선함)

이번 작업은 기획서를 섹션 단위로 나눠 순차적으로 작성합니다.

- 위 지시문의 "전체 기획서를 처음부터 끝까지 다시 출력" 규칙은 이 모드에서 **적용되지 않습니다.**
- 매 요청마다 **지정된 단 하나의 섹션만** 작성하십시오.
- \`<markdown_content>\` 태그는 사용하지 마십시오. 마크다운 본문만 출력하십시오.
- 최종 문서는 각 섹션의 출력을 순서대로 이어붙여 조립됩니다. 따라서 섹션을 중복 출력하면 문서가 망가집니다.`
