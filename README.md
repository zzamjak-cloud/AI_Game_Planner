# AI Game Planner

AI 기반 모바일 게임 기획서 작성 및 게임 분석 데스크톱 애플리케이션 (v1.0.0)

로그인 없이 누구나 사용할 수 있습니다. 설정에서 본인의 [OpenRouter](https://openrouter.ai/) API Key만 입력하면 바로 동작합니다.

OpenRouter를 통한 Gemini AI와의 대화를 통해 개발자가 즉시 착수할 수 있는 수준의 게임 기획서를 생성하고, 기존 게임에 대한 심층 분석 보고서를 자동으로 작성합니다.

---

## 핵심 기능

### 1. AI 게임 기획서 작성 (Planning)
- AI와 대화하며 **하이퍼 캐주얼 / 하이브리드 캐주얼** 장르의 게임 기획서를 단계적으로 작성
- 실시간 마크다운 프리뷰로 기획서 내용 즉시 확인
- 커스텀 프롬프트 템플릿 지원으로 기획서 양식 자유 편집

### 2. 게임 분석 보고서 (Analysis)
- 게임명 입력만으로 Google Search 기반 최신 정보 수집 및 체계적 분석
- 시장 현황, 수익 모델, 핵심 메커니즘 등을 포함한 종합 분석 보고서 자동 생성

### 3. 딸깍 — 게임 코어 아이디어 생성 (Idea)
- 버튼 한 번에 게임 코어 로직을 **3줄 요약**으로 랜덤 생성
- 히트 게임·밈·쇼츠 트렌드 등 영감 소재와 심리 트리거, 비틀기 방식을 매 클릭 랜덤 조합해 다양성 확보
- 즐겨찾기·히스토리·마크다운 복사 지원

### 4. Notion 연동
- 작성된 기획서/분석 보고서를 Notion 데이터베이스로 원클릭 내보내기
- 기획용/분석용 Notion DB 별도 설정 가능

### 5. 문서 관리
- **버전 관리**: 기획서 작성 시점별 버전 스냅샷 저장 및 이력 조회
- **체크리스트**: 기획서 완성도 검증을 위한 체크리스트
- **참조 파일**: 기획 세션별 참고 자료 관리
- **내보내기**: 마크다운 파일 다운로드, 클립보드 복사

### 6. AI 에이전트 연동 (MCP)
- Claude Code·Codex 등 로컬 에이전트가 기획서 작성·게임 분석·딸깍 아이디어·템플릿 등록을 **배치로** 실행하고 결과(마크다운·JSON)를 받아 활용
- 앱이 꺼져 있어도 동작 (앱 설정의 OpenRouter 키·모델 사용), dry run 견적·요청 수 상한·취소 지원
- 설정 → "AI 에이전트 연동 (MCP)" 에서 클라이언트별 등록. 에이전트가 등록한 템플릿·결과는 앱이 자동으로 가져옴
- 상세: [docs/mcp.md](docs/mcp.md)

### 7. 기타
- 자동 업데이트 (Tauri Updater)
- 세션 자동 저장
- 리사이즈 가능한 3컬럼 레이아웃 (사이드바 / 채팅 / 프리뷰)

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **데스크톱 프레임워크** | Tauri v2 (Rust 백엔드) |
| **프론트엔드** | React 19 + TypeScript |
| **빌드 도구** | Vite |
| **스타일링** | TailwindCSS |
| **상태 관리** | Zustand (슬라이스 패턴) |
| **AI** | OpenRouter API (Gemini Flash 모델, 스트리밍) |
| **마크다운** | react-markdown, remark-gfm, rehype-raw |
| **리치 텍스트 에디터** | TipTap |
| **외부 연동** | Notion API |
| **아이콘** | Lucide React |
| **날짜 처리** | date-fns |
| **Tauri 플러그인** | fs, dialog, http, store, updater, opener, deep-link, process |

---

## 프로젝트 구조

```
src/
├── components/       # UI 컴포넌트
│   ├── ChatPanel       # AI 대화 패널
│   ├── MarkdownPreview # 마크다운 미리보기 및 내보내기
│   ├── IdeaPanel       # 딸깍(아이디어 생성) 패널
│   ├── Sidebar/        # 세션 목록 사이드바
│   ├── TemplateEditor/ # 프롬프트 템플릿 편집기
│   └── ...
├── hooks/            # React 커스텀 훅
│   ├── useMessageHandler  # 메시지 처리 (기획/분석 라우팅)
│   ├── useGameAnalysis    # 게임 분석 로직
│   ├── useIdeaGenerator   # 딸깍 아이디어 생성 플로우
│   ├── useAutoSave        # 세션 자동 저장
│   └── ...
├── store/            # Zustand 상태 관리
│   ├── useAppStore.ts     # 메인 스토어 (슬라이스 통합)
│   └── slices/            # session, template, settings, ui, checklist, idea
├── lib/              # 핵심 로직
│   ├── services/          # OpenRouter API, 스토리지, 아이디어 생성
│   ├── constants/         # API, UI 상수
│   ├── utils/             # 유틸리티 함수
│   └── migrations/        # 데이터 마이그레이션
├── types/            # TypeScript 타입 정의
└── assets/           # 정적 리소스
```

---

## 시작하기

### 사전 요구사항
- Node.js
- Rust (Tauri 빌드용)
- [Tauri 개발 환경 설정](https://v2.tauri.app/start/prerequisites/)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (Tauri + Vite)
npm run tauri dev

# 프론트엔드만 실행
npm run dev

# 프로덕션 빌드
npm run tauri build
```

### 필수 설정
- **OpenRouter API Key**: 첫 실행 시 열리는 설정 모달에서 본인의 OpenRouter API 키 입력 (키는 로컬에만 저장됨)
- **Notion 연동** (선택): Notion API 키 및 데이터베이스 ID 설정

---

## 추천 IDE 설정

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## 라이선스

Copyright (C) 2025 zzamjak <zzamjak@gmail.com>.

이 프로젝트는 GNU General Public License v3.0 only 조건으로 배포됩니다. 자세한 내용은 [LICENSE](./LICENSE)를 확인하세요.

소스 코드 또는 파생물을 배포하는 경우 GPL-3.0-only 조건을 따라야 하며, 저작권 및 라이선스 고지를 제거하거나 별도 권리자인 것처럼 표시할 수 없습니다. GPL 조건을 준수하지 않는 폐쇄형/독점 재배포 및 판매는 허용되지 않습니다.
