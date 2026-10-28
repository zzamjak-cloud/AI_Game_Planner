import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Copy, BookOpen, Check, Loader2, Download, History, CheckCircle2, FileText } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { useAppStore, SessionType } from '../store/useAppStore'
import { createNotionPage } from '../lib/notionBlocks'
import { extractGameNameFromPlanning, extractGameNameFromAnalysis, removeHtmlComments } from '../lib/utils/markdown'
import { VersionHistory } from './VersionHistory'
import { ChecklistPanel } from './ChecklistPanel'
import { ReferenceManager } from './ReferenceManager'
import { devLog } from '../lib/utils/logger'

export function MarkdownPreview() {
  const {
    currentSessionId,
    notionApiKey,
    notionPlanningDatabaseId,
    notionAnalysisDatabaseId,
    activePreviewTab,
    setActivePreviewTab,
  } = useAppStore()

  // 현재 세션만 선택적으로 구독 (다른 세션 변경 시 리렌더링 방지)
  const currentSession = useAppStore(state =>
    state.sessions.find((s) => s.id === state.currentSessionId)
  )

  const [isCopied, setIsCopied] = useState(false)
  const [isNotionLoading, setIsNotionLoading] = useState(false)

  const isAnalysisMode = currentSession?.type === SessionType.ANALYSIS

  // markdownContent는 현재 세션에서 직접 가져와서 동기화 보장
  const markdownContent = currentSession?.markdownContent || ''

  // 세션이 변경되면 미리보기 탭으로 자동 전환
  useEffect(() => {
    setActivePreviewTab('preview')
  }, [currentSessionId, setActivePreviewTab])

  // 마크다운에서 게임명 추출 (노션 저장 시 정확한 제목 사용)
  const gameName = markdownContent
    ? (isAnalysisMode
        ? extractGameNameFromAnalysis(markdownContent)
        : extractGameNameFromPlanning(markdownContent)) || currentSession?.title || '게임 기획서'
    : currentSession?.title || '게임 기획서'

  // 파일명 생성 (세션 타입에 따라)
  const getFileName = () => {
    if (isAnalysisMode) {
      return `${gameName}_게임분석.md`
    } else {
      return `${gameName}_게임기획서.md`
    }
  }

  // 현재 세션 타입에 맞는 Notion DB ID 선택
  const notionDatabaseId = isAnalysisMode ? notionAnalysisDatabaseId : notionPlanningDatabaseId

  // 복사 기능
  const handleCopy = async () => {
    if (!markdownContent) return

    try {
      await navigator.clipboard.writeText(markdownContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('복사 실패:', error)
      alert('복사에 실패했습니다')
    }
  }

  // 다운로드 기능
  const handleDownload = async () => {
    if (!markdownContent) {
      alert('저장할 내용이 없습니다')
      return
    }

    try {
      const filePath = await save({
        defaultPath: getFileName(),
        filters: [
          {
            name: 'Markdown',
            extensions: ['md'],
          },
        ],
      })

      if (filePath) {
        await writeTextFile(filePath, markdownContent)
        alert('파일이 저장되었습니다!')
      }
    } catch (error) {
      console.error('파일 저장 실패:', error)
      alert('파일 저장에 실패했습니다')
    }
  }

  // 노션 저장 기능
  const handleSaveToNotion = async () => {
    if (!markdownContent) {
      alert('저장할 기획서가 없습니다')
      return
    }

    if (!notionApiKey || !notionDatabaseId) {
      alert('노션 API 설정이 필요합니다.\n\n설정 메뉴에서 Notion API Key와 Database ID를 입력해주세요.')
      return
    }

    devLog.log('📝 노션 저장 시작:', { gameName, isAnalysisMode, length: markdownContent.length })

    setIsNotionLoading(true)

    try {
      const pageUrl = await createNotionPage(
        gameName,
        markdownContent,
        notionApiKey,
        notionDatabaseId,
        isAnalysisMode
      )

      if (pageUrl) {
        alert('노션에 저장되었습니다!\n\n' + pageUrl)
        // 노션 페이지 열기
        try {
          await openUrl(pageUrl)
        } catch (openError) {
          console.error('페이지 열기 실패:', openError)
          // 페이지 열기 실패는 무시 (수동으로 열 수 있음)
        }
      } else {
        throw new Error('페이지 URL을 받지 못했습니다')
      }
    } catch (error) {
      console.error('❌ 노션 저장 실패:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert('노션 저장에 실패했습니다.\n\n' + errorMessage)
    } finally {
      setIsNotionLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 상단 헤더 */}
      {currentSessionId && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background/50">
          {/* 탭 메뉴 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActivePreviewTab('preview')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                activePreviewTab === 'preview'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              미리보기
            </button>
            <button
              onClick={() => setActivePreviewTab('version')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                activePreviewTab === 'version'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <History className="w-4 h-4" />
              버전
            </button>
            <button
              onClick={() => setActivePreviewTab('checklist')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                activePreviewTab === 'checklist'
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              검증
            </button>
            {!isAnalysisMode && (
              <button
                onClick={() => setActivePreviewTab('reference')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  activePreviewTab === 'reference'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <FileText className="w-4 h-4" />
                레퍼런스
              </button>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-2">
            {/* 복사 버튼 */}
            <button
              onClick={handleCopy}
              disabled={!markdownContent}
              className="p-2 rounded-lg bg-background hover:bg-accent transition-colors relative group disabled:opacity-50 disabled:cursor-not-allowed"
              title={!markdownContent ? "내용이 없습니다" : (isCopied ? "복사됨" : "기획서 복사")}
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            {/* 다운로드 버튼 */}
            <button
              onClick={handleDownload}
              disabled={!markdownContent}
              className="p-2 rounded-lg bg-background hover:bg-accent transition-colors relative group disabled:opacity-50 disabled:cursor-not-allowed"
              title={!markdownContent ? "내용이 없습니다" : "마크다운 파일로 저장"}
            >
              <Download className="w-4 h-4" />
            </button>

            {/* 노션 저장 버튼 */}
            <button
              onClick={handleSaveToNotion}
              disabled={isNotionLoading || !markdownContent}
              className="p-2 rounded-lg bg-background hover:bg-accent transition-colors relative group disabled:opacity-50 disabled:cursor-not-allowed"
              title={!markdownContent ? "내용이 없습니다" : "노션에 저장"}
            >
              {isNotionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* 컨텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-6">
        {activePreviewTab === 'preview' && (
          !currentSession ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">세션이 없습니다</p>
                <p className="text-sm">
                  사이드바의 <span className="font-semibold">+</span> 버튼을 클릭하여 새 세션을 생성해주세요
                </p>
              </div>
            </div>
          ) : markdownContent ? (
            <div className="max-w-5xl mx-auto bg-background rounded-lg shadow-sm p-8">
              <div className="prose prose-lg max-w-none
                prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground
                prose-h1:text-4xl prose-h1:mb-8 prose-h1:pb-4 prose-h1:border-b-2 prose-h1:border-border prose-h1:font-extrabold
                prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-border prose-h2:font-bold
                prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-4 prose-h3:font-semibold
                prose-h4:text-xl prose-h4:mt-6 prose-h4:mb-3 prose-h4:font-semibold
                prose-p:my-4 prose-p:leading-relaxed prose-p:text-foreground prose-p:text-base
                prose-ul:my-6 prose-ul:space-y-3 prose-ul:list-disc prose-ul:pl-6
                prose-ol:my-6 prose-ol:space-y-3 prose-ol:list-decimal prose-ol:pl-6
                prose-li:my-2 prose-li:leading-relaxed prose-li:text-foreground prose-li:pl-2
                prose-strong:font-bold prose-strong:text-foreground
                prose-em:italic prose-em:text-foreground
                prose-code:bg-muted prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:my-6 prose-pre:border prose-pre:border-border
                prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:my-6 prose-blockquote:text-foreground/80
                prose-hr:my-8 prose-hr:border-border prose-hr:border-t-2
                prose-a:text-primary prose-a:underline prose-a:decoration-primary/30 prose-a:underline-offset-2 hover:prose-a:decoration-primary prose-a:font-medium
                prose-table:my-6 prose-table:w-full prose-table:border-collapse
                prose-thead:border-b-2 prose-thead:border-border prose-thead:bg-muted/50
                prose-th:p-3 prose-th:text-left prose-th:font-bold prose-th:text-foreground prose-th:border prose-th:border-border
                prose-td:p-3 prose-td:border prose-td:border-border prose-td:text-foreground
                prose-img:rounded-lg prose-img:my-6 prose-img:shadow-md
              ">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    // 링크 스타일 개선
                    a: ({ node, ...props }) => (
                      <a {...props} className="text-primary hover:text-primary/80 underline decoration-primary/30 underline-offset-2 hover:decoration-primary transition-colors font-medium" target="_blank" rel="noopener noreferrer" />
                    ),
                    // 리스트 스타일 개선
                    ul: ({ node, ...props }) => (
                      <ul {...props} className="list-disc pl-6 space-y-2 my-4" />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol {...props} className="list-decimal pl-6 space-y-2 my-4" />
                    ),
                    li: ({ node, ...props }) => (
                      <li {...props} className="leading-relaxed" />
                    ),
                  }}
                >
                  {removeHtmlComments(markdownContent)}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                {isAnalysisMode ? (
                  <>
                    <p className="text-lg font-medium mb-2">게임 분석 결과가 여기에 표시됩니다</p>
                    <p className="text-sm">
                      AI가 게임을 분석하면 실시간으로 렌더링됩니다
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">기획서가 여기에 표시됩니다</p>
                    <p className="text-sm">
                      AI가 기획서를 작성하면 실시간으로 렌더링됩니다
                    </p>
                  </>
                )}
              </div>
            </div>
          )
        )}

        {activePreviewTab === 'version' && currentSessionId && (
          <div className="max-w-4xl mx-auto">
            <VersionHistory sessionId={currentSessionId} />
          </div>
        )}

        {activePreviewTab === 'checklist' && currentSessionId && (
          <div className="max-w-4xl mx-auto">
            <ChecklistPanel sessionId={currentSessionId} />
          </div>
        )}

        {activePreviewTab === 'reference' && currentSessionId && !isAnalysisMode && (
          <div className="max-w-4xl mx-auto">
            <ReferenceManager sessionId={currentSessionId} />
          </div>
        )}
      </div>
    </div>
  )
}
