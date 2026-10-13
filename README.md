# Blanky

### AI-Powered Personal Workspace

**생각을 적으면, 일상이 정리되는 나만의 공간.**

Blanky는 자연어 기반 일정 관리와 사용자 맞춤형 기록 기능을 결합한 개인화 워크스페이스입니다.

일정과 할 일을 등록하는 과정에서 반복적으로 입력해야 하는 정보를 줄이고, 일기와 독서 기록 등 다양한 데이터를 하나의 공간에서 관리할 수 있도록 설계했습니다.

또한 사용자별로 테마와 화면 구성을 변경할 수 있는 커스터마이징 기능을 제공하여 개인의 생활 방식에 맞는 워크스페이스를 만드는 것을 목표로 합니다.

## 1. Project Information

| 항목 | 내용 |
|---|---|
| Project | Blanky |
| Type | AI 기반 개인화 워크스페이스 |
| Development | 2026.09.29 ~ 2026.11.17 |
| Status | MVP Development |
| Platform | Web (Mobile/Desktop 확장 계획) |
| Frontend | React, TypeScript, Vite |
| Backend | Supabase |
| AI | Rule-based Parser, Gemini API 연동 계획 |

## 2. Background

일정 관리, 할 일, 일기, 독서 기록은 서로 연관되어 있지만 각각 다른 서비스에서 관리되는 경우가 많습니다.

또한 기존 일정 관리 서비스에서는 간단한 약속 하나를 등록하기 위해 제목, 날짜, 시간, 카테고리를 각각 지정해야 하는 불편함이 있습니다.

Blanky는 이 두 가지 문제에 집중합니다.

- 자연어를 활용하여 정보 입력 과정을 단순화합니다.
- 여러 형태의 개인 기록을 하나의 공간에 통합합니다.
- 사용자의 목적에 따라 화면과 기록 형식을 변경할 수 있도록 합니다.

## 3. Core Features

### Natural Language Input

사용자가 일상적인 문장을 입력하면 일정과 할 일을 구분하고 필요한 정보를 구조화합니다.

Example:

Input:
"내일 오후 2시 팀 회의하고 금요일까지 발표자료 완성하기"

Expected Output:

- Event: 팀 회의 / 내일 14:00
- Task: 발표자료 완성 / 금요일 마감

자연어 분석은 규칙 기반 파서를 우선 사용하며, 신뢰도가 낮은 입력에 한해 AI 모델을 사용하는 구조를 목표로 합니다.

현재 실제 Gemini API 분석 기능은 연동 및 검증 단계입니다.

### Schedule & Task Management

- Today 및 Calendar 화면
- 일정과 할 일 관리
- 날짜·시간·마감일 관리
- 카테고리별 분류
- 타임라인 기반 일정 확인
- 변경 이력 관리

### Personal Records

- Diary: 일상 기록
- Reading: 책장 및 독서 기록
- Notes: 메모와 기록
- Custom Records: 사용자가 정의하는 기록 유형

독서 기록장 MVP에는 책장, 책별 기록, 문장, 메모 기능이 포함됩니다. 외부 도서 검색 API와 운영 데이터베이스 연결은 추가 검증이 필요합니다.

### Theme Customization

- 기본 테마 선택
- 사용자 테마 제작
- 실시간 미리보기
- 테마 저장 및 적용
- 사용자 제작 테마 관리

향후 색상 팔레트 편집, 이미지·캐릭터·아이콘 변경, 테마 패키지 설치 및 공유 기능으로 확장할 계획입니다.

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| API | TypeScript 기반 공유 API 모듈 |
| Backend | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Security | Row Level Security |
| AI Processing | Rule-based Parser |
| AI Integration | Gemini API (Planned / Verification) |
| Serverless | Supabase Edge Functions |

별도의 상시 실행 Node.js 백엔드 서버를 두지 않고, 공통 API 계층과 Supabase를 통해 데이터를 관리하는 구조입니다.

## 5. System Architecture

```text
User
 │
 ▼
React Web Application
 │
 ▼
src/services
 │
 ▼
packages/api
 │
 ├── Authentication ── Supabase Auth
 │
 ├── Schedule ──────── PostgreSQL
 │
 ├── Records ───────── PostgreSQL
 │
 ├── Preferences ───── PostgreSQL
 │
 └── AI Processing
      │
      ├── Rule-based Parser
      │
      └── Supabase Edge Function
           │
           └── Gemini API (Integration Planned)
```

### Natural Language Processing Flow

