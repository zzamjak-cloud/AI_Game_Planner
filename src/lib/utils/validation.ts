// 검증 관련 유틸리티

/**
 * API 키 형식 검증
 */
export function validateApiKey(apiKey: string): {
  valid: boolean
  error?: string
} {
  if (!apiKey || !apiKey.trim()) {
    return {
      valid: false,
      error: 'API Key를 입력해주세요',
    }
  }

  // OpenRouter API 키는 sk-or-v1- 접두사를 포함해 20자 이상
  if (apiKey.length < 20) {
    return {
      valid: false,
      error: 'API Key 형식이 올바르지 않습니다',
    }
  }

  return { valid: true }
}

/**
 * Notion Database ID 형식 검증
 */
export function validateNotionDatabaseId(id: string): {
  valid: boolean
  error?: string
} {
  if (!id || !id.trim()) {
    return {
      valid: false,
      error: 'Database ID를 입력해주세요',
    }
  }

  // Notion Database ID는 UUID 형식 (32자 hex)
  const uuidRegex = /^[0-9a-f]{32}$/i
  if (!uuidRegex.test(id.replace(/-/g, ''))) {
    return {
      valid: false,
      error: 'Database ID 형식이 올바르지 않습니다',
    }
  }

  return { valid: true }
}

/**
 * 문자열이 비어있는지 확인
 */
export function isEmpty(value: unknown): boolean {
  if (typeof value === 'string') {
    return !value.trim()
  }
  return value == null
}

