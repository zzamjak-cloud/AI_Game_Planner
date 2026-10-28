// V1 마이그레이션: 세션 타입 추가

import { ChatSession, SessionType } from '../../store/useAppStore'

/**
 * V1 마이그레이션: type 필드가 없는 세션에 기본 타입 할당
 */
export function migrateV1(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => {
    // type 필드가 없으면 기본값 할당
    if (!session.type) {
      return {
        ...session,
        type: SessionType.PLANNING,
      }
    }
    return session
  })
}