1. 사용자가 자연어를 입력합니다.
2. 규칙 기반 파서가 날짜, 시간, 유형 등을 추출합니다.
3. 분석 신뢰도를 계산합니다.
4. 신뢰도가 낮을 경우 AI 분석을 시도합니다.
5. 분석 결과를 검증하고 구조화합니다.
6. 사용자가 결과를 확인하거나 수정합니다.
7. 확인된 데이터를 Supabase에 저장합니다.

이 구조를 통해 단순한 입력은 규칙 기반으로 빠르게 처리하고, 의미 해석이 필요한 경우에만 AI를 사용하도록 설계했습니다.

## 6. Project Structure

현재 확인된 주요 디렉터리 및 구성 요소입니다.

```text
Blanky/
├── src/
│   └── services/
│       └── # UI와 API 연결
│
├── packages/
│   └── api/
│       └── # 인증, 일정, AI, 설정 도메인
│
├── supabase/
│   └── functions/
│       └── parse-schedule/
│
└── README.md
```

실제 저장소의 전체 디렉터리 구조와 파일 이름은 배포 전 코드 기준으로 업데이트합니다.

## 7. Development Status

### Implemented / MVP

- React + TypeScript 기반 웹 프로젝트
- Supabase API 연동 구조
- 규칙 기반 자연어 파서
- 일정 및 기록용 데이터 모델
- 독서 기록장 MVP
- 테마 제작·저장·미리보기 MVP
- 테마 스토어 및 사용자 테마 관련 MVP

### In Progress / Verification

- Gemini API 실제 분석 기능
- 자연어 입력부터 일정 저장까지 통합 검증
- 독서 검색 API 및 운영 환경 연결 검증
- 테마 편집 UI 개선
- 사용자 정의 기록 기능 고도화

### Planned

- 공유 캘린더
- Google Calendar 연동
- 사용자 제작 이미지 테마 패키지
- 레이아웃 커스터마이징
- 사용자 제작 테마 공유·마켓
- 모바일 및 데스크톱 버전

## 8. Getting Started

### Requirements

- Node.js
- npm
- Supabase Project

### Installation

```bash
git clone <PUBLIC_REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
npm install
```

### Environment Variables

프로젝트의 실제 `.env.example`을 기준으로 필요한 환경 변수를 설정합니다.

Supabase 연결에는 Project URL과 공개용 클라이언트 키가 필요하며, Gemini API 키 등 서버 측 비밀값은 클라이언트 환경 변수나 GitHub 저장소에 노출하지 않아야 합니다.

### Run

```bash
npm run dev
```

루트 프로젝트의 실제 실행 스크립트는 `package.json`을 기준으로 확인합니다.

### Supabase Setup

데이터베이스 마이그레이션, RLS 정책, Edge Function 배포를 완료해야 모든 기능을 사용할 수 있습니다.

개발용 실행 환경과 운영 환경 설정을 분리하여 관리합니다.

## 9. Development Roadmap

| Phase | Description | Period |
|---|---|---|
| 1 | 기획 및 개발 환경 구축 | 09.29 ~ 10.04 |
| 2 | 일정·기록·테마 MVP | 10.05 ~ 10.11 |
| 3 | AI 연동 및 핵심 UX 개선 | 10.12 ~ 10.25 |
| 4 | 개인화·외부 연동 확장 | 10.26 ~ 11.08 |
| 5 | 통합 QA 및 최종 발표 준비 | 11.09 ~ 11.17 |

## 10. Future Plans

Blanky는 일정 관리 기능에서 시작해 사용자가 직접 기록 형식과 디자인을 선택할 수 있는 개인화 플랫폼으로 확장할 계획입니다.

장기적으로는 사용자 제작 테마, 개인 워크스페이스 템플릿, 외부 서비스 연동을 지원하고, 사용자들이 직접 만든 리소스를 공유할 수 있는 환경을 목표로 합니다.

## 11. Project Links

- GitHub Repository: 공개 저장소 주소 추가 예정
- Project Planning (Notion): 링크 추가 예정
- UI/UX Design: Figma 또는 화면 설계 자료 링크 추가 예정
- Demo: 배포 후 링크 추가 예정

## 12. Project Status Notice

Blanky는 현재 개발 중인 프로젝트입니다.

일부 기능은 MVP로 구현되어 있으며, 외부 API 연동과 운영 환경 검증, 통합 테스트는 완료되지 않았습니다. 실제 사용 가능한 기능 범위는 추후 업데이트될 예정입니다.