// 버전 관리 UI 컴포넌트

import { useState } from 'react'
import { History, RotateCcw, GitCompare, X, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { VersionDiff } from '../types/version'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { saveSessionImmediately } from '../lib/utils/sessionSave'

interface VersionHistoryProps {
  sessionId: string
  onClose?: () => void
}

export function VersionHistory({ sessionId, onClose }: VersionHistoryProps) {
  const { getVersions, restoreVersion, deleteVersion, compareVersions, createVersion, currentSessionId, markdownContent } = useAppStore()
  const [selectedVersion1, setSelectedVersion1] = useState<string | null>(null)
  const [selectedVersion2, setSelectedVersion2] = useState<string | null>(null)
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [description, setDescription] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const versions = getVersions(sessionId)
  const isCurrentSession = currentSessionId === sessionId

  const handleCreateVersion = async () => {
    if (!markdownContent || markdownContent.trim().length === 0) {
      alert('저장할 기획서 내용이 없습니다.')
      return
    }
    try {
      createVersion(sessionId, description || undefined)
      setDescription('')
      setShowCreateForm(false)
      // 버전 저장 후 즉시 세션 저장
      await saveSessionImmediately()
      alert('버전이 저장되었습니다!')
    } catch (error) {
      console.error('버전 생성 실패:', error)
      alert('버전 생성에 실패했습니다.')
    }
  }

  const handleRestore = async (versionId: string) => {
    if (confirm('이 버전으로 복원하시겠습니까? 현재 버전은 자동으로 백업됩니다.')) {
      restoreVersion(sessionId, versionId)
      // 버전 복원 후 즉시 세션 저장
      await saveSessionImmediately()
      onClose?.()
    }
  }

  const handleDeleteClick = (versionId: string) => {
    setDeleteConfirm(versionId)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    try {
      deleteVersion(sessionId, deleteConfirm)
      setDeleteConfirm(null)
      // 버전 삭제 후 즉시 세션 저장
      await saveSessionImmediately()
    } catch (error) {
      console.error('버전 삭제 실패:', error)
      alert('버전 삭제에 실패했습니다.')
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirm(null)
  }

  const handleCompare = () => {
    if (selectedVersion1 && selectedVersion2) {
      const comparison = compareVersions(sessionId, selectedVersion1, selectedVersion2)
      setDiff(comparison)
      setShowDiff(true)
    }
  }

  if (!isCurrentSession && versions.length === 0) {
    return null
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5" />
          <h3 className="text-lg font-semibold">버전 히스토리</h3>
          <span className="text-sm text-muted-foreground">({versions.length}개)</span>
        </div>
        <div className="flex items-center gap-2">
          {isCurrentSession && markdownContent && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              <Save className="w-4 h-4" />
              버전 저장
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 버전 생성 폼 */}
      {showCreateForm && (
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <label className="block text-sm font-medium mb-2">버전 설명 (선택)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 초안 완성, 밸런싱 수정 등"
            className="w-full px-3 py-2 text-sm border border-border rounded bg-background mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateVersion}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              저장
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false)
                setDescription('')
              }}
              className="px-3 py-1.5 text-sm bg-background border border-border rounded hover:bg-muted"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          아직 저장된 버전이 없습니다.
          <br />
          기획서를 수정한 후 버전을 저장하세요.
        </p>
      ) : (
        <div className="space-y-2">
          {/* 버전 비교 */}
          {versions.length >= 2 && (
            <div className="bg-muted p-3 rounded-lg mb-4">
              <h4 className="text-sm font-medium mb-2">버전 비교</h4>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedVersion1 || ''}
                  onChange={(e) => setSelectedVersion1(e.target.value)}
                  className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background"
                >
                  <option value="">버전 1 선택</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} - {v.description || '설명 없음'}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedVersion2 || ''}
                  onChange={(e) => setSelectedVersion2(e.target.value)}
                  className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background"
                >
                  <option value="">버전 2 선택</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} - {v.description || '설명 없음'}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCompare}
                disabled={!selectedVersion1 || !selectedVersion2}
                className="w-full text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <GitCompare className="w-4 h-4" />
                비교하기
              </button>
            </div>
          )}

          {/* 비교 결과 */}
          {showDiff && diff && (
            <div className="bg-muted p-3 rounded-lg mb-4">
              <h4 className="text-sm font-medium mb-2">변경 사항</h4>
              {diff.added.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">추가된 섹션:</p>
                  <ul className="text-xs list-disc list-inside">
                    {diff.added.map((section, i) => (
                      <li key={i}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-red-600 dark:text-red-400 mb-1">삭제된 섹션:</p>
                  <ul className="text-xs list-disc list-inside">
                    {diff.removed.map((section, i) => (
                      <li key={i}>{section}</li>
                    ))}
                  </ul>
                </div>
              )}
              {diff.modified.length > 0 && (
                <div>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1">수정된 섹션:</p>
                  <ul className="text-xs list-disc list-inside">
                    {diff.modified.map((section, i) => (
                      <li key={i}>{section.section}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={() => setShowDiff(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
              >
                닫기
              </button>
            </div>
          )}

          {/* 버전 목록 */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {versions
              .slice()
              .reverse()
              .map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">v{version.versionNumber}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(version.createdAt), 'yyyy-MM-dd HH:mm', { locale: ko })}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-background rounded">
                        {version.createdBy === 'user' ? '사용자' : 'AI'}
                      </span>
                    </div>
                    {version.description && (
                      <p className="text-xs text-muted-foreground">{version.description}</p>
                    )}
                    {version.changeSummary && (
                      <p className="text-xs text-muted-foreground mt-1">{version.changeSummary}</p>
                    )}
                  </div>
                  {isCurrentSession && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRestore(version.id)}
                        className="p-2 hover:bg-background rounded"
                        title="이 버전으로 복원"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(version.id)}
                        className="p-2 hover:bg-destructive/10 rounded"
                        title="버전 삭제"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold mb-2">버전 삭제</h3>
            <p className="text-muted-foreground mb-6">
              이 버전을 삭제하시겠습니까?<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

