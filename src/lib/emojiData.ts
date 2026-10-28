// @emoji-mart/data를 사용하여 이모지 데이터 가져오기
// @ts-ignore - JSON 파일 import 타입 문제
import emojiData from '@emoji-mart/data/sets/15/native.json'

// 이모지 카테고리 정의
export interface EmojiCategory {
  id: string
  name: string
  icon: string
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: 'all', name: '전체', icon: '🔍' },
  { id: 'people', name: '사람 & 감정', icon: '😀' },
  { id: 'nature', name: '동물 & 자연', icon: '🐻' },
  { id: 'foods', name: '음식 & 음료', icon: '🍕' },
  { id: 'activity', name: '활동', icon: '⚽' },
  { id: 'places', name: '여행 & 장소', icon: '✈️' },
  { id: 'objects', name: '사물', icon: '💡' },
  { id: 'symbols', name: '기호', icon: '❤️' },
  { id: 'flags', name: '깃발', icon: '🏳️' },
]

// 이모지 아이템
export interface EmojiItem {
  emoji: string
  name: string
  keywords: string[]
  category: string
}

// @emoji-mart/data를 우리 형식으로 변환
function convertEmojiMartData(): EmojiItem[] {
  const emojis: EmojiItem[] = []
  
  // emoji-mart 데이터 구조를 순회하며 변환
  const emojisData = emojiData.emojis as Record<string, {
    id: string
    name: string
    keywords: string[]
    skins: Array<{ unified: string; native: string }>
    version: number
  }>
  
  for (const id in emojisData) {
    const item = emojisData[id]
    
    // 스킨톤이 있는 경우 첫 번째(기본)를 사용
    const skin = item.skins[0]
    if (!skin) continue
    
    // 카테고리 찾기 (categories 배열에서 찾기)
    let category = 'symbols' // 기본값
    for (const cat of emojiData.categories) {
      if (cat.emojis.includes(id)) {
        category = cat.id
        break
      }
    }
    
    emojis.push({
      emoji: skin.native, // 이모지 문자
      name: item.name || id, // 이모지 이름 (검색용)
      keywords: item.keywords || [], // 검색 키워드
      category: category,
    })
  }
  
  return emojis
}

// 이모지 리스트 (한 번만 변환하여 캐시)
let cachedEmojiList: EmojiItem[] | null = null

export function getEmojiList(): EmojiItem[] {
  if (!cachedEmojiList) {
    cachedEmojiList = convertEmojiMartData()
  }
  return cachedEmojiList
}

// 카테고리별 이모지 필터링
export function getEmojisByCategory(categoryId: string): EmojiItem[] {
  const allEmojis = getEmojiList()
  
  if (categoryId === 'all') {
    return allEmojis
  }
  
  return allEmojis.filter(item => item.category === categoryId)
}

// 이모지 검색
export function searchEmojis(query: string, categoryId?: string): EmojiItem[] {
  const emojis = categoryId ? getEmojisByCategory(categoryId) : getEmojiList()
  
  if (!query) {
    return emojis.slice(0, 100) // 기본 100개 표시
  }
  
  const lowerQuery = query.toLowerCase()
  return emojis.filter(item =>
    item.name.toLowerCase().includes(lowerQuery) ||
    item.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery))
  ).slice(0, 100) // 최대 100개까지
}

// 레거시 호환성을 위한 export (기존 코드에서 EMOJI_LIST를 사용하는 경우)
export const EMOJI_LIST = getEmojiList()
