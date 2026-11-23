// QuickNote 외부 API(원격 MCP 서버) 기본값

export const DEFAULT_QUICKNOTE_MCP_URL = 'https://dsribnko50l8y.cloudfront.net/mcp'

// 페이지당 마크다운 상한(UTF-8 바이트). 저장 시 7~9배로 커져 서버 한도(358,400바이트)를 넘지 않게 한다
export const MAX_PAGE_MD = 28_000

// create_pages 한 번에 보낼 수 있는 페이지 수·마크다운 합계 (요청 본문 1MB 한도 대비 여유)
export const MAX_PAGES_PER_CALL = 20
export const MAX_BYTES_PER_CALL = 300 * 1024
