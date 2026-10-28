// MCP 수신함 자동 가져오기 — 앱 시작(초기화 완료 후)·창 포커스·주기 확인 때 처리한다.

import { useEffect, useState } from 'react'
import { importMcpInbox, InboxImportResult } from '../lib/services/mcpInbox'

// 앱이 켜진 채로 에이전트가 템플릿을 등록하면 이 간격 안에 반영된다
const POLL_INTERVAL_MS = 10_000

/**
 * @param enabled 저장소 로드가 끝났는지 — 그 전에 가져오면 빈 스토어를 저장해 기존 데이터를 덮어쓴다
 * @returns 마지막으로 무언가를 가져온 결과 (알림 표시용, 없으면 null)
 */
export function useMcpInbox(enabled: boolean): InboxImportResult | null {
  const [lastImport, setLastImport] = useState<InboxImportResult | null>(null)

  useEffect(() => {
    if (!enabled) return

    const run = async () => {
      const result = await importMcpInbox()
      if (result && result.templates + result.sessions + result.ideas > 0) {
        setLastImport(result)
      }
    }

    void run()
    const timer = setInterval(run, POLL_INTERVAL_MS)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', run)
    }
  }, [enabled])

  return lastImport
}
