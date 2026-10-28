import React, { useState, useEffect, useMemo } from 'react'
import { X, Smile, Search, ZoomIn, ZoomOut } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { TemplateType, PromptTemplate } from '../types/promptTemplate'
import { saveTemplates } from '../lib/store'
import { validateTemplateName, validateTemplateContent } from '../lib/utils/template'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Mention from '@tiptap/extension-mention'
import TurndownService from 'turndown'
import { marked } from 'marked'
import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import { searchEmojis, EmojiItem, getEmojisByCategory, EMOJI_CATEGORIES } from '../lib/emojiData'

interface TemplateEditorModalProps {
  isOpen: boolean
  onClose: () => void
  templateId?: string // 편집 모드일 경우 템플릿 ID
  sourceTemplateId?: string // 복제 모드일 경우 원본 템플릿 ID
  templateType: TemplateType
  onSave?: () => void
}

// Turndown 서비스 인스턴스 (HTML → Markdown)
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

// 이모지 선택 리스트 컴포넌트
interface EmojiListProps {
  items: EmojiItem[]
  command: (item: EmojiItem) => void
}

interface EmojiListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const EmojiList = React.forwardRef<EmojiListRef, EmojiListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  React.useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command(item)
    }
  }

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
        return true
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length)
        return true
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }

      return false
    },
  }))

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
      {props.items.length > 0 ? (
        props.items.map((item, index) => (
          <button
            key={index}
            onClick={() => selectItem(index)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              index === selectedIndex
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <span className="text-xl">{item.emoji}</span>
            <span className="flex-1">{item.name}</span>
          </button>
        ))
      ) : (
        <div className="px-3 py-2 text-sm text-muted-foreground">이모지를 찾을 수 없습니다</div>
      )}
    </div>
  )
})

EmojiList.displayName = 'EmojiList'

