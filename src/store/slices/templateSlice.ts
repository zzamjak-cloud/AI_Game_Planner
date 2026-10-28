// 템플릿 관리 슬라이스

import { StateCreator } from 'zustand'
import { PromptTemplate } from '../../types/promptTemplate'
import { generateTemplateId } from '../../lib/utils/session'
import { devLog } from '../../lib/utils/logger'

export interface TemplateSlice {
  // 템플릿 상태
  templates: PromptTemplate[]
  currentPlanningTemplateId: string | null
  currentAnalysisTemplateId: string | null

  // 템플릿 관리 메서드
  addTemplate: (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTemplate: (id: string, updates: Partial<PromptTemplate>) => void
  deleteTemplate: (id: string) => void
  setCurrentPlanningTemplate: (id: string) => void
  setCurrentAnalysisTemplate: (id: string) => void
  getTemplateById: (id: string) => PromptTemplate | undefined
  getTemplatesByType: (type: string) => PromptTemplate[]
  reorderTemplates: (reorderedTemplates: PromptTemplate[]) => void
}

export const createTemplateSlice: StateCreator<
  TemplateSlice,
  [],
  [],
  TemplateSlice
> = (set, get) => ({
  // 초기 상태
  templates: [],
  currentPlanningTemplateId: 'default-planning',
  currentAnalysisTemplateId: 'default-analysis',

  // 템플릿 추가
  addTemplate: (template) => {
    const newTemplate: PromptTemplate = {
      ...template,
      id: generateTemplateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({
      templates: [...state.templates, newTemplate]
    }))
    devLog.log('✅ 템플릿 추가:', newTemplate.name)
  },

  // 템플릿 수정
  updateTemplate: (id, updates) => {
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      )
    }))
    devLog.log('✅ 템플릿 수정:', id)
  },

  // 템플릿 삭제
  deleteTemplate: (id) => {
    const state = get()
    const template = state.templates.find(t => t.id === id)

    if (template?.isDefault) {
      throw new Error('기본 템플릿은 삭제할 수 없습니다.')
    }

    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id)
    }))
    devLog.log('✅ 템플릿 삭제:', id)
  },

  // 현재 기획 템플릿 설정
  setCurrentPlanningTemplate: (id) => {
    set({ currentPlanningTemplateId: id })
    devLog.log('✅ 기획 템플릿 설정:', id)
  },

  // 현재 분석 템플릿 설정
  setCurrentAnalysisTemplate: (id) => {
    set({ currentAnalysisTemplateId: id })
    devLog.log('✅ 분석 템플릿 설정:', id)
  },

  // ID로 템플릿 가져오기
  getTemplateById: (id) => {
    const state = get()
    return state.templates.find((t) => t.id === id)
  },

  // 타입별 템플릿 목록 가져오기
  getTemplatesByType: (type) => {
    const state = get()
    return state.templates.filter((t) => t.type === type)
  },

  // 템플릿 재정렬
  reorderTemplates: (reorderedTemplates) => {
    set({ templates: reorderedTemplates })
    devLog.log('✅ 템플릿 순서 변경')
  },
})

