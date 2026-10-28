// 중앙화된 에러 처리

import { ApiError, StorageError, ValidationError, MigrationError } from '../types/errors'

export interface ErrorInfo {
  message: string
  userMessage: string
  type: 'api' | 'storage' | 'validation' | 'migration' | 'unknown'
  recoverable: boolean
  details?: Record<string, unknown>
}

/**
 * 에러를 사용자 친화적인 메시지로 변환
 */
export function handleError(error: unknown): ErrorInfo {
  // ApiError
  if (error instanceof ApiError) {
    return {
      message: error.message,
      userMessage: getApiErrorMessage(error),
      type: 'api',
      recoverable: error.statusCode !== 401 && error.statusCode !== 403,
      details: {
        statusCode: error.statusCode,
        response: error.response,
      },
    }
  }

  // StorageError
  if (error instanceof StorageError) {
    return {
      message: error.message,
      userMessage: getStorageErrorMessage(error),
      type: 'storage',
      recoverable: true,
      details: {
        operation: error.operation,
        key: error.key,
      },
    }
  }

  // ValidationError
  if (error instanceof ValidationError) {
    return {
      message: error.message,
      userMessage: getValidationErrorMessage(error),
      type: 'validation',
      recoverable: true,
      details: {
        field: error.field,
        value: error.value,
      },
    }
  }

  // MigrationError
  if (error instanceof MigrationError) {
    return {
      message: error.message,
      userMessage: getMigrationErrorMessage(error),
      type: 'migration',
      recoverable: false,
      details: {
        version: error.version,
      },
    }
  }

  // 일반 Error
  if (error instanceof Error) {
    return {
      message: error.message,
      userMessage: '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.',
      type: 'unknown',
      recoverable: true,
    }
  }

  // 알 수 없는 에러
  return {
    message: String(error),
    userMessage: '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.',
    type: 'unknown',
    recoverable: true,
  }
}

/**
 * API 에러 메시지 변환
 */
function getApiErrorMessage(error: ApiError): string {
  if (error.statusCode === 401) {
    return 'API 키가 유효하지 않습니다. 설정에서 API 키를 확인해주세요.'
  }
  if (error.statusCode === 403) {
    return 'API 접근 권한이 없습니다. API 키 권한을 확인해주세요.'
  }
  if (error.statusCode === 429) {
    return 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
  }
  if (error.statusCode === 500) {
    return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  }
  if (error.statusCode) {
    return `API 오류가 발생했습니다. (코드: ${error.statusCode})`
  }
  return 'API 호출 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.'
}

/**
 * Storage 에러 메시지 변환
 */
function getStorageErrorMessage(error: StorageError): string {
  if (error.operation === 'read') {
    return '데이터를 불러오는 중 오류가 발생했습니다.'
  }
  if (error.operation === 'write') {
    return '데이터를 저장하는 중 오류가 발생했습니다.'
  }
  return '저장소 오류가 발생했습니다.'
}

/**
 * Validation 에러 메시지 변환
 */
function getValidationErrorMessage(error: ValidationError): string {
  if (error.field) {
    return `${error.field} 필드에 문제가 있습니다: ${error.message}`
  }
  return `입력값 검증 오류: ${error.message}`
}

/**
 * Migration 에러 메시지 변환
 */
function getMigrationErrorMessage(error: MigrationError): string {
  return `데이터 마이그레이션 중 오류가 발생했습니다: ${error.message}`
}

/**
 * 에러 로깅
 */
export function logError(error: unknown, context?: string): void {
  const errorInfo = handleError(error)
  console.error(`[${context || 'Error'}]`, {
    message: errorInfo.message,
    type: errorInfo.type,
    recoverable: errorInfo.recoverable,
    details: errorInfo.details,
  })
}

