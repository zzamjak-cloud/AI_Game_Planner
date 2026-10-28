// 줌 컨트롤 컴포넌트

import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { ZOOM_LEVEL } from '../../lib/constants/ui'

interface ZoomControlsProps {
  zoomLevel: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function ZoomControls({ zoomLevel, onZoomIn, onZoomOut, onReset }: ZoomControlsProps) {
  return (
    <div className="flex items-center gap-1 border border-border rounded-lg p-1">
      <button
        onClick={onZoomOut}
        disabled={zoomLevel <= ZOOM_LEVEL.MIN}
        className="p-1 hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
        title="축소"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <span className="px-2 text-sm min-w-[3rem] text-center">{zoomLevel}%</span>
      <button
        onClick={onZoomIn}
        disabled={zoomLevel >= ZOOM_LEVEL.MAX}
        className="p-1 hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
        title="확대"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={onReset}
        className="p-1 hover:bg-muted rounded"
        title="리셋"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  )
}

