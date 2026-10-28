import { ArrowRight, ExternalLink } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

interface AnalysisResultProps {
  sessionId: string
  gameName?: string
  notionPageUrl?: string
  analysisStatus?: 'pending' | 'running' | 'completed' | 'failed'
}

export function AnalysisResult({
  sessionId,
  gameName,
  notionPageUrl,
  analysisStatus,
}: AnalysisResultProps) {
  const { convertAnalysisToPlanning } = useAppStore()

  const handleConvertToPlanning = () => {
    try {
      convertAnalysisToPlanning(sessionId)
    } catch (error) {
      console.error('세션 변환 실패:', error)
      alert('기획 세션 생성에 실패했습니다.')
    }
  }

  // 분석이 완료되지 않은 경우 아무것도 표시하지 않음
  if (analysisStatus !== 'completed' || !notionPageUrl) {
    return null
  }

  return (
    <div className="mt-4 p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
      <div className="space-y-3">
        {/* 분석 완료 메시지 */}
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-medium text-sm">분석이 완료되었습니다</span>
        </div>

        {/* Notion URL */}
        {notionPageUrl && (
          <a
            href={notionPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-background hover:bg-accent transition-colors group"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Notion에서 전체 분석 결과 보기
            </span>
          </a>
        )}

        {/* 기획으로 전환 버튼 */}
        <button
          onClick={handleConvertToPlanning}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
        >
          <span>이 분석으로 게임 기획 시작하기</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-muted-foreground text-center">
          {gameName ? `"${gameName}"` : '이'} 분석을 참고하여 새로운 게임 기획서를 작성할 수 있습니다
        </p>
      </div>
    </div>
  )
}
