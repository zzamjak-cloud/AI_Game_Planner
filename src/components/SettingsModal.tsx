import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { saveSettings } from '../lib/store'
import { SELECTABLE_MODELS, DEFAULT_CHAT_MODEL } from '../lib/constants/api'
import { devLog } from '../lib/utils/logger'
import { McpSettingsSection } from './McpSettingsSection'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '../lib/constants/claude'
import { DEFAULT_QUICKNOTE_MCP_URL } from '../lib/constants/quicknote'
import { resolveQuickNoteDatabase } from '../lib/services/quickNoteService'

type QuickNoteKind = 'planning' | 'analysis' | 'idea'

const QUICKNOTE_ROWS: Array<{ kind: QuickNoteKind; label: string }> = [
  { kind: 'planning', label: '기획서' },
  { kind: 'analysis', label: '분석' },
  { kind: 'idea', label: '딸깍' },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [chatModelInput, setChatModelInput] = useState<string>(DEFAULT_CHAT_MODEL)
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('')
  const [claudeModelInput, setClaudeModelInput] = useState<string>(DEFAULT_CLAUDE_MODEL)
  const [qnTokenInput, setQnTokenInput] = useState('')
  const [qnUrlInput, setQnUrlInput] = useState(DEFAULT_QUICKNOTE_MCP_URL)
  const [qnDbInputs, setQnDbInputs] = useState<Record<QuickNoteKind, string>>({ planning: '', analysis: '', idea: '' })
  const [qnTitles, setQnTitles] = useState<Record<string, string>>({})
  const [qnStatus, setQnStatus] = useState<Record<string, string>>({})
  const [qnResolving, setQnResolving] = useState<QuickNoteKind | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const {
    apiKey,
    chatModel,
    setApiKey,
    setChatModel,
    anthropicApiKey,
    claudeModel,
    quickNoteToken,
    quickNoteMcpUrl,
    quickNotePlanningDatabaseId,
    quickNoteAnalysisDatabaseId,
    quickNoteIdeaDatabaseId,
    quickNoteDatabaseTitles,
    setAnthropicApiKey,
    setClaudeModel,
    setQuickNoteToken,
    setQuickNoteMcpUrl,
    setQuickNotePlanningDatabaseId,
    setQuickNoteAnalysisDatabaseId,
    setQuickNoteIdeaDatabaseId,
    setQuickNoteDatabaseTitles,
  } = useAppStore()

  useEffect(() => {
    if (isOpen) {
      if (apiKey) setApiKeyInput(apiKey)
      if (chatModel) setChatModelInput(chatModel)
      setAnthropicKeyInput(anthropicApiKey ?? '')
      setClaudeModelInput(claudeModel)
      setQnTokenInput(quickNoteToken ?? '')
      setQnUrlInput(quickNoteMcpUrl)
      setQnDbInputs({
        planning: quickNotePlanningDatabaseId ?? '',
        analysis: quickNoteAnalysisDatabaseId ?? '',
        idea: quickNoteIdeaDatabaseId ?? '',
      })
      setQnTitles(quickNoteDatabaseTitles)
      setQnStatus({})
    }
  }, [isOpen, apiKey, chatModel,
    anthropicApiKey, claudeModel, quickNoteToken, quickNoteMcpUrl,
    quickNotePlanningDatabaseId, quickNoteAnalysisDatabaseId, quickNoteIdeaDatabaseId, quickNoteDatabaseTitles])

  const handleResolveDatabase = async (kind: QuickNoteKind) => {
    if (!qnTokenInput.trim()) {
      setQnStatus((s) => ({ ...s, [kind]: 'QuickNote 토큰을 먼저 입력해주세요' }))
      return
    }
    if (!qnDbInputs[kind].trim()) {
      setQnStatus((s) => ({ ...s, [kind]: '링크 또는 ID를 입력해주세요' }))
      return
    }

    setQnResolving(kind)
    try {
      const { databaseId, title } = await resolveQuickNoteDatabase(
        { token: qnTokenInput.trim(), url: qnUrlInput.trim() || DEFAULT_QUICKNOTE_MCP_URL },
        qnDbInputs[kind]
      )
      setQnDbInputs((v) => ({ ...v, [kind]: databaseId }))
      setQnTitles((t) => ({ ...t, [kind]: title }))
      setQnStatus((s) => ({ ...s, [kind]: '' }))
    } catch (error) {
      setQnStatus((s) => ({ ...s, [kind]: error instanceof Error ? error.message : String(error) }))
    } finally {
      setQnResolving(null)
    }
  }

  const handleSave = async () => {
    if (!apiKeyInput.trim() && !anthropicKeyInput.trim()) {
      alert('OpenRouter 또는 Claude API Key를 입력해주세요')
      return
    }

    setIsSaving(true)
    try {
      // 확인 버튼을 누르지 않은 입력(링크·페이지 ID)은 저장 전에 데이터베이스 ID로 해석한다
      const dbIds = { ...qnDbInputs }
      const titles = { ...qnTitles }
      for (const { kind } of QUICKNOTE_ROWS) {
        const raw = qnDbInputs[kind].trim()
        if (!raw || (titles[kind] && titles[kind] !== '')) continue
        if (!qnTokenInput.trim()) {
          alert('QuickNote 데이터베이스를 확인하려면 토큰이 필요합니다')
          return
        }
        try {
          const resolved = await resolveQuickNoteDatabase(
            { token: qnTokenInput.trim(), url: qnUrlInput.trim() || DEFAULT_QUICKNOTE_MCP_URL },
            raw
          )
          dbIds[kind] = resolved.databaseId
          titles[kind] = resolved.title
        } catch (error) {
          alert(`${QUICKNOTE_ROWS.find((r) => r.kind === kind)?.label} QuickNote 데이터베이스 확인 실패\n\n` +
            (error instanceof Error ? error.message : String(error)))
          return
        }
      }

      // 전역 Store를 통해 설정 저장
      await saveSettings({
        openRouterApiKey: apiKeyInput.trim(),
        chatModel: chatModelInput,
        anthropicApiKey: anthropicKeyInput.trim(),
        claudeModel: claudeModelInput,
        quickNoteToken: qnTokenInput.trim(),
        quickNoteMcpUrl: qnUrlInput.trim() || DEFAULT_QUICKNOTE_MCP_URL,
        quickNotePlanningDatabaseId: dbIds.planning,
        quickNoteAnalysisDatabaseId: dbIds.analysis,
        quickNoteIdeaDatabaseId: dbIds.idea,
        quickNoteDatabaseTitles: titles,
      })

      // Zustand 스토어 업데이트
      setApiKey(apiKeyInput.trim() || null)
      setChatModel(chatModelInput)
      setAnthropicApiKey(anthropicKeyInput.trim() || null)
      setClaudeModel(claudeModelInput)
      setQuickNoteToken(qnTokenInput.trim() || null)
      setQuickNoteMcpUrl(qnUrlInput)
      setQuickNotePlanningDatabaseId(dbIds.planning || null)
      setQuickNoteAnalysisDatabaseId(dbIds.analysis || null)
      setQuickNoteIdeaDatabaseId(dbIds.idea || null)
      setQuickNoteDatabaseTitles(titles)

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
              OpenRouter API Key
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
              에서 발급한 통합 키 (회사 지급 키 사용). Claude 키가 없을 때만 사용합니다.
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

          {/* Claude API (게임 분석) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Claude API (우선 사용)
            </label>
            <input
              type="password"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              키가 있으면 기획·분석·딸깍 모두 Claude를 사용합니다. 분석 시 Claude 웹 검색을 사용합니다.
            </p>
            <select
              value={claudeModelInput}
              onChange={(e) => setClaudeModelInput(e.target.value)}
              className="w-full mt-2 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {CLAUDE_MODELS.find((m) => m.value === claudeModelInput)?.description}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* Divider */}
          <div className="border-t border-border"></div>

          {/* QuickNote */}
          <div>
            <label className="block text-sm font-medium mb-2">
              QuickNote 개인 액세스 토큰 (선택)
            </label>
            <input
              type="password"
              value={qnTokenInput}
              onChange={(e) => setQnTokenInput(e.target.value)}
              placeholder="qn_pat_..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              QuickNote 설정 &gt; AI 연결(MCP) &gt; 개인 액세스 토큰 (읽기·쓰기 권한)
            </p>
          </div>

          {QUICKNOTE_ROWS.map(({ kind, label }) => (
            <div key={kind}>
              <label className="block text-sm font-medium mb-2">
                {label} QuickNote 데이터베이스 (선택)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qnDbInputs[kind]}
                  onChange={(e) => {
                    setQnDbInputs((v) => ({ ...v, [kind]: e.target.value }))
                    setQnTitles((t) => ({ ...t, [kind]: '' }))
                  }}
                  placeholder="페이지 링크 또는 ID"
                  className="flex-1 min-w-0 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => handleResolveDatabase(kind)}
                  disabled={qnResolving !== null}
                  className="px-3 py-2 rounded-md border border-input hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {qnResolving === kind ? '확인 중...' : '확인'}
                </button>
              </div>
              {qnStatus[kind] ? (
                <p className="text-xs text-destructive mt-1">{qnStatus[kind]}</p>
              ) : qnTitles[kind] && qnDbInputs[kind] ? (
                <p className="text-xs text-muted-foreground mt-1">데이터베이스: {qnTitles[kind]}</p>
              ) : null}
            </div>
          ))}

          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">고급: QuickNote MCP URL</summary>
            <input
              type="text"
              value={qnUrlInput}
              onChange={(e) => setQnUrlInput(e.target.value)}
              placeholder={DEFAULT_QUICKNOTE_MCP_URL}
              className="w-full mt-2 px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </details>

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
