// 세션 자동 저장 로직을 담당하는 커스텀 훅
// 레퍼런스는 이제 세션 내부에 저장되므로 별도 저장 불필요

import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { saveSessions, saveIdeas } from '../lib/store'
import { AUTO_SAVE_DEBOUNCE_MS } from '../lib/constants/session'

interface UseAutoSaveOptions {
  /** 자동 저장 차단 여부 (버전 생성 중, 모달 입력 중 등) */
  isBlocked?: boolean
}

export function useAutoSave(options: UseAutoSaveOptions = {}) {
  const { isBlocked = false } = options
  const { sessions } = useAppStore()
  const ideas = useAppStore(state => state.ideas)

  useEffect(() => {
    // 저장이 차단된 경우 스킵
    if (isBlocked) {
      return
    }

    const saveSession = async () => {
      if (sessions.length > 0) {
        try {
          await saveSessions(sessions)
          // 로그 제거: 너무 빈번하게 출력됨 (스트리밍 중 매 청크마다 저장)
          // console.log('💾 세션 저장 완료:', sessions.length, '개 -', sessions.map(s => s.title).join(', '))

          // 디버그: 저장 후 API 키 확인 (오류 발생 시에만 로그 출력)
          const { getSettings } = await import('../lib/store')
          const settings = await getSettings()
          if (!settings.openRouterApiKey) {
            console.error('⚠️ 경고: 세션 저장 후 API 키가 사라짐!')
          }
          // else {
          //   console.log('✅ API 키 정상 유지됨')
          // }
        } catch (error) {
          console.error('❌ 세션 저장 실패:', error)
        }
      }
    }

    // 세션이 변경될 때마다 저장 (디바운스)
    // 레퍼런스는 세션 내부에 포함되어 있으므로 함께 저장됨
    const timeout = setTimeout(saveSession, AUTO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [sessions, isBlocked])

  // 딸깍 아이디어 히스토리 자동 저장 (채팅 세션과 동일한 디바운스 패턴 적용)
  useEffect(() => {
    // 저장이 차단된 경우 스킵
    if (isBlocked) {
      return
    }

    const saveIdeaHistory = async () => {
      try {
        await saveIdeas(ideas)
      } catch (error) {
        console.error('❌ 아이디어 저장 실패:', error)
      }
    }

    const timeout = setTimeout(saveIdeaHistory, AUTO_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [ideas, isBlocked])
}
