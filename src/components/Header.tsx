import { Settings } from 'lucide-react'
import { getVersion } from '@tauri-apps/api/app'
import { ChangeEvent, useEffect, useState } from 'react'
import { SELECTABLE_MODELS, normalizeChatModel } from '../lib/constants/api'
import { CLAUDE_MODELS, normalizeClaudeModel } from '../lib/constants/claude'
import { saveSettings } from '../lib/store'
import { useAppStore } from '../store/useAppStore'

interface HeaderProps {
  onSettingsClick: () => void
}

export function Header({ onSettingsClick }: HeaderProps) {
  const [version, setVersion] = useState<string>('')
  const { chatModel, setChatModel, anthropicApiKey, claudeModel, setClaudeModel } = useAppStore()
  const claudeActive = !!anthropicApiKey?.trim()
  const currentChatModel = normalizeChatModel(chatModel)
  const currentClaudeModel = normalizeClaudeModel(claudeModel)
  const modelOptions = claudeActive ? CLAUDE_MODELS : SELECTABLE_MODELS

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('0.0.0'))
  }, [])

  const handleModelChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    // Claude 키가 있으면 Claude 모델 선택을 따로 저장한다
    if (claudeActive) {
      const previous = currentClaudeModel
      const next = normalizeClaudeModel(event.target.value)
      setClaudeModel(next)
      try {
        await saveSettings({ claudeModel: next })
      } catch (error) {
        console.error('AI 모델 저장 실패:', error)
        setClaudeModel(previous)
        alert('AI 모델 저장에 실패했습니다.')
      }
      return
    }

    const previousModel = currentChatModel
    const nextModel = normalizeChatModel(event.target.value)

    setChatModel(nextModel)

    try {
      await saveSettings({ chatModel: nextModel })
    } catch (error) {
      console.error('AI 모델 저장 실패:', error)
      setChatModel(previousModel)
      alert('AI 모델 저장에 실패했습니다.')
    }
  }

  return (
    <header className="h-14 border-b border-border bg-background px-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">GamePlanner AI</h1>
        {version && (
          <span className="text-sm text-muted-foreground">v{version}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="header-chat-model" className="hidden sm:inline text-sm text-muted-foreground whitespace-nowrap">
          AI 모델
        </label>
        <select
          id="header-chat-model"
          value={claudeActive ? currentClaudeModel : currentChatModel}
          onChange={handleModelChange}
          className="h-9 w-44 max-w-[42vw] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          title="AI 모델"
        >
          {modelOptions.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
        <button
          onClick={onSettingsClick}
          className="p-2 rounded-md hover:bg-accent transition-colors"
          title="설정"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
