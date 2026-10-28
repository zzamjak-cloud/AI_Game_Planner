// 파일 파서 유틸리티 - 다양한 파일 형식을 텍스트로 변환
// 바이트 → 텍스트 변환 규칙은 MCP 서버와 공유한다 (documentText.ts)

import { readFile } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'
import * as pdfjsLib from 'pdfjs-dist'
import { csvToText, excelToText, googleSheetCsvUrl, pdfDocumentToText } from './documentText'

// PDF.js Worker 설정 (로컬 파일 사용)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'

export interface ParsedFileContent {
  text: string
  metadata?: {
    fileName: string
    fileType: string
    pageCount?: number
    sheetCount?: number
  }
}

/**
 * 파일 확장자로 파일 타입 판단
 */
export function getFileType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  return ext
}

/**
 * PDF 파일 파싱 (pdfjs-dist 사용)
 */
export async function parsePDF(filePath: string, fileName: string): Promise<ParsedFileContent> {
  try {
    const fileData = await readFile(filePath)

    // PDF 문서 로드
    const loadingTask = pdfjsLib.getDocument({ data: fileData })
    const pdf = await loadingTask.promise

    // 모든 페이지 텍스트 추출
    const text = await pdfDocumentToText(pdf)

    return {
      text,
      metadata: {
        fileName,
        fileType: 'pdf',
        pageCount: pdf.numPages,
      },
    }
  } catch (error) {
    throw new Error(`PDF 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Excel 파일 파싱 (xlsx, xls)
 */
export async function parseExcel(filePath: string, fileName: string): Promise<ParsedFileContent> {
  try {
    const fileData = await readFile(filePath)

    // 모든 시트를 순회하며 텍스트로 변환
    const { text, sheetCount } = excelToText(fileData)

    return {
      text,
      metadata: {
        fileName,
        fileType: 'excel',
        sheetCount,
      },
    }
  } catch (error) {
    throw new Error(`Excel 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * CSV 파일 파싱
 */
export async function parseCSV(filePath: string, fileName: string): Promise<ParsedFileContent> {
  try {
    const fileData = await readFile(filePath)
    const text = new TextDecoder('utf-8').decode(fileData)

    // CSV를 파싱하여 읽기 쉬운 형식으로 변환
    return {
      text: csvToText(text),
      metadata: {
        fileName,
        fileType: 'csv',
      },
    }
  } catch (error) {
    throw new Error(`CSV 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Markdown 파일 파싱
 */
export async function parseMarkdown(filePath: string, fileName: string): Promise<ParsedFileContent> {
  try {
    const fileData = await readFile(filePath)
    const text = new TextDecoder('utf-8').decode(fileData)

    return {
      text,
      metadata: {
        fileName,
        fileType: 'markdown',
      },
    }
  } catch (error) {
    throw new Error(`Markdown 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 텍스트 파일 파싱
 */
export async function parseText(filePath: string, fileName: string): Promise<ParsedFileContent> {
  try {
    const fileData = await readFile(filePath)
    const text = new TextDecoder('utf-8').decode(fileData)

    return {
      text,
      metadata: {
        fileName,
        fileType: 'text',
      },
    }
  } catch (error) {
    throw new Error(`텍스트 파일 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Google Spreadsheet URL에서 CSV 다운로드 및 파싱
 */
export async function parseGoogleSpreadsheet(url: string): Promise<ParsedFileContent> {
  try {
    // Google Spreadsheet URL을 CSV export URL로 변환
    const csvUrl = googleSheetCsvUrl(url)

    // CSV 다운로드
    const response = await fetch(csvUrl)
    if (!response.ok) {
      throw new Error(`Google Spreadsheet 다운로드 실패: ${response.status}`)
    }

    const csvText = await response.text()

    // CSV 파싱
    return {
      text: csvToText(csvText),
      metadata: {
        fileName: 'Google Spreadsheet',
        fileType: 'google-spreadsheet',
      },
    }
  } catch (error) {
    throw new Error(`Google Spreadsheet 파싱 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 파일 경로 또는 URL로부터 파일 내용 파싱
 */
export async function parseFile(
  filePathOrUrl: string,
  fileName?: string
): Promise<ParsedFileContent> {
  const actualFileName = fileName || filePathOrUrl.split('/').pop() || 'unknown'
  const fileType = getFileType(actualFileName)
  
  // Google Spreadsheet URL인 경우
  if (filePathOrUrl.includes('docs.google.com/spreadsheets')) {
    return parseGoogleSpreadsheet(filePathOrUrl)
  }
  
  // 로컬 파일인 경우
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return parsePDF(filePathOrUrl, actualFileName)
    
    case 'xlsx':
    case 'xls':
      return parseExcel(filePathOrUrl, actualFileName)
    
    case 'csv':
      return parseCSV(filePathOrUrl, actualFileName)
    
    case 'md':
    case 'markdown':
      return parseMarkdown(filePathOrUrl, actualFileName)
    
    case 'txt':
      return parseText(filePathOrUrl, actualFileName)
    
    default:
      // 기본적으로 텍스트 파일로 시도
      try {
        return await parseText(filePathOrUrl, actualFileName)
      } catch {
        throw new Error(`지원하지 않는 파일 형식입니다: ${fileType}`)
      }
  }
}

/**
 * 파일 크기 제한 체크 (10MB)
 */
export function checkFileSize(fileSize: number): boolean {
  const MAX_SIZE = 10 * 1024 * 1024 // 10MB
  return fileSize <= MAX_SIZE
}

/**
 * 지원하는 파일 형식 목록
 */
export const SUPPORTED_FILE_TYPES = [
  'pdf',
  'xlsx',
  'xls',
  'csv',
  'md',
  'markdown',
  'txt',
] as const

export const SUPPORTED_FILE_EXTENSIONS = SUPPORTED_FILE_TYPES.map(ext => `.${ext}`).join(',')

