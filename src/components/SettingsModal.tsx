import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { saveSettings } from '../lib/store'
import { SELECTABLE_MODELS, DEFAULT_CHAT_MODEL } from '../lib/constants/api'
import { devLog } from '../lib/utils/logger'
import { McpSettingsSection } from './McpSettingsSection'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [notionApiKeyInput, setNotionApiKeyInput] = useState('')
  const [notionPlanningDatabaseIdInput, setNotionPlanningDatabaseIdInput] = useState('')
  const [notionAnalysisDatabaseIdInput, setNotionAnalysisDatabaseIdInput] = useState('')
  const [notionIdeaDatabaseIdInput, setNotionIdeaDatabaseIdInput] = useState('')
  const [chatModelInput, setChatModelInput] = useState<string>(DEFAULT_CHAT_MODEL)
  const [isSaving, setIsSaving] = useState(false)
  const {
    apiKey,
    notionApiKey,
    notionPlanningDatabaseId,
    notionAnalysisDatabaseId,
    notionIdeaDatabaseId,
    chatModel,
    setApiKey,
    setNotionApiKey,
    setNotionPlanningDatabaseId,
    setNotionAnalysisDatabaseId,
    setNotionIdeaDatabaseId,
    setChatModel,
  } = useAppStore()

  useEffect(() => {
    if (isOpen) {
      if (apiKey) setApiKeyInput(apiKey)
      if (notionApiKey) setNotionApiKeyInput(notionApiKey)
      if (notionPlanningDatabaseId) setNotionPlanningDatabaseIdInput(notionPlanningDatabaseId)
      if (notionAnalysisDatabaseId) setNotionAnalysisDatabaseIdInput(notionAnalysisDatabaseId)
      if (notionIdeaDatabaseId) setNotionIdeaDatabaseIdInput(notionIdeaDatabaseId)
      if (chatModel) setChatModelInput(chatModel)
    }
  }, [isOpen, apiKey, notionApiKey, notionPlanningDatabaseId, notionAnalysisDatabaseId, notionIdeaDatabaseId, chatModel])

  const handleSave = async () => {
    if (!apiKeyInput.trim()) {
      alert('OpenRouter API Key를 입력해주세요')
      return
    }

    setIsSaving(true)
    try {
      // 전역 Store를 통해 설정 저장
      await saveSettings({
        openRouterApiKey: apiKeyInput.trim(),
        notionApiKey: notionApiKeyInput.trim() || undefined,
        notionPlanningDatabaseId: notionPlanningDatabaseIdInput.trim() || undefined,
        notionAnalysisDatabaseId: notionAnalysisDatabaseIdInput.trim() || undefined,
        notionIdeaDatabaseId: notionIdeaDatabaseIdInput.trim() || undefined,
        chatModel: chatModelInput,
      })

      // Zustand 스토어 업데이트
      setApiKey(apiKeyInput.trim())
      if (notionApiKeyInput.trim()) {
        setNotionApiKey(notionApiKeyInput.trim())
      }
      if (notionPlanningDatabaseIdInput.trim()) {
        setNotionPlanningDatabaseId(notionPlanningDatabaseIdInput.trim())
      }
      if (notionAnalysisDatabaseIdInput.trim()) {
        setNotionAnalysisDatabaseId(notionAnalysisDatabaseIdInput.trim())
      }
      if (notionIdeaDatabaseIdInput.trim()) {
        setNotionIdeaDatabaseId(notionIdeaDatabaseIdInput.trim())
      }
      setChatModel(chatModelInput)

      devLog.log('✅ 설정 저장 완료')
      alert('설정이 저장되었습니다')
      onClose()
    } catch (error) {
      console.error('❌ 설정 저장 실패:', error)
      alert('설정 저장에 실패했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">설정</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* OpenRouter API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">
              OpenRouter API Key <span className="text-destructive">*</span>
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <a
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenRouter
              </a>
              에서 발급한 통합 키 (회사 지급 키 사용)
            </p>
          </div>

          {/* AI 모델 선택 */}
          <div>
            <label className="block text-sm font-medium mb-2">
              AI 모델
            </label>
            <select
              value={chatModelInput}
              onChange={(e) => setChatModelInput(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SELECTABLE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {SELECTABLE_MODELS.find((m) => m.value === chatModelInput)?.description}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Notion API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Notion API Key (선택)
            </label>
            <input
              type="password"
              value={notionApiKeyInput}
              onChange={(e) => setNotionApiKeyInput(e.target.value)}
              placeholder="ntn_..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              노션 저장 기능 사용 시 필요
            </p>
          </div>

          {/* Notion Planning Database ID */}
          <div>
            <label className="block text-sm font-medium mb-2">
              기획서 Notion Database ID (선택)
            </label>
            <input
              type="text"
              value={notionPlanningDatabaseIdInput}
              onChange={(e) => setNotionPlanningDatabaseIdInput(e.target.value)}
              placeholder="2d7d040b425c8028a1a9f489c2e0657e"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              게임 기획서를 저장할 Notion 데이터베이스 ID
            </p>
          </div>

          {/* Notion Analysis Database ID */}
          <div>
            <label className="block text-sm font-medium mb-2">
              분석 Notion Database ID (선택)
            </label>
            <input
              type="text"
              value={notionAnalysisDatabaseIdInput}
              onChange={(e) => setNotionAnalysisDatabaseIdInput(e.target.value)}
              placeholder="3e8e151c536d9139b2b0e598d3f1768f"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              게임 분석 결과를 저장할 Notion 데이터베이스 ID
            </p>
          </div>

          {/* Notion Idea Database ID */}
          <div>
            <label className="block text-sm font-medium mb-2">
              딸깍 Notion Database ID (선택)
            </label>
            <input
              type="text"
              value={notionIdeaDatabaseIdInput}
              onChange={(e) => setNotionIdeaDatabaseIdInput(e.target.value)}
              placeholder="3e8e151c536d9139b2b0e598d3f1768f"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              딸깍으로 생성한 게임 아이디어를 저장할 Notion 데이터베이스 ID
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* AI 에이전트 연동 (MCP) */}
          <McpSettingsSection />

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md hover:bg-accent transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
