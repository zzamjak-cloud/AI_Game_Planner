// 이모지 피커 컴포넌트

import { useState, useMemo } from 'react'
import { Smile, Search, X } from 'lucide-react'
import { searchEmojis, EmojiItem, getEmojisByCategory, EMOJI_CATEGORIES } from '../../lib/emojiData'

interface EmojiPickerProps {
  onSelect: (emoji: EmojiItem) => void
  onClose: () => void
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const displayEmojis = useMemo(() => {
    if (searchQuery.trim()) {
      return searchEmojis(searchQuery)
    }
    if (selectedCategory) {
      return getEmojisByCategory(selectedCategory)
    }
    return searchEmojis('') // 전체 이모지
  }, [searchQuery, selectedCategory])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Smile className="w-5 h-5" />
            <h3 className="font-semibold">이모지 선택</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 검색 */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="이모지 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
          {EMOJI_CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => {
                setSelectedCategory(selectedCategory === category.id ? null : category.id)
                setSearchQuery('')
              }}
              className={`p-2 rounded hover:bg-muted transition-colors ${
                selectedCategory === category.id ? 'bg-primary text-primary-foreground' : ''
              }`}
              title={category.name}
            >
              <span className="text-xl">{category.icon}</span>
            </button>
          ))}
        </div>

        {/* 이모지 리스트 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-8 gap-2">
            {displayEmojis.map((emoji, index) => (
              <button
                key={`${emoji.name}-${index}`}
                onClick={() => {
                  onSelect(emoji)
                  onClose()
                }}
                className="p-2 hover:bg-muted rounded text-2xl transition-colors"
                title={emoji.name}
              >
                {emoji.emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

