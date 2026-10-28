// 체크리스트 및 검증 슬라이스

import { StateCreator } from 'zustand'
import { ChecklistItem, ChecklistCategory, ChecklistResult, DocumentValidation } from '../../types/checklist'
import { AppState } from '../useAppStore'

export interface ChecklistSlice {
  // 체크리스트 상태
  validateDocument: (sessionId: string) => Promise<DocumentValidation>
  getChecklistItems: (category?: ChecklistCategory) => ChecklistItem[]
  updateChecklistItem: (sessionId: string, itemId: string, checked: boolean) => void
  getValidation: (sessionId: string) => DocumentValidation | undefined
}

// 기본 체크리스트 항목 정의
const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  // 시장 분석
  {
    id: 'market-1',
    category: ChecklistCategory.MARKET_ANALYSIS,
    title: '레퍼런스 게임 분석 포함',
    description: '유사 장르의 성공작 1-2개를 벤치마킹하여 분석했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'market-2',
    category: ChecklistCategory.MARKET_ANALYSIS,
    title: '차별화 포인트 명확히 제시',
    description: '레퍼런스 게임 대비 우리 게임만의 독창적인 무기를 명확히 제시했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'market-3',
    category: ChecklistCategory.MARKET_ANALYSIS,
    title: '시장성 논리적 설명',
    description: '이 기획이 왜 성공할 수 있는지 논리적으로 설명했습니다.',
    required: true,
    checked: false,
  },

  // 게임 디자인
  {
    id: 'design-1',
    category: ChecklistCategory.GAME_DESIGN,
    title: '게임명 제시',
    description: '매력적인 게임명(가제)을 제시했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'design-2',
    category: ChecklistCategory.GAME_DESIGN,
    title: '장르 명확히 정의',
    description: '게임 장르를 명확히 정의했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'design-3',
    category: ChecklistCategory.GAME_DESIGN,
    title: '타겟층 구체화',
    description: '구체적인 연령대 및 성향의 타겟층을 정의했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'design-4',
    category: ChecklistCategory.GAME_DESIGN,
    title: '핵심 가치(USP) 명확',
    description: '이 게임이 주는 단 하나의 확실한 재미 요소를 명확히 제시했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'design-5',
    category: ChecklistCategory.GAME_DESIGN,
    title: '게임 방법 설명',
    description: '초등학생도 이해할 수 있는 조작법 및 승리 조건을 설명했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'design-6',
    category: ChecklistCategory.GAME_DESIGN,
    title: 'Core Loop 정의',
    description: '행동 -> 보상 -> 스탯 성장 -> 더 어려운 도전의 핵심 루프를 정의했습니다.',
    required: true,
    checked: false,
  },

  // 수익화
  {
    id: 'monet-1',
    category: ChecklistCategory.MONETIZATION,
    title: '수익화 모델 제시',
    description: 'IAA, IAP, 하이브리드 중 수익화 모델을 명확히 제시했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'monet-2',
    category: ChecklistCategory.MONETIZATION,
    title: '광고 모델 설계',
    description: '전면 광고 시점, 보상형 광고 리워드를 구체적으로 설계했습니다.',
    required: false,
    checked: false,
  },
  {
    id: 'monet-3',
    category: ChecklistCategory.MONETIZATION,
    title: '인앱 결제 상품 설계',
    description: '초보자 패키지, 광고 제거, 배틀패스 등 구체적인 상품을 설계했습니다.',
    required: false,
    checked: false,
  },

  // 밸런싱
  {
    id: 'balance-1',
    category: ChecklistCategory.BALANCING,
    title: '초기 성장(D1) 설계',
    description: '빠른 성장과 보상으로 몰입을 유도하는 초기 성장 곡선을 설계했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'balance-2',
    category: ChecklistCategory.BALANCING,
    title: '중기 성장(D7) 설계',
    description: '전략적 요소 해금 및 완만한 성장 곡선을 설계했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'balance-3',
    category: ChecklistCategory.BALANCING,
    title: '후기 성장(End Game) 설계',
    description: '경쟁 컨텐츠 및 수집 요소를 포함한 엔드게임을 설계했습니다.',
    required: false,
    checked: false,
  },

  // 리텐션
  {
    id: 'retention-1',
    category: ChecklistCategory.RETENTION,
    title: '프롤로그 설계',
    description: '게임 시작 30초 내에 유저를 사로잡을 스토리/상황을 설계했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'retention-2',
    category: ChecklistCategory.RETENTION,
    title: '리텐션 장치 설계',
    description: '출석부, 일일 미션, 룰렛 등 리텐션 장치를 설계했습니다.',
    required: false,
    checked: false,
  },
  {
    id: 'retention-3',
    category: ChecklistCategory.RETENTION,
    title: '순환 컨텐츠 설계',
    description: '랭킹전, 시즌 던전 등 순환 컨텐츠를 설계했습니다.',
    required: false,
    checked: false,
  },

  // 기술적 요구사항
  {
    id: 'tech-1',
    category: ChecklistCategory.TECHNICAL,
    title: 'UI/UX 와이어프레임',
    description: '메인 화면 배치, HUD 구성을 설명했습니다.',
    required: false,
    checked: false,
  },
  {
    id: 'tech-2',
    category: ChecklistCategory.TECHNICAL,
    title: '데이터 테이블 구조',
    description: '필요한 데이터 컬럼을 예시로 제시했습니다.',
    required: false,
    checked: false,
  },
  {
    id: 'tech-3',
    category: ChecklistCategory.TECHNICAL,
    title: '주요 알고리즘 설명',
    description: '전투 공식, 생성 로직 등을 의사 코드 수준으로 설명했습니다.',
    required: false,
    checked: false,
  },

  // 완성도
  {
    id: 'complete-1',
    category: ChecklistCategory.COMPLETENESS,
    title: '모든 필수 섹션 포함',
    description: '기획서 양식의 모든 필수 섹션을 포함했습니다.',
    required: true,
    checked: false,
  },
  {
    id: 'complete-2',
    category: ChecklistCategory.COMPLETENESS,
    title: '이모지 활용',
    description: '각 주요 섹션 제목에 관련 이모지를 포함했습니다.',
    required: false,
    checked: false,
  },
  {
    id: 'complete-3',
    category: ChecklistCategory.COMPLETENESS,
    title: '구조적 가독성',
    description: '리스트 항목을 Bold로 작성하여 가독성을 높였습니다.',
    required: false,
    checked: false,
  },
]

