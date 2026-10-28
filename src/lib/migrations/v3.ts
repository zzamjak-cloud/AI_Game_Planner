// V3 마이그레이션: 참조 파일 필드 추가

import { ChatSession } from '../../store/useAppStore'

/**
 * V3 마이그레이션: referenceFiles 필드 추가
 */
export function migrateV3(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => {
    // referenceFiles가 없으면 빈 배열로 초기화
    if (!session.referenceFiles) {
      return {
        ...session,
        referenceFiles: [],
      }
    }
    return session
  })
}

