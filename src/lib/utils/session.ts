// 세션 관련 유틸리티

import { ChatSession, SessionType } from '../../store/useAppStore'

/**
 * 세션 ID 생성
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 템플릿 ID 생성
 */
export function generateTemplateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 세션의 기본 템플릿 ID 가져오기
 */
export function getDefaultTemplateId(session: ChatSession): string {
  if (session.type === SessionType.ANALYSIS || session.gameName) {
    return 'default-analysis'
  }
  return 'default-planning'
}

/**
 * 세션 제목 생성
 */
export function generateSessionTitle(type: SessionType, gameName?: string): string {
  if (type === SessionType.ANALYSIS && gameName) {
    return `${gameName} 분석`
  }
  return type === SessionType.PLANNING ? '기획서 초안' : '게임 분석 초안'
}

