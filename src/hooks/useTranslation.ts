/**
 * 프롬프트 번역 훅
 * 한국어 ↔ 영어 양방향 번역 지원
 *
 * 실제 API 호출은 openRouterService로 위임한다.
 * 재시도 정책과 모델 선택 로직을 다른 호출 경로와 공유하기 위함이다.
 */

import { translateText } from '../lib/services/openRouterService'

export function useTranslation() {
  /**
   * 프롬프트를 번역한다.
   *
   * @param apiKey OpenRouter API 키
   * @param text 번역할 텍스트
   * @param targetLang 목표 언어 ('ko' 또는 'en')
   * @returns 번역된 텍스트
   */
  const translatePrompt = async (
    apiKey: string,
    text: string,
    targetLang: 'ko' | 'en'
  ): Promise<string> => {
    return translateText(apiKey, text, targetLang)
  }

  return { translatePrompt }
}
