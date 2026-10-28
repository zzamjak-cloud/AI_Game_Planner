import { useState, useRef, useEffect } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { ChatPanel } from './components/ChatPanel'
import { MarkdownPreview } from './components/MarkdownPreview'
import { SettingsModal } from './components/SettingsModal'
import { Resizer } from './components/Resizer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateModal } from './components/UpdateModal'
import { IdeaPanel } from './components/IdeaPanel'
import { useAppStore } from './store/useAppStore'
import { SessionType } from './store/useAppStore'
import { useAppInitialization } from './hooks/useAppInitialization'
import { useAutoSave } from './hooks/useAutoSave'
import { useMessageHandler } from './hooks/useMessageHandler'
import { useAutoUpdate } from './hooks/useAutoUpdate'
import { useMcpInbox } from './hooks/useMcpInbox'
import { CHAT_PANEL_WIDTH } from './lib/constants/ui'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [chatPanelWidth, setChatPanelWidth] = useState<number>(CHAT_PANEL_WIDTH.DEFAULT)
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('')
  const [showVersionConfirm, setShowVersionConfirm] = useState(false)
  const [showVersionTitleInput, setShowVersionTitleInput] = useState(false)
  const [versionTitle, setVersionTitle] = useState('')
  const versionInputRef = useRef<HTMLInputElement>(null) // input ref 추가
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null)
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  // sessions 구독 제거 - 렉 방지 (필요할 때만 getState()로 가져옴)
  const { apiKey, currentSessionId, currentSessionType, createVersion, setActivePreviewTab } = useAppStore()

  // 자동 업데이트
  const {
    status: updateStatus,
    update,
    progress: updateProgress,
    error: updateError,
    downloadAndInstall,
    dismissUpdate,
  } = useAutoUpdate()

  // 앱 초기화 (저장소 로드가 끝나야 MCP 수신함을 가져온다)
  const [isInitialized, setIsInitialized] = useState(false)
  useAppInitialization({
    onSettingsRequired: () => setShowSettings(true),
    onInitialized: () => setIsInitialized(true),
  })

  // AI 에이전트(MCP)가 보낸 템플릿·세션·아이디어 자동 가져오기 + 잠깐 알림
  const mcpImport = useMcpInbox(isInitialized)
  const [showMcpToast, setShowMcpToast] = useState(false)
  useEffect(() => {
    if (!mcpImport) return
    setShowMcpToast(true)
    const timer = setTimeout(() => setShowMcpToast(false), 5000)
    return () => clearTimeout(timer)
  }, [mcpImport])

  // 세션 자동 저장 (버전 생성 중에는 차단)
  useAutoSave({ isBlocked: showVersionConfirm || showVersionTitleInput })

  // 메시지 핸들러
  const { handleSendMessage } = useMessageHandler()

  const handleSendMessageWrapper = async (message: string) => {
    if (!apiKey) {
      setInfoDialog({
        title: 'API Key 필요',
        message: 'API Key를 먼저 설정해주세요'
      })
      setShowSettings(true)
      return
    }

    try {
      await handleSendMessage(message, {
        onChatUpdate: (text) => {
          setCurrentAssistantMessage(text)
        },
        onMarkdownUpdate: () => {
          // 마크다운 업데이트는 스토어에서 처리됨
        },
        onComplete: () => {
          setCurrentAssistantMessage('')
          // 미리보기 탭으로 자동 전환
          setActivePreviewTab('preview')
          // 기획 세션에서만 버전 등록 팝업 표시
          const state = useAppStore.getState()
          const currentSession = state.sessions.find(s => s.id === currentSessionId)
          if (currentSession && currentSession.type === 'planning') {
            setShowVersionConfirm(true)
          }
        },
        onError: (error) => {
          console.error('메시지 처리 오류:', error)
          setCurrentAssistantMessage('')
        },
      })
    } catch (error) {
      console.error('메시지 전송 실패:', error)
      setCurrentAssistantMessage('')
    }
  }

  const handleSettingsClick = () => {
    setShowSettings(true)
  }

  // 버전 등록 확인
  const handleVersionConfirmYes = () => {
    setShowVersionConfirm(false)
    setShowVersionTitleInput(true)
    // 다음 틱에 input 초기화 (모달이 렌더링된 후)
    setTimeout(() => {
      if (versionInputRef.current) {
        versionInputRef.current.value = ''
      }
    }, 0)
  }

  const handleVersionConfirmNo = () => {
    setShowVersionConfirm(false)
  }

  // 버전 제목 입력 후 등록
  const handleVersionTitleConfirm = async () => {
    if (!currentSessionId) return
    try {
      // ref에서 직접 값 가져오기
      const title = versionInputRef.current?.value?.trim() || undefined
      createVersion(currentSessionId, title)
      setShowVersionTitleInput(false)
      setVersionTitle('')
      // 버전 생성 후 즉시 저장 (차단이 해제되면 자동으로 저장됨)
      // saveSessionImmediately는 필요 없음 - 모달이 닫히면 자동 저장이 재개됨
    } catch (error) {
      console.error('버전 생성 실패:', error)
      setErrorDialog({
        title: '버전 생성 실패',
        message: '버전 생성에 실패했습니다.'
      })
    }
  }

  const handleVersionTitleCancel = () => {
    setShowVersionTitleInput(false)
    setVersionTitle('')
  }

  // 리사이저 드래그 핸들러
  const handleResize = (delta: number) => {
    const container = document.getElementById('main-container')
    if (!container) return

    // 사이드바(256px)를 제외한 실제 컨텐츠 영역의 너비
    const contentWidth = container.offsetWidth - 256
    const deltaPercent = (delta / contentWidth) * 100

    setChatPanelWidth((prev) => {
      const newWidth = prev + deltaPercent
      return Math.max(CHAT_PANEL_WIDTH.MIN, Math.min(CHAT_PANEL_WIDTH.MAX, newWidth))
    })
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <Header
          onSettingsClick={handleSettingsClick}
        />
        <div id="main-container" className="flex-1 flex overflow-hidden">
          {/* 좌측 사이드바 (채팅 목록) */}
          <Sidebar onStartAnalysis={handleSendMessageWrapper} />

          {/* 메인 컨텐츠 영역 (딸깍 탭이면 IdeaPanel, 그 외엔 기존 3컬럼) */}
          <div className="flex-1 flex overflow-hidden">
            {currentSessionType === SessionType.IDEA ? (
              /* 딸깍 탭: IdeaPanel이 전체 영역 차지 */
              <IdeaPanel />
            ) : (
              /* 기획/분석 탭: 기존 3컬럼 레이아웃 유지 */
              <>
                {/* 중앙 채팅 패널 */}
                <div
                  style={{ width: `${chatPanelWidth}%` }}
                  className="flex-shrink-0 overflow-hidden"
                >
                  <ChatPanel
                    onSendMessage={handleSendMessageWrapper}
                    currentAssistantMessage={currentAssistantMessage}
                  />
                </div>

                {/* 리사이저 */}
                <Resizer onResize={handleResize} />

                {/* 우측 마크다운 프리뷰 */}
                <div className="flex-1 overflow-hidden">
                  <MarkdownPreview />
                </div>
              </>
            )}
          </div>
        </div>

        {/* 설정 모달 */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />

        {/* 버전 등록 확인 팝업 */}
        {showVersionConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">버전 등록</h3>
              <p className="text-muted-foreground mb-6">
                신규 버전을 등록하시겠습니까?<br />
                현재 기획서 상태를 버전으로 저장할 수 있습니다.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleVersionConfirmNo}
                  className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors font-medium"
                >
                  나중에
                </button>
                <button
                  onClick={handleVersionConfirmYes}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                >
                  등록
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 버전 제목 입력 모달 */}
        {showVersionTitleInput && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">버전 제목 입력</h3>
              <input
                ref={versionInputRef}
                type="text"
                defaultValue={versionTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleVersionTitleConfirm()
                  } else if (e.key === 'Escape') {
                    handleVersionTitleCancel()
                  }
                }}
                placeholder="버전 설명을 입력하세요 (선택사항)"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-6"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleVersionTitleCancel}
                  className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleVersionTitleConfirm}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 에러 다이얼로그 */}
        {errorDialog && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setErrorDialog(null)
              }
            }}
          >
            <div
              className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4 text-destructive">❌ {errorDialog.title}</h3>
              <p className="text-muted-foreground mb-6 whitespace-pre-wrap">{errorDialog.message}</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setErrorDialog(null)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 정보 다이얼로그 */}
        {infoDialog && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setInfoDialog(null)
              }
            }}
          >
            <div
              className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4 text-primary">ℹ️ {infoDialog.title}</h3>
              <p className="text-muted-foreground mb-6 whitespace-pre-wrap">{infoDialog.message}</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setInfoDialog(null)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MCP 수신함 가져오기 알림 */}
        {showMcpToast && mcpImport && (
          <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg border border-border bg-background shadow-lg text-sm">
            🤖 AI 에이전트에서 가져옴 —{' '}
            {[
              mcpImport.templates > 0 && `템플릿 ${mcpImport.templates}개`,
              mcpImport.sessions > 0 && `세션 ${mcpImport.sessions}개`,
              mcpImport.ideas > 0 && `아이디어 ${mcpImport.ideas}개`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}

        {/* 자동 업데이트 모달 */}
        <UpdateModal
          status={updateStatus}
          update={update}
          progress={updateProgress}
          error={updateError}
          onDownload={downloadAndInstall}
          onDismiss={dismissUpdate}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
