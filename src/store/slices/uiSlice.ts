// UI 상태 슬라이스

import { StateCreator } from 'zustand'
import { SessionType } from '../useAppStore'

export type PreviewTab = 'preview' | 'version' | 'checklist' | 'reference'

export interface UiSlice {
  // UI 상태
  currentSessionType: SessionType
  activePreviewTab: PreviewTab

  // UI 관리 메서드
  setCurrentSessionType: (type: SessionType) => void
  setActivePreviewTab: (tab: PreviewTab) => void
}

export const createUiSlice: StateCreator<
  UiSlice,
  [],
  [],
  UiSlice
> = (set) => ({
  // 초기 상태
  currentSessionType: SessionType.PLANNING,
  activePreviewTab: 'preview',

  // 세션 타입 변경
  setCurrentSessionType: (type) => set({ currentSessionType: type }),

  // 미리보기 탭 변경
  setActivePreviewTab: (tab) => set({ activePreviewTab: tab }),
})

