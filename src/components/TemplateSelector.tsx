import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { SessionType } from '../store/useAppStore'
import { TemplateType } from '../types/promptTemplate'
import { setCurrentTemplateIds } from '../lib/store'

interface TemplateSelectorProps {
  isOpen: boolean
  onClose: () => void
  sessionType: SessionType
  onSelect: (templateId: string) => void
}

export function TemplateSelector({
  isOpen,
  onClose,
  sessionType,
  onSelect,
}: TemplateSelectorProps) {
  const {
    getTemplatesByType,
    currentPlanningTemplateId,
    currentAnalysisTemplateId,
    setCurrentPlanningTemplate,
    setCurrentAnalysisTemplate,
  } = useAppStore()

  // 세션 타입에 맞는 템플릿 타입 결정
  const templateType = sessionType === SessionType.PLANNING
    ? TemplateType.PLANNING
    : TemplateType.ANALYSIS

  // 현재 선택된 템플릿 ID
  const currentTemplateId = sessionType === SessionType.PLANNING
    ? currentPlanningTemplateId
    : currentAnalysisTemplateId

  // 해당 타입의 템플릿 목록
  const templates = getTemplatesByType(templateType)

  // 선택된 템플릿 ID (초기값: 현재 템플릿)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    currentTemplateId || (templates[0]?.id || '')
  )

  // "다음부터 기억하기" 체크박스
  const [rememberChoice, setRememberChoice] = useState(true)

  if (!isOpen) return null

  // 시작 버튼 클릭
  const handleStart = async () => {
    if (!selectedTemplateId) {
      alert('템플릿을 선택해주세요.')
      return
    }

    // "다음부터 기억하기"가 체크되어 있으면 기본 템플릿으로 저장
    if (rememberChoice) {
      if (sessionType === SessionType.PLANNING) {
        setCurrentPlanningTemplate(selectedTemplateId)
        // Tauri Store에도 저장
        await setCurrentTemplateIds(selectedTemplateId, currentAnalysisTemplateId || 'default-analysis')
      } else {
        setCurrentAnalysisTemplate(selectedTemplateId)
        // Tauri Store에도 저장
        await setCurrentTemplateIds(currentPlanningTemplateId || 'default-planning', selectedTemplateId)
      }
    }

    onSelect(selectedTemplateId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[70vh] flex flex-col m-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">
            {sessionType === SessionType.PLANNING ? '기획 템플릿 선택' : '분석 템플릿 선택'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="p-4 bg-muted/50 border-b border-border">
          <p className="text-sm text-muted-foreground">
            {sessionType === SessionType.PLANNING
              ? '게임 기획서 작성에 사용할 템플릿을 선택하세요.'
              : '게임 분석에 사용할 템플릿을 선택하세요.'}
          </p>
        </div>

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              사용 가능한 템플릿이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    selectedTemplateId === template.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-accent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 라디오 버튼 */}
                    <div className="mt-0.5">
                      {selectedTemplateId === template.id ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                      )}
                    </div>

                    {/* 템플릿 정보 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{template.name}</h3>
                        {template.isDefault && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary font-medium">
                            Default
                          </span>
                        )}
                        {template.language && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium">
                            {template.language === 'ko' ? '한국어' : 'English'}
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 옵션 및 버튼 */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-muted-foreground">
                다음부터 이 템플릿을 기본으로 사용
              </span>
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleStart}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              시작
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