export function TemplateEditorModal({
  isOpen,
  onClose,
  templateId,
  sourceTemplateId,
  templateType,
  onSave
}: TemplateEditorModalProps) {
  const { templates, addTemplate, updateTemplate, getTemplateById } = useAppStore()

  // 폼 상태
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showEmojiPanel, setShowEmojiPanel] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [emojiSearchQuery, setEmojiSearchQuery] = useState<string>('')
  
  // 줌 레벨 상태 (로컬 스토리지에서 불러오기)
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('templateEditorZoom')
    return saved ? parseFloat(saved) : 100
  })
  
  // 줌 레벨 저장
  useEffect(() => {
    localStorage.setItem('templateEditorZoom', zoomLevel.toString())
  }, [zoomLevel])
  
  // 줌 핸들러
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 10, 200)) // 최대 200%
  }
  
  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 10, 50)) // 최소 50%
  }
  
  const handleZoomReset = () => {
    setZoomLevel(100)
  }

  // 모드 결정: 편집 / 복제 / 신규
  const isEditMode = !!templateId
  const isDuplicateMode = !!sourceTemplateId

  // 기본 템플릿 편집 차단
  useEffect(() => {
    if (isOpen && isEditMode && templateId) {
      const template = getTemplateById(templateId)
      if (template?.isDefault) {
        alert('기본 템플릿은 편집할 수 없습니다.\n복제하여 새 템플릿을 만드시거나, 기본 템플릿을 복제하여 사용하세요.')
        onClose()
        return
      }
    }
  }, [isOpen, isEditMode, templateId, getTemplateById, onClose])

  // Tiptap 에디터 설정
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder: '프롬프트 내용을 자유롭게 입력하세요.\n\n입력하신 내용 그대로 AI 프롬프트로 사용됩니다.\n일반 텍스트로 작성하시면 되며, 원하시면 마크다운 문법도 사용 가능합니다.',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          char: ':',
          items: ({ query }: { query: string }) => {
            return searchEmojis(query)
          },
          render: () => {
            let component: ReactRenderer<EmojiListRef, EmojiListProps>
            let popup: TippyInstance[]

            return {
              onStart: (props: any) => {
                const clientRect = props.clientRect || (() => new DOMRect())
                const editor = props.editor
                component = new ReactRenderer(EmojiList, {
                  props: {
                    items: searchEmojis(''),
                    command: (item: EmojiItem) => {
                      // 이모지 선택 시 처리
                      editor.commands.insertContent(item.emoji)
                    },
                  },
                  editor: editor,
                })

                popup = tippy('body', {
                  getReferenceClientRect: clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                })
              },

              onUpdate(props: any) {
                const clientRect = props.clientRect || (() => new DOMRect())
                component.updateProps({
                  items: searchEmojis(''),
                  command: (item: EmojiItem) => {
                    // 이모지 선택 시 처리
                    editor?.commands.insertContent(item.emoji)
                  },
                })

                popup[0].setProps({
                  getReferenceClientRect: clientRect,
                })
              },

              onKeyDown(props: any) {
                if (props.event?.key === 'Escape') {
                  popup[0].hide()
                  return true
                }

                return component.ref?.onKeyDown?.(props) ?? false
              },

              onExit() {
                popup[0].destroy()
                component.destroy()
              },
            }
          },
          command: ({ editor, range, props }: any) => {
            // 이모지를 삽입하고 mention을 삭제
            const emojiItem = props as EmojiItem
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(emojiItem.emoji)
              .run()
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none p-4 overflow-y-auto',
        style: `font-size: ${zoomLevel}%`,
      },
    },
    content: '',
    editable: true,
  })
  
  // 줌 레벨 변경 시 에디터 스타일 업데이트
  useEffect(() => {
    if (editor) {
      const editorElement = editor.view.dom as HTMLElement
      if (editorElement) {
        editorElement.style.fontSize = `${zoomLevel}%`
      }
    }
  }, [zoomLevel, editor])

  // 템플릿 로드
  useEffect(() => {
    if (!isOpen || !editor) return

    if (isEditMode) {
      // 편집 모드: 기존 템플릿 로드
      const template = getTemplateById(templateId)
      if (template) {
        setName(template.name)
        setDescription(template.description || '')
        // 마크다운을 HTML로 변환하여 에디터에 설정
        const html = marked(template.content) as string
        editor.commands.setContent(html)
      }
    } else if (isDuplicateMode) {
      // 복제 모드: 원본 템플릿 내용을 복사하되 이름에 "(사본)" 추가
      const sourceTemplate = getTemplateById(sourceTemplateId)
      if (sourceTemplate) {
        setName(sourceTemplate.name + ' (사본)')
        setDescription(sourceTemplate.description || '')
        // 마크다운을 HTML로 변환하여 에디터에 설정
        const html = marked(sourceTemplate.content) as string
        editor.commands.setContent(html)
      }
    } else {
      // 신규 생성 모드: 초기화
      setName('')
      setDescription('')
      editor.commands.setContent('')
    }
  }, [isOpen, templateId, sourceTemplateId, isEditMode, isDuplicateMode, getTemplateById, editor])

  // 이모지 삽입 핸들러
  const handleInsertEmoji = (emoji: string) => {
    if (editor) {
      editor.chain().focus().insertContent(emoji).run()
      setShowEmojiPanel(false)
      setEmojiSearchQuery('') // 검색어 초기화
    }
  }

  // 표시할 이모지 목록 계산 (메모이제이션)
  const displayEmojis = useMemo(() => {
    if (emojiSearchQuery.trim()) {
      // 검색어가 있으면 검색 결과 반환
      return searchEmojis(emojiSearchQuery, selectedCategory === 'all' ? undefined : selectedCategory)
    } else {
      // 검색어가 없으면 카테고리별 필터링
      return getEmojisByCategory(selectedCategory)
    }
  }, [emojiSearchQuery, selectedCategory])


  // 모든 Hook 호출 후 early return
  if (!isOpen) return null

  // 저장 핸들러
  const handleSave = async () => {
    if (!editor) return

    // 유효성 검사
    const nameValidation = validateTemplateName(name)
    if (!nameValidation.valid) {
      alert(nameValidation.error)
      return
    }

    // 에디터의 HTML을 마크다운으로 변환
    const html = editor.getHTML()
    const markdown = turndownService.turndown(html)

    const contentValidation = validateTemplateContent(markdown)
    if (!contentValidation.valid) {
      alert(contentValidation.error)
      return
    }

    setIsSaving(true)

    try {
      const updateData: Partial<PromptTemplate> = {
        name: name.trim(),
        description: description.trim(),
        content: markdown,
      }

      if (isEditMode) {
        // 편집 모드: 기존 템플릿 업데이트
        updateTemplate(templateId, updateData)
      } else {
        // 신규 생성 또는 복제 모드: 새 템플릿 생성
        if (!updateData.name) {
          alert('템플릿 이름을 입력하세요.')
          setIsSaving(false)
          return
        }
        addTemplate({
          name: updateData.name,
          description: updateData.description || '',
          content: updateData.content || '',
          type: templateType,
          isDefault: false,
        })
      }

      // Store에 저장
      await saveTemplates(templates)

      const message = isEditMode
        ? '템플릿이 수정되었습니다!'
        : isDuplicateMode
        ? '템플릿이 복제되었습니다!'
        : '새 템플릿이 생성되었습니다!'

      alert(message)
      onSave?.()
      onClose()
    } catch (error) {
      console.error('템플릿 저장 실패:', error)
      alert('템플릿 저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-6xl h-[95vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold">
            {isEditMode ? '템플릿 편집' : isDuplicateMode ? '템플릿 복제' : '새 템플릿 만들기'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 필드 - 컴팩트 */}
        <div className="p-4 border-b border-border">
          <div className="flex gap-3 items-end">
            {/* 템플릿 이름 */}
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                템플릿 이름 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 하이퍼캐주얼 특화 템플릿"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                disabled={isSaving}
              />
            </div>

            {/* 설명 */}
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">설명 (선택)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="템플릿 설명"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                disabled={isSaving}
              />
            </div>

          </div>
        </div>

        {/* 텍스트 에디터 - 전체 높이 */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">
              프롬프트 내용 <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              {/* 줌 컨트롤 */}
              <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                <button
                  onClick={handleZoomOut}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  title="축소"
                  disabled={zoomLevel <= 50}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors min-w-[3rem]"
                  title="기본 크기로 리셋"
                >
                  {zoomLevel}%
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  title="확대"
                  disabled={zoomLevel >= 200}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setShowEmojiPanel(!showEmojiPanel)}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                title="이모지 보기"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full border border-border rounded-lg overflow-hidden bg-background relative" style={{ minHeight: 0 }}>
            <div 
              className="h-full overflow-y-auto"
              style={{ 
                minHeight: 0,
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top left',
                width: `${100 / (zoomLevel / 100)}%`,
                height: `${100 / (zoomLevel / 100)}%`
              }}
            >
              <EditorContent
                editor={editor}
                className="h-full"
              />
            </div>

            {/* 이모지 패널 */}
            {showEmojiPanel && (
              <div className="absolute top-0 right-0 w-96 h-full bg-background border-l border-border flex flex-col shadow-lg z-10">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <h3 className="text-sm font-medium">이모지 선택</h3>
                  <button
                    onClick={() => {
                      setShowEmojiPanel(false)
                      setEmojiSearchQuery('')
                    }}
                    className="p-1 hover:bg-accent rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {/* 검색 입력창 */}
                <div className="p-2 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={emojiSearchQuery}
                      onChange={(e) => setEmojiSearchQuery(e.target.value)}
                      placeholder="이모지 검색..."
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
                
                {/* 카테고리 탭 */}
                <div className="flex gap-1 p-2 border-b border-border overflow-x-auto">
                  {EMOJI_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id)
                        setEmojiSearchQuery('') // 카테고리 변경 시 검색어 초기화
                      }}
                      className={`p-2 rounded-lg transition-colors ${
                        selectedCategory === category.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      }`}
                      title={category.name}
                    >
                      <span className="text-lg">{category.icon}</span>
                    </button>
                  ))}
                </div>
                
                {/* 이모지 그리드 */}
                <div className="flex-1 overflow-y-auto p-2">
                  {displayEmojis.length > 0 ? (
                    <div className="grid grid-cols-8 gap-1">
                      {displayEmojis.map((item, index) => (
                        <button
                          key={`${item.emoji}-${index}`}
                          onClick={() => handleInsertEmoji(item.emoji)}
                          className="p-2 text-xl hover:bg-accent rounded transition-colors flex items-center justify-center"
                          title={item.name}
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
                
                <div className="p-2 border-t border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground text-center">
                    또는 에디터에서 <code className="px-1 py-0.5 bg-background rounded">:</code> 입력하여 검색
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="p-4 border-t border-border flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {editor ? turndownService.turndown(editor.getHTML()).length.toLocaleString() : 0} / 50,000 자
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
              disabled={isSaving}
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

