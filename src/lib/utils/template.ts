// 템플릿 관련 유틸리티

import { PromptTemplate, TemplateType } from '../../types/promptTemplate'

/**
 * 템플릿 내용 검증
 */
export function validateTemplateContent(content: string): {
  valid: boolean
  error?: string
} {
  if (content.length < 50) {
    return {
      valid: false,
      error: '템플릿 내용이 너무 짧습니다. (최소 50자)',
    }
  }

  if (content.length > 50000) {
    return {
      valid: false,
      error: '템플릿 내용이 너무 깁니다. (최대 50,000자)',
    }
  }

  return { valid: true }
}

/**
 * 템플릿 이름 검증
 */
export function validateTemplateName(name: string): {
  valid: boolean
  error?: string
} {
  if (!name.trim()) {
    return {
      valid: false,
      error: '템플릿 이름을 입력하세요.',
    }
  }

  if (name.length > 100) {
    return {
      valid: false,
      error: '템플릿 이름이 너무 깁니다. (최대 100자)',
    }
  }

  return { valid: true }
}

/**
 * 타입별 템플릿 필터링
 */
export function filterTemplatesByType(
  templates: PromptTemplate[],
  type: TemplateType
): PromptTemplate[] {
  return templates.filter((t) => t.type === type)
}

