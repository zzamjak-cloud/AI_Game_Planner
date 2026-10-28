// 세션 액션 버튼 컴포넌트

import { Plus, FolderOpen, Settings } from 'lucide-react'

interface SessionActionsProps {
  onNewSession: () => void
  onLoadSession: () => void
  onManageTemplates: () => void
}

export function SessionActions({
  onNewSession,
  onLoadSession,
  onManageTemplates,
}: SessionActionsProps) {
  return (
    <div className="flex gap-2 justify-around p-2 border-t border-border">
      <button
        onClick={onNewSession}
        className="p-2 hover:bg-muted rounded transition-colors"
        title="새 게임 기획"
      >
        <Plus className="w-5 h-5" />
      </button>
      <button
        onClick={onLoadSession}
        className="p-2 hover:bg-muted rounded transition-colors"
        title="세션 불러오기"
      >
        <FolderOpen className="w-5 h-5" />
      </button>
      <button
        onClick={onManageTemplates}
        className="p-2 hover:bg-muted rounded transition-colors"
        title="기획 템플릿 관리"
      >
        <Settings className="w-5 h-5" />
      </button>
    </div>
  )
}