// 마크다운 내용에서 체크리스트 항목 검증
function validateChecklistItems(
  markdownContent: string,
  items: ChecklistItem[]
): ChecklistItem[] {
  const content = markdownContent.toLowerCase()

  return items.map(item => {
    let checked = false
    let feedback: string | undefined
    let suggestions: string[] = []

    switch (item.id) {
      case 'market-1':
        checked = /레퍼런스|벤치마킹|참고|reference|benchmark/i.test(content)
        if (!checked) {
          feedback = '레퍼런스 게임 분석이 누락되었습니다.'
          suggestions = ['유사 장르의 성공작 1-2개를 선정하여 분석을 추가하세요.']
        }
        break

      case 'market-2':
        checked = /차별화|독창|차이점|다른 점/i.test(content)
        if (!checked) {
          feedback = '차별화 포인트가 명확하지 않습니다.'
          suggestions = ['레퍼런스 게임 대비 우리 게임만의 독창적인 무기를 명확히 제시하세요.']
        }
        break

      case 'market-3':
        checked = /시장|성공|왜|이유|논리/i.test(content)
        if (!checked) {
          feedback = '시장성에 대한 논리적 설명이 부족합니다.'
          suggestions = ['이 기획이 왜 성공할 수 있는지 논리적으로 설명하세요.']
        }
        break

      case 'design-1':
        checked = /게임명|제목|title|name/i.test(content) && content.length > 50
        if (!checked) {
          feedback = '게임명이 제시되지 않았습니다.'
          suggestions = ['매력적인 게임명(가제)을 제시하세요.']
        }
        break

      case 'design-2':
        checked = /장르|genre/i.test(content)
        if (!checked) {
          feedback = '장르가 명확히 정의되지 않았습니다.'
          suggestions = ['게임 장르를 명확히 정의하세요 (예: 방치형 RPG, 하이퍼 캐주얼 액션).']
        }
        break

      case 'design-3':
        checked = /타겟|대상|연령|user|player/i.test(content)
        if (!checked) {
          feedback = '타겟층이 구체화되지 않았습니다.'
          suggestions = ['구체적인 연령대 및 성향의 타겟층을 정의하세요.']
        }
        break

      case 'design-4':
        checked = /핵심|가치|usp|재미|fun/i.test(content)
        if (!checked) {
          feedback = '핵심 가치(USP)가 명확하지 않습니다.'
          suggestions = ['이 게임이 주는 단 하나의 확실한 재미 요소를 명확히 제시하세요.']
        }
        break

      case 'design-5':
        checked = /게임 방법|조작|플레이|방법|how to play/i.test(content)
        if (!checked) {
          feedback = '게임 방법 설명이 부족합니다.'
          suggestions = ['초등학생도 이해할 수 있는 조작법 및 승리 조건을 설명하세요.']
        }
        break

      case 'design-6':
        checked = /core loop|핵심 루프|루프|loop/i.test(content)
        if (!checked) {
          feedback = 'Core Loop가 정의되지 않았습니다.'
          suggestions = ['행동 -> 보상 -> 스탯 성장 -> 더 어려운 도전의 핵심 루프를 정의하세요.']
        }
        break

      case 'monet-1':
        checked = /수익화|모델|iaa|iap|monetization|revenue/i.test(content)
        if (!checked) {
          feedback = '수익화 모델이 제시되지 않았습니다.'
          suggestions = ['IAA, IAP, 하이브리드 중 수익화 모델을 명확히 제시하세요.']
        }
        break

      case 'monet-2':
        checked = /광고|ad|advertisement/i.test(content)
        if (!checked && item.required) {
          feedback = '광고 모델이 설계되지 않았습니다.'
          suggestions = ['전면 광고 시점, 보상형 광고 리워드를 구체적으로 설계하세요.']
        }
        break

      case 'monet-3':
        checked = /인앱|결제|패키지|package|iap/i.test(content)
        if (!checked && item.required) {
          feedback = '인앱 결제 상품이 설계되지 않았습니다.'
          suggestions = ['초보자 패키지, 광고 제거, 배틀패스 등 구체적인 상품을 설계하세요.']
        }
        break

      case 'balance-1':
        checked = /초기|d1|첫날|early|initial/i.test(content)
        if (!checked) {
          feedback = '초기 성장(D1) 설계가 부족합니다.'
          suggestions = ['빠른 성장과 보상으로 몰입을 유도하는 초기 성장 곡선을 설계하세요.']
        }
        break

      case 'balance-2':
        checked = /중기|d7|일주일|mid|week/i.test(content)
        if (!checked) {
          feedback = '중기 성장(D7) 설계가 부족합니다.'
          suggestions = ['전략적 요소 해금 및 완만한 성장 곡선을 설계하세요.']
        }
        break

      case 'balance-3':
        checked = /후기|엔드|end game|endgame/i.test(content)
        if (!checked && item.required) {
          feedback = '후기 성장(End Game) 설계가 부족합니다.'
          suggestions = ['경쟁 컨텐츠 및 수집 요소를 포함한 엔드게임을 설계하세요.']
        }
        break

      case 'retention-1':
        checked = /프롤로그|시작|opening|intro/i.test(content)
        if (!checked) {
          feedback = '프롤로그 설계가 부족합니다.'
          suggestions = ['게임 시작 30초 내에 유저를 사로잡을 스토리/상황을 설계하세요.']
        }
        break

      case 'retention-2':
        checked = /출석|미션|일일|mission|daily/i.test(content)
        if (!checked && item.required) {
          feedback = '리텐션 장치가 설계되지 않았습니다.'
          suggestions = ['출석부, 일일 미션, 룰렛 등 리텐션 장치를 설계하세요.']
        }
        break

      case 'retention-3':
        checked = /순환|랭킹|시즌|ranking|season/i.test(content)
        if (!checked && item.required) {
          feedback = '순환 컨텐츠가 설계되지 않았습니다.'
          suggestions = ['랭킹전, 시즌 던전 등 순환 컨텐츠를 설계하세요.']
        }
        break

      case 'tech-1':
        checked = /와이어프레임|ui|ux|화면|screen|layout/i.test(content)
        if (!checked && item.required) {
          feedback = 'UI/UX 와이어프레임이 설명되지 않았습니다.'
          suggestions = ['메인 화면 배치, HUD 구성을 설명하세요.']
        }
        break

      case 'tech-2':
        checked = /데이터|테이블|구조|table|data/i.test(content)
        if (!checked && item.required) {
          feedback = '데이터 테이블 구조가 제시되지 않았습니다.'
          suggestions = ['필요한 데이터 컬럼을 예시로 제시하세요.']
        }
        break

      case 'tech-3':
        checked = /알고리즘|공식|로직|algorithm|formula/i.test(content)
        if (!checked && item.required) {
          feedback = '주요 알고리즘이 설명되지 않았습니다.'
          suggestions = ['전투 공식, 생성 로직 등을 의사 코드 수준으로 설명하세요.']
        }
        break

      case 'complete-1':
        // 필수 섹션 체크
        const requiredSections = [
          '레퍼런스',
          '게임 개요',
          '게임 루프',
          '경제 구조',
          '밸런싱',
          '수익화',
        ]
        const hasAllSections = requiredSections.every(section =>
          content.includes(section.toLowerCase())
        )
        checked = hasAllSections
        if (!checked) {
          feedback = '일부 필수 섹션이 누락되었습니다.'
          suggestions = ['기획서 양식의 모든 필수 섹션을 포함하세요.']
        }
        break

      case 'complete-2':
        checked = /[🎮🎯📊💰🔄📈💵🎉📝🎬]/i.test(content)
        if (!checked) {
          feedback = '이모지 활용이 부족합니다.'
          suggestions = ['각 주요 섹션 제목에 관련 이모지를 포함하세요.']
        }
        break

      case 'complete-3':
        checked = /\*\*.*?\*\*/i.test(content)
        if (!checked) {
          feedback = '구조적 가독성이 떨어집니다.'
          suggestions = ['리스트 항목을 Bold(**텍스트**)로 작성하여 가독성을 높이세요.']
        }
        break
    }

    return {
      ...item,
      checked,
      feedback: checked ? undefined : feedback,
      suggestions: checked ? [] : suggestions,
    }
  })
}

