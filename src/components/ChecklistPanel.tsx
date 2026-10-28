// 체크리스트 및 검증 UI 컴포넌트

import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, HelpCircle, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { DocumentValidation, ChecklistCategory } from '../types/checklist'
import { saveSessionImmediately } from '../lib/utils/sessionSave'

interface ChecklistPanelProps {
  sessionId: string
}

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  [ChecklistCategory.MARKET_ANALYSIS]: '시장 분석',
  [ChecklistCategory.GAME_DESIGN]: '게임 디자인',
  [ChecklistCategory.MONETIZATION]: '수익화',
  [ChecklistCategory.BALANCING]: '밸런싱',
  [ChecklistCategory.RETENTION]: '리텐션',
  [ChecklistCategory.TECHNICAL]: '기술적 요구사항',
  [ChecklistCategory.COMPLETENESS]: '완성도',
}

export function ChecklistPanel({ sessionId }: ChecklistPanelProps) {
  const { validateDocument, getValidation, updateChecklistItem } = useAppStore()
  const [validation, setValidation] = useState<DocumentValidation | undefined>(undefined)
  const [isValidating, setIsValidating] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<ChecklistCategory>>(
    new Set([ChecklistCategory.MARKET_ANALYSIS, ChecklistCategory.GAME_DESIGN])
  )

  useEffect(() => {
    const currentValidation = getValidation(sessionId)
    setValidation(currentValidation)
  }, [sessionId, getValidation])

  const handleValidate = async () => {
    setIsValidating(true)
    try {
      const result = await validateDocument(sessionId)
      setValidation(result)
      // 검증 완료 후 즉시 세션 저장
      await saveSessionImmediately()
    } catch (error) {
      console.error('검증 실패:', error)
      alert('검증 중 오류가 발생했습니다.')
    } finally {
      setIsValidating(false)
    }
  }

  const toggleCategory = (category: ChecklistCategory) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const handleItemToggle = async (itemId: string, checked: boolean) => {
    updateChecklistItem(sessionId, itemId, checked)
    const updatedValidation = getValidation(sessionId)
    setValidation(updatedValidation)
    // 체크리스트 항목 변경 후 즉시 세션 저장
    await saveSessionImmediately()
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30'
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  return (
    <>
      {/* 도움말 팝업 */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">기획서 검증 가이드</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2 text-base">🔍 검증이란?</h4>
                <p className="text-muted-foreground mb-3">
                  AI가 기획서를 분석하여 필수 항목의 포함 여부와 완성도를 자동으로 평가합니다. 
                  검증을 통해 기획서의 누락된 부분을 확인하고 개선할 수 있습니다.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-base">📋 검증 항목</h4>
                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">1. 시장 분석</p>
                    <p className="text-xs text-muted-foreground">
                      타겟 시장, 경쟁 게임 분석, 시장 규모 및 트렌드 등이 포함되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">2. 게임 디자인</p>
                    <p className="text-xs text-muted-foreground">
                      게임 컨셉, 핵심 메커니즘, 게임플레이 루프, 캐릭터/아이템 시스템 등이 명확히 정의되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">3. 수익화</p>
                    <p className="text-xs text-muted-foreground">
                      수익화 모델, 주요 수익원, 가격 전략 등이 구체적으로 제시되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">4. 밸런싱</p>
                    <p className="text-xs text-muted-foreground">
                      게임 내 경제 시스템, 진행 속도, 난이도 조절 방안 등이 고려되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">5. 리텐션</p>
                    <p className="text-xs text-muted-foreground">
                      사용자 유지 전략, 이벤트 시스템, 장기 컨텐츠 계획 등이 포함되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">6. 기술적 요구사항</p>
                    <p className="text-xs text-muted-foreground">
                      플랫폼, 기술 스택, 서버 구조, 보안 등 기술적 고려사항이 명시되어 있는지 확인합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="font-medium mb-1">7. 완성도</p>
                    <p className="text-xs text-muted-foreground">
                      전체적인 문서 구조, 일관성, 구체성 등 문서의 완성도를 종합적으로 평가합니다.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-base">⚙️ 검증 방법</h4>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>기획서의 마크다운 내용을 AI가 자동으로 분석합니다.</li>
                  <li>각 카테고리별 필수 항목과 권장 항목을 확인합니다.</li>
                  <li>항목별로 포함 여부를 체크하고, 누락된 경우 피드백을 제공합니다.</li>
                  <li>카테고리별 점수와 전체 완성도 점수를 계산합니다.</li>
                  <li>개선이 필요한 부분에 대한 AI 추천 사항을 제시합니다.</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-base">📊 점수 기준</h4>
                <div className="space-y-2 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-600"></div>
                    <span><strong className="text-foreground">80점 이상:</strong> 우수 - 대부분의 필수 항목이 포함되어 있습니다.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
                    <span><strong className="text-foreground">60-79점:</strong> 보통 - 일부 항목이 누락되었거나 보완이 필요합니다.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-600"></div>
                    <span><strong className="text-foreground">60점 미만:</strong> 개선 필요 - 많은 필수 항목이 누락되었습니다.</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  💡 <strong>팁:</strong> 검증 결과를 바탕으로 기획서를 수정한 후 다시 검증하면 점수가 향상됩니다. 
                  필수 항목은 반드시 포함되어야 하며, 권장 항목은 점수에 영향을 줍니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="text-lg font-semibold">기획서 검증</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="검증 가이드 보기"
            >
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? '검증 중...' : '검증하기'}
            </button>
          </div>
        </div>

      {validation ? (
        <div className="space-y-4">
          {/* 전체 점수 */}
          <div className={`p-4 rounded-lg ${getScoreBgColor(validation.overallScore)}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">전체 완성도</span>
              <span className={`text-2xl font-bold ${getScoreColor(validation.overallScore)}`}>
                {validation.overallScore}%
              </span>
            </div>
            <div className="w-full bg-background/50 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  validation.overallScore >= 80
                    ? 'bg-green-600'
                    : validation.overallScore >= 60
                    ? 'bg-yellow-600'
                    : 'bg-red-600'
                }`}
                style={{ width: `${validation.overallScore}%` }}
              />
            </div>
          </div>

          {/* 필수 항목 미완료 경고 */}
          {validation.criticalIssues.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  필수 항목 미완료 ({validation.criticalIssues.length}개)
                </span>
              </div>
              <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                {validation.criticalIssues.slice(0, 3).map((item) => (
                  <li key={item.id}>• {item.title}</li>
                ))}
                {validation.criticalIssues.length > 3 && (
                  <li>... 외 {validation.criticalIssues.length - 3}개</li>
                )}
              </ul>
            </div>
          )}

          {/* AI 추천 사항 */}
          {validation.recommendations.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="text-sm font-medium mb-2">AI 추천 사항</h4>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                {validation.recommendations.map((rec, i) => (
                  <li key={i}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 카테고리별 결과 */}
          <div className="space-y-2">
            {validation.results.map((result) => (
              <div key={result.category} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(result.category)}
                  className="w-full flex items-center justify-between p-3 bg-muted hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(result.category) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">
                      {CATEGORY_LABELS[result.category]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({result.checkedItems}/{result.totalItems})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${getScoreColor(result.score)}`}>
                      {result.score}%
                    </span>
                    {result.checkedRequiredItems < result.requiredItems && (
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                </button>

                {expandedCategories.has(result.category) && (
                  <div className="p-3 space-y-2 bg-background">
                    {result.items.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => handleItemToggle(item.id, e.target.checked)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {item.checked ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                            <span className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}>
                              {item.title}
                            </span>
                            {item.required && (
                              <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                                필수
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-6">{item.description}</p>
                          {item.feedback && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 ml-6">
                              ⚠️ {item.feedback}
                            </p>
                          )}
                          {item.suggestions && item.suggestions.length > 0 && (
                            <ul className="text-xs text-muted-foreground mt-1 ml-6 list-disc list-inside">
                              {item.suggestions.map((suggestion, i) => (
                                <li key={i}>{suggestion}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-4">
            기획서를 검증하여 완성도를 확인하세요.
          </p>
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {isValidating ? '검증 중...' : '검증 시작'}
          </button>
        </div>
      )}
    </div>
    </>
  )
}

