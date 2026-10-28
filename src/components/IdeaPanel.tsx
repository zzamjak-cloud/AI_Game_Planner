// 딸깍 패널 - 버튼 한 번에 게임 코어 아이디어 3줄 요약을 생성해 보여준다

import { useState } from 'react'
import { Lightbulb, Loader2, Star, Copy, Check, Sparkles, BookOpen } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useAppStore } from '../store/useAppStore'
import { useIdeaGenerator } from '../hooks/useIdeaGenerator'
import { createNotionIdeaPage } from '../lib/notionBlocks'

// 로딩 중 버튼에 돌아가며 표시할 문구
const LOADING_MESSAGES = [
  '재료 섞는 중…',
  '심리 건드리는 중…',
  '규칙 비트는 중…',
  '"오!" 찾는 중…',
]

export function IdeaPanel() {
  const { generate, isGenerating, error, clearError } = useIdeaGenerator()
  const currentIdea = useAppStore((state) =>
    state.ideas.find((i) => i.id === state.currentIdeaId)
  )
  const toggleIdeaStar = useAppStore((state) => state.toggleIdeaStar)
  const { notionApiKey, notionIdeaDatabaseId } = useAppStore()
  const [copied, setCopied] = useState(false)
  const [loadingIndex, setLoadingIndex] = useState(0)
  const [isNotionLoading, setIsNotionLoading] = useState(false)

  // 현재 아이디어를 Notion 데이터베이스 페이지로 저장
  const handleSaveToNotion = async () => {
    if (!currentIdea) return

    if (!notionApiKey || !notionIdeaDatabaseId) {
      alert('노션 API 설정이 필요합니다.\n\n설정 메뉴에서 Notion API Key와 딸깍 Database ID를 입력해주세요.')
      return
    }

    setIsNotionLoading(true)

    try {
      const pageUrl = await createNotionIdeaPage(currentIdea, notionApiKey, notionIdeaDatabaseId)

      if (!pageUrl) {
        throw new Error('페이지 URL을 받지 못했습니다')
      }

      alert('노션에 저장되었습니다!\n\n' + pageUrl)
      try {
        await openUrl(pageUrl)
      } catch (openError) {
        // 페이지 열기 실패는 무시 (수동으로 열 수 있음)
        console.error('페이지 열기 실패:', openError)
      }
    } catch (error) {
      console.error('❌ 노션 저장 실패:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert('노션 저장에 실패했습니다.\n\n' + errorMessage)
    } finally {
      setIsNotionLoading(false)
    }
  }

  // 딸깍 클릭 - 로딩 문구를 랜덤으로 바꿔 매번 다른 느낌을 준다
  const handleClick = async () => {
    setLoadingIndex(Math.floor(Math.random() * LOADING_MESSAGES.length))
    setCopied(false)
    await generate()
  }

  // 아이디어를 마크다운 텍스트로 클립보드 복사
  const handleCopy = async () => {
    if (!currentIdea) return
    const text = [
      `# ${currentIdea.title}`,
      '',
      ...currentIdea.lines.map((l, i) => `${i + 1}. ${l}`),
      '',
      `심리 훅: ${currentIdea.hook}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('클립보드 복사 실패:', e)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto p-8 bg-background">
      <div className="w-full max-w-2xl flex flex-col items-center gap-8">
        {/* 딸깍 버튼 */}
        <button
          onClick={handleClick}
          disabled={isGenerating}
          className={`group relative flex items-center gap-3 px-10 py-5 rounded-full text-lg font-bold shadow-lg transition-all
            ${isGenerating
              ? 'bg-muted text-muted-foreground cursor-wait'
              : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-xl active:scale-95'
            }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>{LOADING_MESSAGES[loadingIndex]}</span>
            </>
          ) : (
            <>
              <Lightbulb className="w-6 h-6 group-hover:text-yellow-300 transition-colors" />
              <span>딸깍</span>
            </>
          )}
        </button>

        {/* 에러 메시지 */}
        {error && (
          <div
            onClick={clearError}
            className="w-full px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm cursor-pointer"
          >
            {error}
          </div>
        )}

        {/* 아이디어 카드 */}
        {currentIdea ? (
          <div
            key={currentIdea.id}
            className="w-full bg-card border border-border rounded-2xl p-8 shadow-sm animate-in fade-in"
          >
            {/* 제목 + 액션 */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{currentIdea.inspiration}</span>
                </div>
                <h2 className="text-2xl font-bold leading-tight">{currentIdea.title}</h2>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleIdeaStar(currentIdea.id)}
                  className="p-2 rounded-lg hover:bg-accent transition-colors"
                  title={currentIdea.starred ? '즐겨찾기 해제' : '즐겨찾기'}
                >
                  <Star
                    className={`w-5 h-5 ${
                      currentIdea.starred
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg hover:bg-accent transition-colors"
                  title="마크다운으로 복사"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={handleSaveToNotion}
                  disabled={isNotionLoading}
                  className="p-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="노션에 저장"
                >
                  {isNotionLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <BookOpen className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* 3줄 요약 */}
            <ol className="space-y-4">
              {currentIdea.lines.map((line, index) => (
                <li key={index} className="flex gap-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <p className="text-base leading-7 pt-0.5">{line}</p>
                </li>
              ))}
            </ol>

            {/* 심리 훅 태그 */}
            <div className="mt-6 pt-5 border-t border-border flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">건드리는 심리</span>
              <span className="px-2.5 py-1 rounded-full bg-muted font-medium">{currentIdea.hook}</span>
            </div>
          </div>
        ) : (
          !isGenerating && (
            <div className="text-center text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">버튼을 누르면 게임 코어 아이디어가 3줄로 튀어나옵니다</p>
              <p className="text-xs mt-1 opacity-70">"이런 거 한번 만들어볼까?"가 나올 때까지 딸깍</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}
