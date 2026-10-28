// 딸깍(게임 아이디어) 히스토리 관리 슬라이스

import { StateCreator } from 'zustand'
import { GameIdea } from '../../types/idea'
import { devLog } from '../../lib/utils/logger'

// 히스토리 최대 보관 개수 (즐겨찾기는 제외하고 오래된 것부터 정리)
export const IDEA_HISTORY_LIMIT = 200

export interface IdeaSlice {
  // 생성된 아이디어 히스토리 (최신이 앞)
  ideas: GameIdea[]
  // 메인 패널에 표시 중인 아이디어
  currentIdeaId: string | null
  // 생성 진행 중 여부
  isGeneratingIdea: boolean

  // 아이디어 관리 메서드
  addIdea: (idea: GameIdea) => void
  // 외부(MCP 수신함)에서 온 아이디어 여러 개를 맨 앞에 합친다 (현재 표시 중인 아이디어는 유지)
  importIdeas: (ideas: GameIdea[]) => void
  deleteIdea: (id: string) => void
  toggleIdeaStar: (id: string) => void
  setCurrentIdeaId: (id: string | null) => void
  setIsGeneratingIdea: (generating: boolean) => void
}

export const createIdeaSlice: StateCreator<
  IdeaSlice,
  [],
  [],
  IdeaSlice
> = (set) => ({
  // 초기 상태
  ideas: [],
  currentIdeaId: null,
  isGeneratingIdea: false,

  // 아이디어 추가 (맨 앞에 삽입, 한도 초과 시 즐겨찾기 아닌 오래된 항목 제거)
  addIdea: (idea) => {
    set((state) => {
      let ideas = [idea, ...state.ideas]

      if (ideas.length > IDEA_HISTORY_LIMIT) {
        // 뒤에서부터 즐겨찾기 아닌 항목 하나를 찾아 제거
        const removableIndex = [...ideas].reverse().findIndex((i) => !i.starred)
        if (removableIndex !== -1) {
          const actualIndex = ideas.length - 1 - removableIndex
          ideas = ideas.filter((_, idx) => idx !== actualIndex)
        }
      }

      devLog.log('💡 아이디어 추가:', idea.title)
      return { ideas, currentIdeaId: idea.id }
    })
  },

  // 아이디어 여러 개 가져오기 (같은 id 는 건너뛰고, 한도 초과 시 즐겨찾기 아닌 오래된 항목부터 제거)
  importIdeas: (incoming) => {
    set((state) => {
      const known = new Set(state.ideas.map((i) => i.id))
      const fresh = incoming.filter((i) => !known.has(i.id))
      if (fresh.length === 0) return state

      let ideas = [...fresh, ...state.ideas]
      while (ideas.length > IDEA_HISTORY_LIMIT) {
        const removableIndex = [...ideas].reverse().findIndex((i) => !i.starred)
        if (removableIndex === -1) break
        const actualIndex = ideas.length - 1 - removableIndex
        ideas = ideas.filter((_, idx) => idx !== actualIndex)
      }

      devLog.log('💡 아이디어 가져오기:', fresh.length, '개')
      const currentStillExists = ideas.some((i) => i.id === state.currentIdeaId)
      return { ideas, currentIdeaId: currentStillExists ? state.currentIdeaId : ideas[0]?.id ?? null }
    })
  },

  // 아이디어 삭제 (현재 항목이면 다음 최신 항목으로 이동)
  deleteIdea: (id) => {
    set((state) => {
      const ideas = state.ideas.filter((i) => i.id !== id)
      const currentIdeaId =
        state.currentIdeaId === id ? ideas[0]?.id ?? null : state.currentIdeaId
      return { ideas, currentIdeaId }
    })
  },

  // 즐겨찾기 토글
  toggleIdeaStar: (id) => {
    set((state) => ({
      ideas: state.ideas.map((i) => (i.id === id ? { ...i, starred: !i.starred } : i)),
    }))
  },

  setCurrentIdeaId: (id) => set({ currentIdeaId: id }),

  setIsGeneratingIdea: (generating) => set({ isGeneratingIdea: generating }),
})
