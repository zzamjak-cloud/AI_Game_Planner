import { useState } from 'react'
import { X, Plus, Upload, Edit, Save as SaveIcon, Trash2, CheckCircle2, Copy, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TemplateType } from '../types/promptTemplate'
import { saveTemplates, setCurrentTemplateIds } from '../lib/store'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { TemplateEditorModal } from './TemplateEditorModal'

interface TemplateManagerModalProps {
  isOpen: boolean
  onClose: () => void
  templateType: TemplateType // initialType에서 required로 변경
}

export function TemplateManagerModal({ isOpen, onClose, templateType }: TemplateManagerModalProps) {
  const {
    templates,
    currentPlanningTemplateId,
    currentAnalysisTemplateId,
    addTemplate,
    deleteTemplate,
    setCurrentPlanningTemplate,
    setCurrentAnalysisTemplate,
    getTemplatesByType,
    reorderTemplates,
  } = useAppStore()

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 에디터 모달 상태
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>(undefined)
  const [sourceTemplateId, setSourceTemplateId] = useState<string | undefined>(undefined)

  if (!isOpen) return null

  // 전달받은 타입의 템플릿만 필터링
  const filteredTemplates = getTemplatesByType(templateType)

  // 기본 템플릿과 커스텀 템플릿 분리
  const defaultTemplates = filteredTemplates.filter(t => t.isDefault)
  const customTemplates = filteredTemplates.filter(t => !t.isDefault)

  // 현재 선택된 템플릿 ID
  const currentTemplateId = templateType === TemplateType.PLANNING
    ? currentPlanningTemplateId
    : currentAnalysisTemplateId

  // 템플릿 선택
  const handleSelectTemplate = async (templateId: string) => {
    if (templateType === TemplateType.PLANNING) {
      setCurrentPlanningTemplate(templateId)
    } else {
      setCurrentAnalysisTemplate(templateId)
    }

    // Store에 저장
    await setCurrentTemplateIds(
      templateType === TemplateType.PLANNING ? templateId : currentPlanningTemplateId || 'default-planning',
      templateType === TemplateType.ANALYSIS ? templateId : currentAnalysisTemplateId || 'default-analysis'
    )
  }

  // 템플릿 삭제
  const handleDeleteTemplate = async (templateId: string) => {
    try {
      deleteTemplate(templateId)

      // Store에 저장
      const updatedTemplates = templates.filter(t => t.id !== templateId)
      await saveTemplates(updatedTemplates)

      alert('템플릿이 삭제되었습니다.')
      setDeleteConfirm(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      alert('템플릿 삭제 실패: ' + errorMessage)
    }
  }

  // 템플릿 내보내기
  const handleExportTemplate = async (templateId: string) => {
    try {
      const template = templates.find(t => t.id === templateId)
      if (!template) {
        alert('템플릿을 찾을 수 없습니다.')
        return
      }

      const filePath = await save({
        defaultPath: `${template.name}.prompt`,
        filters: [
          { name: 'Prompt Template', extensions: ['prompt', 'json'] }
        ]
      })

      if (!filePath) return

      await writeTextFile(filePath, JSON.stringify(template, null, 2))
      alert('템플릿을 내보냈습니다!')
    } catch (error) {
      console.error('템플릿 내보내기 실패:', error)
      alert('템플릿 내보내기에 실패했습니다.')
    }
  }

  // 템플릿 위로 이동
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return // 첫 번째 아이템은 위로 이동 불가

    const reorderedCustom = [...customTemplates]
    // 현재 아이템과 위 아이템의 위치를 교환
    const temp = reorderedCustom[index]
    reorderedCustom[index] = reorderedCustom[index - 1]
    reorderedCustom[index - 1] = temp

    // 전체 템플릿 목록 재구성
    const otherTemplates = templates.filter(t => t.type !== templateType)
    const newTemplates = [...otherTemplates, ...defaultTemplates, ...reorderedCustom]

    reorderTemplates(newTemplates)
    await saveTemplates(newTemplates)
  }

  // 템플릿 아래로 이동
  const handleMoveDown = async (index: number) => {
    if (index >= customTemplates.length - 1) return // 마지막 아이템은 아래로 이동 불가

    const reorderedCustom = [...customTemplates]
    // 현재 아이템과 아래 아이템의 위치를 교환
    const temp = reorderedCustom[index]
    reorderedCustom[index] = reorderedCustom[index + 1]
    reorderedCustom[index + 1] = temp

    // 전체 템플릿 목록 재구성
    const otherTemplates = templates.filter(t => t.type !== templateType)
    const newTemplates = [...otherTemplates, ...defaultTemplates, ...reorderedCustom]

    reorderTemplates(newTemplates)
    await saveTemplates(newTemplates)
  }

  // 템플릿 불러오기
  const handleImportTemplate = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          { name: 'Prompt Template', extensions: ['prompt', 'json'] }
        ]
      })

      if (!filePath) return

      const fileContent = await readTextFile(filePath as string)
      const templateData = JSON.parse(fileContent)

      // 템플릿 데이터 검증
      if (!templateData.name || !templateData.content || !templateData.type) {
        throw new Error('올바르지 않은 템플릿 파일입니다.')
      }

      // 새 템플릿 추가
      addTemplate({
        name: templateData.name,
        type: templateData.type,
        content: templateData.content,
        description: templateData.description,
        language: templateData.language,
        isDefault: false, // 불러온 템플릿은 기본 템플릿이 아님
      })

      // Store에 저장
      await saveTemplates(templates)

      alert('템플릿을 불러왔습니다!')
    } catch (error) {
      console.error('템플릿 불러오기 실패:', error)
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      alert('템플릿 불러오기에 실패했습니다.\n\n' + errorMessage)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">
            {templateType === TemplateType.PLANNING ? '기획 템플릿 관리' : '분석 템플릿 관리'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 p-4 border-b border-border">
          <button
            onClick={() => {
              // 기본 템플릿을 복제하여 시작
              const defaultTemplateId = templateType === TemplateType.PLANNING
                ? 'default-planning'
                : 'default-analysis'
              setEditingTemplateId(undefined)
              setSourceTemplateId(defaultTemplateId)
              setShowEditor(true)
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>새 템플릿</span>
          </button>
          <button
            onClick={handleImportTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>템플릿 불러오기</span>
          </button>
        </div>

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredTemplates.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              템플릿이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {/* 기본 템플릿 (드래그 불가) */}
              {defaultTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    currentTemplateId === template.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-accent'
                  }`}
                  onClick={() => handleSelectTemplate(template.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* 라디오 버튼 */}
                    <div className="mt-0.5">
                      {currentTemplateId === template.id ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                      )}
                    </div>

                    {/* 템플릿 정보 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{template.name}</h3>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary font-medium">
                          Default
                        </span>
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>

                    {/* 액션 버튼들 */}
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingTemplateId(undefined)
                          setSourceTemplateId(template.id)
                          setShowEditor(true)
                        }}
                        className="p-2 rounded bg-muted hover:bg-accent transition-colors"
                        title="복제"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExportTemplate(template.id)
                        }}
                        className="p-2 rounded bg-muted hover:bg-accent transition-colors"
                        title="내보내기"
                      >
                        <SaveIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* 커스텀 템플릿 */}
              {customTemplates.map((template, index) => (
                <div
                  key={template.id}
                  className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    currentTemplateId === template.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-accent'
                  }`}
                  onClick={() => handleSelectTemplate(template.id)}
                >
                  <div className="flex items-start gap-3">

                    {/* 라디오 버튼 */}
                    <div className="mt-0.5">
                      {currentTemplateId === template.id ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                      )}
                    </div>

                    {/* 템플릿 정보 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{template.name}</h3>
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>

                    {/* 액션 버튼들 */}
                    <div className="flex gap-1 ml-2">
                      {/* 위로 이동 버튼 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMoveUp(index)
                        }}
                        disabled={index === 0}
                        className={`p-2 rounded transition-colors ${
                          index === 0
                            ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                            : 'bg-muted hover:bg-accent'
                        }`}
                        title="위로 이동"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      {/* 아래로 이동 버튼 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMoveDown(index)
                        }}
                        disabled={index === customTemplates.length - 1}
                        className={`p-2 rounded transition-colors ${
                          index === customTemplates.length - 1
                            ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                            : 'bg-muted hover:bg-accent'
                        }`}
                        title="아래로 이동"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingTemplateId(template.id)
                          setSourceTemplateId(undefined)
                          setShowEditor(true)
                        }}
                        className="p-2 rounded bg-muted hover:bg-accent transition-colors"
                        title="편집"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingTemplateId(undefined)
                          setSourceTemplateId(template.id)
                          setShowEditor(true)
                        }}
                        className="p-2 rounded bg-muted hover:bg-accent transition-colors"
                        title="복제"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExportTemplate(template.id)
                        }}
                        className="p-2 rounded bg-muted hover:bg-accent transition-colors"
                        title="내보내기"
                      >
                        <SaveIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteConfirm(template.id)
                        }}
                        className="p-2 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">템플릿 삭제</h3>
            <p className="text-muted-foreground mb-6">
              이 템플릿을 삭제하시겠습니까?<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteTemplate(deleteConfirm)}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 에디터 모달 */}
      <TemplateEditorModal
        isOpen={showEditor}
        onClose={() => {
          setShowEditor(false)
          setEditingTemplateId(undefined)
          setSourceTemplateId(undefined)
        }}
        templateId={editingTemplateId}
        sourceTemplateId={sourceTemplateId}
        templateType={templateType}
        onSave={() => {
          // 저장 후 목록 새로고침을 위해 아무것도 안 해도 됨 (Zustand가 자동 업데이트)
        }}
      />
    </div>
  )
}
