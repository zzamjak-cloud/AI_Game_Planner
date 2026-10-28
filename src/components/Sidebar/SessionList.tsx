// 세션 리스트 컴포넌트

import { ChatSession, SessionType } from '../../store/useAppStore'
import { FileText, BarChart3, Trash2 } from 'lucide-react'

interface SessionListProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

export function SessionList({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionListProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-1 p-2">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelectSession(session.id)}
          className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
            currentSessionId === session.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
        >
          <div className="flex-shrink-0">
            {session.type === SessionType.PLANNING ? (
              <FileText className="w-4 h-4" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session.title}</p>
            {session.type === SessionType.ANALYSIS && session.analysisStatus && (
              <p className="text-xs opacity-75">
                {session.analysisStatus === 'running' && '분석 중...'}
                {session.analysisStatus === 'completed' && '완료'}
                {session.analysisStatus === 'failed' && '실패'}
              </p>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDeleteSession(session.id)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

