// Gemini API 관련 타입 정의

export interface GeminiPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiGenerationConfig {
  temperature?: number
  maxOutputTokens?: number
  topP?: number
  topK?: number
}

export interface GeminiRequest {
  contents: GeminiContent[]
  generationConfig?: GeminiGenerationConfig
  tools?: Array<{
    google_search?: Record<string, never>
  }>
}

export interface GeminiCandidate {
  content: {
    parts: GeminiPart[]
    role: string
  }
  finishReason?: string
  safetyRatings?: Array<{
    category: string
    probability: string
  }>
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[]
  error?: {
    code: number
    message: string
    status: string
  }
}

export interface GeminiStreamChunk {
  candidates?: GeminiCandidate[]
  error?: {
    code: number
    message: string
    status: string
  }
}