export const createChecklistSlice: StateCreator<
  AppState,
  [],
  [],
  ChecklistSlice
> = (set, get) => ({
  // 문서 검증
  validateDocument: async (sessionId: string) => {
    const state = get() as AppState
    const session = state.sessions.find(s => s.id === sessionId)

    if (!session || !session.markdownContent) {
      throw new Error('세션이나 기획서 내용을 찾을 수 없습니다.')
    }

    // 체크리스트 항목 검증
    const validatedItems = validateChecklistItems(session.markdownContent, DEFAULT_CHECKLIST_ITEMS)

    // 카테고리별 결과 계산
    const categoryMap = new Map<ChecklistCategory, ChecklistItem[]>()
    validatedItems.forEach(item => {
      const items = categoryMap.get(item.category) || []
      items.push(item)
      categoryMap.set(item.category, items)
    })

    const results: ChecklistResult[] = Array.from(categoryMap.entries()).map(([category, items]) => {
      const totalItems = items.length
      const checkedItems = items.filter(i => i.checked).length
      const requiredItems = items.filter(i => i.required).length
      const checkedRequiredItems = items.filter(i => i.required && i.checked).length
      const score = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

      return {
        category,
        items,
        score,
        totalItems,
        checkedItems,
        requiredItems,
        checkedRequiredItems,
      }
    })

    // 전체 점수 계산
    const totalItems = validatedItems.length
    const checkedItems = validatedItems.filter(i => i.checked).length
    const overallScore = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

    // 필수 항목 중 미완료
    const criticalIssues = validatedItems.filter(
      item => item.required && !item.checked
    )

    // AI 추천 사항 (미완료 항목의 피드백 수집)
    const recommendations = validatedItems
      .filter(item => !item.checked && item.feedback)
      .map(item => item.feedback!)
      .slice(0, 5) // 상위 5개만

    const validation: DocumentValidation = {
      overallScore,
      results,
      criticalIssues,
      recommendations,
      lastValidatedAt: Date.now(),
    }

    // 세션에 검증 결과 저장
    const currentState = get() as AppState
    set({
      ...currentState,
      sessions: currentState.sessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            validation,
          }
        }
        return s
      }),
    })

    return validation
  },

  // 체크리스트 항목 가져오기
  getChecklistItems: (category?: ChecklistCategory) => {
    if (category) {
      return DEFAULT_CHECKLIST_ITEMS.filter(item => item.category === category)
    }
    return DEFAULT_CHECKLIST_ITEMS
  },

  // 체크리스트 항목 업데이트
  updateChecklistItem: (sessionId: string, itemId: string, checked: boolean) => {
    const state = get() as AppState
    const session = state.sessions.find(s => s.id === sessionId)

    if (!session || !session.validation) {
      return
    }

    // 검증 결과 업데이트
    const updatedValidation: DocumentValidation = {
      ...session.validation,
      results: session.validation.results.map(result => ({
        ...result,
        items: result.items.map(item => {
          if (item.id === itemId) {
            return { ...item, checked }
          }
          return item
        }),
      })),
      lastValidatedAt: Date.now(),
    }

    // 전체 점수 재계산
    const allItems = updatedValidation.results.flatMap(r => r.items)
    const totalItems = allItems.length
    const checkedItems = allItems.filter(i => i.checked).length
    updatedValidation.overallScore = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

    const currentState = get() as AppState
    set({
      ...currentState,
      sessions: currentState.sessions.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            validation: updatedValidation,
          }
        }
        return s
      }),
    })
  },

  // 검증 결과 가져오기
  getValidation: (sessionId: string) => {
    const state = get() as AppState
    const session = state.sessions.find(s => s.id === sessionId)
    return session?.validation
  },
})

