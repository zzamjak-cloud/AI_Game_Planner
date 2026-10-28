// V2 마이그레이션: 템플릿 시스템 추가

import { ChatSession, SessionType } from '../../store/useAppStore'

/**
 * V2 마이그레이션: templateId 필드 추가
 */
export function migrateV2(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => {
    // templateId가 없으면 세션 타입에 따라 기본 템플릿 ID 할당
    if (!session.templateId) {
      const defaultTemplateId =
        session.type === SessionType.ANALYSIS || session.gameName
          ? 'default-analysis'
          : 'default-planning'

      return {
        ...session,
        templateId: defaultTemplateId,
      }
    }
    return session
  })
}

