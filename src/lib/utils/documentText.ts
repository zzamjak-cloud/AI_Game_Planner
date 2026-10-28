// 참조 파일 → 텍스트 변환 (순수 함수, Tauri·DOM 비의존)
//
// 앱(fileParser.ts, Tauri fs/http 로 읽음)과 MCP 서버(mcp/src/documents.ts, Node fs/fetch 로 읽음)가
// 같은 변환 규칙을 쓰도록 바이트·문자열 입력만 받는 부분을 여기에 둔다.

import * as XLSX from 'xlsx'

/**
 * CSV 텍스트 → `셀 | 셀` 줄 목록 (쉼표로 구분, 따옴표 제거, 빈 셀 제외)
 */
export function csvToText(csv: string): string {
  return csv
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) =>
      line
        .split(',')
        .map((cell) => cell.trim().replace(/^"|"$/g, ''))
        .filter((cell) => cell.length > 0)
        .join(' | ')
    )
    .join('\n')
}

/**
 * 엑셀(xlsx/xls) 바이트 → 시트별 `셀 | 셀` 텍스트
 */
export function excelToText(bytes: Uint8Array): { text: string; sheetCount: number } {
  const workbook = XLSX.read(bytes, { type: 'buffer' })
  let text = ''

  // 모든 시트를 순회하며 텍스트로 변환
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]

    text += `\n\n=== 시트: ${sheetName} ===\n\n`

    // 각 행을 텍스트로 변환
    for (const row of rows) {
      if (Array.isArray(row) && row.length > 0) {
        const rowText = row
          .map((cell) => (cell !== null && cell !== undefined ? String(cell).trim() : ''))
          .filter((cell) => cell.length > 0)
          .join(' | ')

        if (rowText) {
          text += rowText + '\n'
        }
      }
    }
  }

  return { text: text.trim(), sheetCount: workbook.SheetNames.length }
}

/**
 * Google Spreadsheet URL 을 CSV 내보내기 URL 로 바꾼다 (형식이 다르면 그대로)
 * 예: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid=1
 *  -> https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=1
 */
export function googleSheetCsvUrl(url: string): string {
  const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!sheetIdMatch) return url
  // gid 파라미터 추출 (있는 경우)
  const gid = url.match(/[#&]gid=(\d+)/)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/export?format=csv&gid=${gid}`
}

/**
 * Google Spreadsheet URL 인지
 */
export function isGoogleSheetUrl(url: string): boolean {
  return url.includes('docs.google.com/spreadsheets')
}

/**
 * pdf.js 문서 객체 → 페이지별 텍스트 (pdf.js 로딩 방식은 호출부마다 다르다 — 브라우저 워커 / Node legacy)
 */
export async function pdfDocumentToText(pdf: {
  numPages: number
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>
}): Promise<string> {
  let text = ''

  // 모든 페이지 텍스트 추출
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    // 텍스트 아이템들을 문자열로 변환
    const pageText = textContent.items
      .map((item) => (item && typeof item === 'object' && 'str' in item ? String((item as { str: unknown }).str) : ''))
      .join(' ')

    text += pageText + '\n\n'
  }

  return text.trim()
}

/**
 * HTML → 본문 텍스트 (script/style 제거, 태그 제거, 엔티티 일부 복원). MCP 의 웹페이지 참조용
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
