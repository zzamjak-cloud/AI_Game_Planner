// 딸깍 버튼 → 아이디어 생성 → 스토어 반영 플로우를 담당하는 훅

import { useCallback, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { generateGameIdea } from '../lib/services/ideaService'
import { handleError } from '../lib/errorHandler'

// 중복 회피용으로 모델에 넘길 최근 제목 개수
const RECENT_TITLE_COUNT = 15

export function useIdeaGenerator() {
  const { apiKey, chatModel, isGeneratingIdea, setIsGeneratingIdea, addIdea } = useAppStore()
  const [error, setError] = useState<string | null>(null)

  /**
   * 딸깍 한 번. 진행 중이면 무시한다.
   * @returns 생성 성공 여부
   */
  const generate = useCallback(async (): Promise<boolean> => {
    if (isGeneratingIdea) return false

    if (!apiKey) {
      setError('API Key를 먼저 설정해주세요')
      return false
    }

    setError(null)
    setIsGeneratingIdea(true)

    try {
      // 최근 제목은 호출 시점의 스토어에서 직접 읽어 stale 클로저를 피한다
      const recentTitles = useAppStore
        .getState()
        .ideas.slice(0, RECENT_TITLE_COUNT)
        .map((i) => i.title)

      const idea = await generateGameIdea(apiKey, chatModel, recentTitles)
      addIdea(idea)
      return true
    } catch (e) {
      console.error('아이디어 생성 실패:', e)
      setError(handleError(e).message)
      return false
    } finally {
      setIsGeneratingIdea(false)
    }
  }, [apiKey, chatModel, isGeneratingIdea, setIsGeneratingIdea, addIdea])

  return { generate, isGenerating: isGeneratingIdea, error, clearError: () => setError(null) }
}
