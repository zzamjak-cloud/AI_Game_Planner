import { useState, useRef, useEffect } from 'react'
import { Plus, MessageSquare, Trash2, Save, Upload, FileText, FileEdit, Search, GripVertical, Edit, Check, X, Lightbulb, Star } from 'lucide-react'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useAppStore, ChatSession, SessionType } from '../store/useAppStore'
import { TemplateManagerModal } from './TemplateManagerModal'
import { TemplateSelector } from './TemplateSelector'
import { AnalysisStartModal } from './AnalysisStartModal'
import { TemplateType } from '../types/promptTemplate'
import { devLog } from '../lib/utils/logger'

interface SidebarProps {
  onStartAnalysis?: (gameName: string) => void
}

export function Sidebar({ onStartAnalysis }: SidebarProps) {
  const {
    sessions,
    currentSessionId,
    currentSessionType,
    createNewSession,
    loadSession,
    deleteSession,
    importSession,
    setCurrentSessionType,
    getTemplateById,
    reorderSessions,
    createAnalysisSession,
    // 딸깍 아이디어 관련
    ideas,
    currentIdeaId,
    setCurrentIdeaId,
    deleteIdea,
    toggleIdeaStar,
  } = useAppStore()

  // 삭제 확인 다이얼로그 상태
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 세션 불러오기 성공 다이얼로그 상태
  const [importSuccessInfo, setImportSuccessInfo] = useState<{
    title: string
    summary: string
  } | null>(null)

  // 템플릿 관리 모달 상태
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  // 템플릿 선택 모달 상태 (신규)
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)

  // 분석 시작 모달 상태
  const [showAnalysisStart, setShowAnalysisStart] = useState(false)

  // 세션 제목 입력 모달 상태
  const [showTitleInput, setShowTitleInput] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // 세션 편집 상태
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionTitle, setEditingSessionTitle] = useState('')

  // 드래그 앤 드롭 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null)
  const dragStartX = useRef<number>(0)
  const dragStartY = useRef<number>(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 드래그로 인식하기 위한 최소 이동 거리 (픽셀)
  const DRAG_THRESHOLD = 5

  // 현재 탭에 맞는 세션만 필터링
  const filteredSessions = sessions
    .filter(s => s.type === currentSessionType)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  // 드래그 앤 드롭 이벤트 핸들러
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggedIndex === null || !listRef.current) return

      // 아직 드래그 시작 전이면 거리 체크
      if (!isDragging) {
        const deltaX = Math.abs(e.clientX - dragStartX.current)
        const deltaY = Math.abs(e.clientY - dragStartY.current)
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        // 임계값을 넘으면 드래그 시작
        if (distance > DRAG_THRESHOLD) {
          devLog.log('✨ 드래그 활성화:', draggedIndex)
          setIsDragging(true)
          setDragPosition({ x: e.clientX, y: e.clientY })
        }
        return
      }

      // 드래그 중이면 기존 로직 실행
      // 마우스 위치 업데이트 (드래그 프리뷰용)
      setDragPosition({ x: e.clientX, y: e.clientY })

      const items = listRef.current.querySelectorAll('[data-session-index]')

      let newDragOverIndex: number | null = null

      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect()
        const itemMiddle = rect.top + rect.height / 2

        if (e.clientY < itemMiddle && e.clientY > rect.top) {
          newDragOverIndex = index
        } else if (e.clientY > itemMiddle && e.clientY < rect.bottom) {
          newDragOverIndex = index
        }
      })

      if (newDragOverIndex !== null && newDragOverIndex !== draggedIndex) {
        setDragOverIndex(newDragOverIndex)
      }
    }

    const handleMouseUp = () => {
      if (isDragging && draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
        // 현재 타입의 세션만 재정렬
        const reordered = [...filteredSessions]
        const [draggedSession] = reordered.splice(draggedIndex, 1)
        reordered.splice(dragOverIndex, 0, draggedSession)

        // 재정렬된 세션들의 updatedAt 업데이트 (순서 반영)
        const reorderedWithTimestamp = reordered.map((s, index) => ({
          ...s,
          updatedAt: Date.now() - (index * 1000) // 역순으로 타임스탬프 설정
        }))

        // 다른 타입의 세션은 그대로 유지
        const otherTypeSessions = sessions.filter(s => s.type !== currentSessionType)

        // 전체 세션 목록 재구성
        const allSessions = [...otherTypeSessions, ...reorderedWithTimestamp]

        reorderSessions(allSessions)
        devLog.log(`✅ 세션 순서 변경: ${draggedIndex} → ${dragOverIndex}`)
      }

      setIsDragging(false)
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDragPosition(null)
    }

    if (draggedIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, draggedIndex, dragOverIndex, filteredSessions, sessions, currentSessionType, reorderSessions, DRAG_THRESHOLD])

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    // 버튼 클릭은 무시
    if ((e.target as HTMLElement).closest('button')) {
      return
    }

    setDraggedIndex(index)
    dragStartX.current = e.clientX
    dragStartY.current = e.clientY
    e.preventDefault()
  }

  // 드래그 중인 세션 정보
  const draggedSession = draggedIndex !== null ? filteredSessions[draggedIndex] : null

  // 새 세션 생성 - 탭 타입에 따라 다른 모달 표시
  const handleNewChat = () => {
    if (currentSessionType === SessionType.PLANNING) {
      setShowTemplateSelector(true)
    } else if (currentSessionType === SessionType.ANALYSIS) {
      setShowAnalysisStart(true)
    }
    // 딸깍 탭은 새 세션 개념이 없어 + 버튼을 노출하지 않는다
  }

  // 분석 시작 처리 핸들러
  const handleAnalysisStart = (gameName: string, templateId: string) => {
    const sessionId = createAnalysisSession(gameName, templateId)
    loadSession(sessionId)
    setShowAnalysisStart(false)
    onStartAnalysis?.(gameName)
  }

  // 템플릿 선택 완료 후 제목 입력 모달 표시
  const handleTemplateSelected = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setShowTitleInput(true)
  }

  // 세션 제목 입력 완료 후 세션 생성
  const handleTitleConfirm = () => {
    const title = newSessionTitle.trim()
    if (!title) {
      alert('세션 제목을 입력해주세요.')
      return
    }
    createNewSession(selectedTemplateId || undefined, title)
    setShowTitleInput(false)
    setNewSessionTitle('')
    setSelectedTemplateId(null)
  }

  // 세션 제목 입력 취소
  const handleTitleCancel = () => {
    setShowTitleInput(false)
    setNewSessionTitle('')
    setSelectedTemplateId(null)
  }

  // 세션 이름 편집 시작
  const handleEditStart = (e: React.MouseEvent, sessionId: string, currentTitle: string) => {
    e.stopPropagation()
    setEditingSessionId(sessionId)
    setEditingSessionTitle(currentTitle)
  }

  // 세션 이름 편집 저장
  const handleEditSave = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const title = editingSessionTitle.trim()
    if (!title) {
      alert('세션 제목을 입력해주세요.')
      return
    }
    useAppStore.getState().updateSession(sessionId, { title })
    setEditingSessionId(null)
    setEditingSessionTitle('')
  }

  // 세션 이름 편집 취소
  const handleEditCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSessionId(null)
    setEditingSessionTitle('')
  }

  const handleSelectSession = (sessionId: string) => {
    if (sessionId !== currentSessionId) {
      loadSession(sessionId)
    }
  }

  // 탭 전환 핸들러
  const handleTabChange = (type: SessionType) => {
    // 탭 타입 변경
    setCurrentSessionType(type)

    if (type === SessionType.IDEA) {
      // 딸깍 탭: 채팅 세션 상태는 비우고 아이디어 히스토리는 그대로 유지
      useAppStore.setState({ currentSessionId: null, messages: [], markdownContent: '' })
      return
    }

    // 해당 타입의 세션들 찾기 (PLANNING / ANALYSIS)
    const typeSessions = sessions.filter(s => s.type === type)

    if (typeSessions.length > 0) {
      // 가장 최근에 업데이트된 세션 선택
      const latestSession = typeSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]
      loadSession(latestSession.id)
    } else {
      // 해당 타입의 세션이 없으면 빈 상태로 유지 (자동 생성 제거)
      useAppStore.setState({
        currentSessionId: null,
        messages: [],
        markdownContent: '',
      })
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setDeleteConfirm(sessionId)
  }

  const confirmDelete = () => {
    if (deleteConfirm) {
      // 딸깍 탭이면 아이디어 삭제
      if (currentSessionType === SessionType.IDEA) {
        deleteIdea(deleteConfirm)
      } else {
        deleteSession(deleteConfirm)
      }
      setDeleteConfirm(null)
    }
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
  }

  const handleExportSession = async (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation()

    try {
      // 파일명 생성 (게임명_날짜.gplan)
      const date = new Date(session.updatedAt).toISOString().split('T')[0]
      const defaultFileName = `${session.title}_${date}.gplan`

      // 저장 경로 선택
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: 'Game Plan',
            extensions: ['gplan', 'json'],
          },
        ],
      })

      if (!filePath) return // 사용자가 취소한 경우

      // 세션 데이터를 JSON으로 변환 (버전 히스토리 및 참조 파일 포함)
      const sessionData = {
        id: session.id,
        type: session.type,
        title: session.title,
        messages: session.messages,
        markdownContent: session.markdownContent,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        gameName: session.gameName,
        notionPageUrl: session.notionPageUrl,
        analysisStatus: session.analysisStatus,
        templateId: session.templateId,

        // 버전 히스토리 포함
        versions: session.versions || [],
        currentVersionNumber: session.currentVersionNumber,

        // 참조 파일 포함
        referenceFiles: session.referenceFiles || [],

        // 체크리스트 및 검증 정보 포함
        validation: session.validation,

        exportedAt: Date.now(),
        version: '1.1', // 버전 업데이트 (1.0 -> 1.1)
      }

      // 파일 저장
      await writeTextFile(filePath, JSON.stringify(sessionData, null, 2))

      // 저장된 내용 요약
      const versionCount = session.versions?.length || 0
      const referenceCount = session.referenceFiles?.length || 0
      const summaryParts = []

      if (versionCount > 0) summaryParts.push(`버전 히스토리 ${versionCount}개`)
      if (referenceCount > 0) summaryParts.push(`참조 파일 ${referenceCount}개`)

      const summary = summaryParts.length > 0
        ? `\n\n포함된 내용:\n- ${summaryParts.join('\n- ')}`
        : ''

      alert(`세션이 저장되었습니다!${summary}`)
    } catch (error) {
      console.error('세션 저장 실패:', error)
      alert('세션 저장에 실패했습니다.')
    }
  }

  const handleImportSession = async () => {
    try {
      // 파일 선택
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: 'Game Plan',
            extensions: ['gplan', 'json'],
          },
        ],
      })

      if (!filePath) return // 사용자가 취소한 경우

      // 파일 읽기
      const fileContent = await readTextFile(filePath as string)
      const sessionData = JSON.parse(fileContent)

      // 세션 데이터 검증
      if (!sessionData.title || !sessionData.messages || !Array.isArray(sessionData.messages)) {
        throw new Error('올바르지 않은 세션 파일입니다.')
      }

      // 세션 불러오기 (버전 히스토리 및 참조 파일 복원)
      importSession({
        id: sessionData.id || `session-${Date.now()}`,
        type: sessionData.type || SessionType.PLANNING,  // 기본값: 기획
        title: sessionData.title,
        messages: sessionData.messages,
        markdownContent: sessionData.markdownContent || '',
        createdAt: sessionData.createdAt || Date.now(),
        updatedAt: sessionData.updatedAt || Date.now(),
        gameName: sessionData.gameName,
        notionPageUrl: sessionData.notionPageUrl,
        analysisStatus: sessionData.analysisStatus,
        templateId: sessionData.templateId,

        // 버전 히스토리 복원
        versions: sessionData.versions || [],
        currentVersionNumber: sessionData.currentVersionNumber,

        // 참조 파일 복원
        referenceFiles: sessionData.referenceFiles || [],

        // 체크리스트 및 검증 정보 복원
        validation: sessionData.validation,
      })

      // 불러온 내용 요약
      const versionCount = sessionData.versions?.length || 0
      const referenceCount = sessionData.referenceFiles?.length || 0
      const summaryParts = []

      if (versionCount > 0) summaryParts.push(`버전 히스토리 ${versionCount}개`)
      if (referenceCount > 0) summaryParts.push(`참조 파일 ${referenceCount}개`)

      const summary = summaryParts.length > 0
        ? summaryParts.join(', ')
        : '세션을 성공적으로 불러왔습니다.'

      // 성공 다이얼로그 표시
      setImportSuccessInfo({
        title: sessionData.title || '세션',
        summary: summary
      })
    } catch (error) {
      console.error('세션 불러오기 실패:', error)
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      // 에러는 간단히 콘솔에만 출력 (추후 커스텀 에러 다이얼로그 추가 가능)
      console.error('세션 불러오기 오류:', errorMessage)
    }
  }


  return (
    <div className="w-64 bg-muted/50 border-r border-border flex flex-col relative">
      {/* 드래그 프리뷰 */}
      {isDragging && draggedSession && dragPosition && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: dragPosition.x + 10,
            top: dragPosition.y - 20,
            width: '240px',
          }}
        >
          <div className="bg-card border-2 border-primary rounded-lg p-3 shadow-2xl opacity-90">
            <div className="flex items-start gap-2">
              {/* 드래그 핸들 아이콘 */}
              <div className="flex-shrink-0 text-muted-foreground pt-0.5">
                <GripVertical size={14} />
              </div>

              {/* 세션 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {draggedSession.type === SessionType.PLANNING ? (
                    <FileText className="w-4 h-4 text-primary" />
                  ) : (
                    <Search className="w-4 h-4 text-primary" />
                  )}
                  <h3 className="font-semibold text-sm truncate">{draggedSession.title}</h3>
                </div>
                {getTemplateById(draggedSession.templateId || '') && (
                  <p className="text-xs text-muted-foreground truncate">
                    {getTemplateById(draggedSession.templateId || '')?.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 탭 영역 - 3탭 */}
      <div className="flex border-b border-border">
        <button
          onClick={() => handleTabChange(SessionType.PLANNING)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 transition-colors ${
            currentSessionType === SessionType.PLANNING
              ? 'bg-background border-t-2 border-l-2 border-r-2 border-primary text-primary font-semibold'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 border-b-2 border-primary'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span className="font-medium text-sm">기획</span>
        </button>
        <button
          onClick={() => handleTabChange(SessionType.ANALYSIS)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 transition-colors ${
            currentSessionType === SessionType.ANALYSIS
              ? 'bg-background border-t-2 border-l-2 border-r-2 border-primary text-primary font-semibold'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 border-b-2 border-primary'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="font-medium text-sm">분석</span>
        </button>
        <button
          onClick={() => handleTabChange(SessionType.IDEA)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-3 transition-colors ${
            currentSessionType === SessionType.IDEA
              ? 'bg-background border-t-2 border-l-2 border-r-2 border-primary text-primary font-semibold'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 border-b-2 border-primary'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          <span className="font-medium text-sm">딸깍</span>
        </button>
      </div>

      {/* 버튼 영역 (딸깍 탭은 세션 개념이 없어 숨김) */}
      {currentSessionType !== SessionType.IDEA && (
        <div className="p-3 border-b border-border">
          <div className="flex gap-2">
            <button
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center p-2 rounded-lg bg-muted hover:bg-accent transition-colors"
              title={currentSessionType === SessionType.PLANNING ? '새 게임 기획' : '게임 분석'}
            >
              <Plus className="w-4 h-4" />
            </button>
              <button
                onClick={handleImportSession}
                className="flex-1 flex items-center justify-center p-2 rounded-lg bg-muted hover:bg-accent transition-colors"
                title="세션 불러오기"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowTemplateManager(true)}
                className="flex-1 flex items-center justify-center p-2 rounded-lg bg-muted hover:bg-accent transition-colors"
                title={currentSessionType === SessionType.PLANNING ? '기획 템플릿 관리' : '분석 템플릿 관리'}
              >
                <FileEdit className="w-4 h-4" />
              </button>
          </div>
        </div>
      )}

      {/* 세션 목록 영역 */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {currentSessionType === SessionType.IDEA ? (
          // 딸깍 탭: 아이디어 히스토리 렌더링 (즐겨찾기 우선, 최신순)
          ideas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <Lightbulb className="w-8 h-8 mb-2 opacity-50" />
              <p>아직 아이디어가 없습니다</p>
              <p className="text-xs mt-1">딸깍 버튼을 눌러보세요</p>
            </div>
          ) : (
            <div className="space-y-1">
              {[...ideas]
                .sort((a, b) => Number(b.starred) - Number(a.starred) || b.createdAt - a.createdAt)
                .map((idea) => {
                  const isActive = currentIdeaId === idea.id
                  return (
                    <div
                      key={idea.id}
                      onClick={() => setCurrentIdeaId(idea.id)}
                      className={`group relative p-3 rounded-lg transition-all select-none cursor-pointer ${
                        isActive
                          ? 'bg-primary/10 border-l-4 border-primary pl-2.5'
                          : 'hover:bg-accent/50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm truncate ${isActive ? 'text-primary' : ''}`}>
                            {idea.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {idea.hook}
                          </div>
                        </div>
                        <div className={`flex gap-1 ${idea.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleIdeaStar(idea.id) }}
                            className="p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900 transition-colors"
                            title={idea.starred ? '즐겨찾기 해제' : '즐겨찾기'}
                          >
                            <Star className={`w-3.5 h-3.5 ${idea.starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, idea.id)}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          )
        ) : (
          // 기획/분석 탭: filteredSessions 목록 렌더링
          filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
              <p>채팅이 없습니다</p>
              <p className="text-xs mt-1">
                {currentSessionType === SessionType.PLANNING
                  ? '새 게임 기획을 시작하세요'
                  : '게임 분석을 시작하세요'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredSessions.map((session, index) => {
                const isActive = currentSessionId === session.id
                const isBeingDragged = isDragging && draggedIndex === index
                const isDragOver = dragOverIndex === index && !isBeingDragged
                const isEditing = editingSessionId === session.id

                return (
                  <div
                    key={session.id}
                    data-session-index={index}
                    onMouseDown={(e) => !isEditing && handleMouseDown(e, index)}
                    onClick={() => !isDragging && !isEditing && handleSelectSession(session.id)}
                    className={`group relative p-3 rounded-lg transition-all select-none ${
                      isActive
                        ? 'bg-primary/10 border-l-4 border-primary pl-2.5'
                        : 'hover:bg-accent/50 border-l-4 border-transparent'
                    } ${isBeingDragged ? 'opacity-50 cursor-grabbing' : isEditing ? 'cursor-default' : 'cursor-grab'} ${
                      isDragOver ? 'border-t-4 border-t-primary pt-5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* 드래그 핸들 아이콘 */}
                      {!isEditing && (
                        <div className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors pt-0.5">
                          <GripVertical size={14} />
                        </div>
                      )}

                      <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      }`} />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          // 편집 모드
                          <input
                            type="text"
                            value={editingSessionTitle}
                            onChange={(e) => setEditingSessionTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleEditSave(e as any, session.id)
                              } else if (e.key === 'Escape') {
                                handleEditCancel(e as any)
                              }
                            }}
                            className="w-full px-2 py-1 text-sm border border-primary rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                        ) : (
                          // 일반 모드
                          <>
                            <div className={`font-medium text-sm truncate ${
                              isActive
                                ? 'text-primary'
                                : ''
                            }`}>
                              {session.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {session.templateId ? (
                                getTemplateById(session.templateId)?.name || '기본 템플릿'
                              ) : (
                                '기본 템플릿'
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className={`flex gap-1 ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        {isEditing ? (
                          // 편집 모드 아이콘
                          <>
                            <button
                              onClick={(e) => handleEditSave(e, session.id)}
                              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                              title="저장"
                            >
                              <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                            </button>
                            <button
                              onClick={(e) => handleEditCancel(e)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              title="취소"
                            >
                              <X className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                            </button>
                          </>
                        ) : (
                          // 일반 모드 아이콘
                          <>
                            <button
                              onClick={(e) => handleEditStart(e, session.id, session.title)}
                              className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                              title="이름 편집"
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            </button>
                            <button
                              onClick={(e) => handleExportSession(e, session)}
                              className="p-1 rounded hover:bg-primary/10 transition-colors"
                              title="세션 저장"
                            >
                              <Save className="w-3.5 h-3.5 text-primary" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(e, session.id)}
                              className="p-1 rounded hover:bg-destructive/10 transition-colors"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">
              {currentSessionType === SessionType.IDEA ? '아이디어 삭제' : '세션 삭제'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {currentSessionType === SessionType.IDEA ? '이 아이디어를 삭제하시겠습니까?' : '이 채팅을 삭제하시겠습니까?'}<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 세션 불러오기 성공 다이얼로그 */}
      {importSuccessInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">세션 불러오기 완료</h3>
            <p className="text-muted-foreground mb-4">
              <span className="font-semibold text-foreground">"{importSuccessInfo.title}"</span> 세션을 성공적으로 불러왔습니다.
            </p>
            {importSuccessInfo.summary && (
              <div className="bg-muted/50 rounded-lg p-3 mb-6 text-sm">
                <p className="text-muted-foreground">복원된 내용: {importSuccessInfo.summary}</p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setImportSuccessInfo(null)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 관리 모달 */}
      <TemplateManagerModal
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        templateType={currentSessionType === SessionType.PLANNING ? TemplateType.PLANNING : TemplateType.ANALYSIS}
      />

      {/* 기획 탭 템플릿 선택 모달 */}
      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        sessionType={currentSessionType}
        onSelect={handleTemplateSelected}
      />

      {/* 분석 시작 모달 (게임 제목 + 템플릿 선택 통합) */}
      <AnalysisStartModal
        isOpen={showAnalysisStart}
        onClose={() => setShowAnalysisStart(false)}
        onStart={handleAnalysisStart}
      />

      {/* 세션 제목 입력 모달 */}
      {showTitleInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">세션 제목 입력</h3>
            <input
              type="text"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTitleConfirm()
                } else if (e.key === 'Escape') {
                  handleTitleCancel()
                }
              }}
              placeholder={currentSessionType === SessionType.PLANNING ? '기획서 제목을 입력하세요' : '분석 보고서 제목을 입력하세요'}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-6"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleTitleCancel}
                className="px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleTitleConfirm}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
