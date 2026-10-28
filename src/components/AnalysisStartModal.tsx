// 게임 분석 시작 모달 - 게임 제목 입력 + 분석 템플릿 선택 통합 UI
import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TemplateType } from '../types/promptTemplate'
import { setCurrentTemplateIds } from '../lib/store'

interface AnalysisStartModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (gameName: string, templateId: string) => void
}

export function AnalysisStartModal({
  isOpen,
  onClose,
  onStart,
}: AnalysisStartModalProps) {
  const {
    getTemplatesByType,
    currentPlanningTemplateId,
    currentAnalysisTemplateId,
    setCurrentAnalysisTemplate,
  } = useAppStore()

  // 분석 템플릿 목록
  const templates = getTemplatesByType(TemplateType.ANALYSIS)

  // 게임 제목 입력 상태
  const [gameName, setGameName] = useState('')

  // 선택된 템플릿 ID (초기값: 현재 분석 기본 템플릿)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    currentAnalysisTemplateId || (templates[0]?.id || '')
  )

  // "다음부터 이 템플릿을 기본으로 사용" 체크박스 상태
  const [rememberChoice, setRememberChoice] = useState(true)

  // 게임 제목 빈값 오류 표시 상태
  const [gameNameError, setGameNameError] = useState(false)

  if (!isOpen) return null

  // 분석 시작 버튼 클릭 핸들러
  const handleStart = async () => {
    const trimmedName = gameName.trim()

    // 게임 제목 유효성 검사
    if (!trimmedName) {
      setGameNameError(true)
      return
    }

    if (!selectedTemplateId) {
      return
    }

    // "다음부터 기억하기" 체크 시 기본 템플릿으로 저장
    if (rememberChoice) {
      setCurrentAnalysisTemplate(selectedTemplateId)
      // Tauri Store에도 저장
      await setCurrentTemplateIds(
        currentPlanningTemplateId || 'default-planning',
        selectedTemplateId
      )
    }

    onStart(trimmedName, selectedTemplateId)
    // 모달 닫기 및 입력값 초기화
    handleClose()
  }

  // 모달 닫기 및 상태 초기화
  const handleClose = () => {
    setGameName('')
    setGameNameError(false)
    setSelectedTemplateId(currentAnalysisTemplateId || (templates[0]?.id || ''))
    setRememberChoice(true)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">게임 분석 시작</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 게임 제목 입력 영역 */}
        <div className="p-4 border-b border-border">
          <label className="block text-sm font-medium mb-2">
            게임 제목 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={gameName}
            onChange={(e) => {
              setGameName(e.target.value)
              // 입력 시 오류 상태 초기화
              if (e.target.value.trim()) {
                setGameNameError(false)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleStart()
              } else if (e.key === 'Escape') {
                handleClose()
              }
            }}
            placeholder="분석할 게임 이름을 입력하세요 (예: 스타듀밸리)"
            className={`w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-colors ${
              gameNameError
                ? 'border-destructive focus:ring-destructive'
                : 'border-border'
            }`}
            autoFocus
          />
          {/* 게임 제목 오류 메시지 */}
          {gameNameError && (
            <p className="text-destructive text-xs mt-1">
              게임 제목을 입력해주세요.
            </p>
          )}
        </div>

        {/* 분석 템플릿 선택 영역 */}
        <div className="p-4 bg-muted/50 border-b border-border">
          <p className="text-sm font-medium mb-1">분석 템플릿 선택</p>
          <p className="text-sm text-muted-foreground">
            게임 분석에 사용할 템플릿을 선택하세요.
          </p>
        </div>

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              사용 가능한 분석 템플릿이 없습니다.
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
              onClick={handleClose}
              className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleStart}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              분석 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
