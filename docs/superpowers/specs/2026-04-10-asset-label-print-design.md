# 자산 스티커 출력 기능 설계

## 개요

자산관리 시스템에서 자산 스티커를 A4 라벨지에 인쇄하는 기능. 기존 수작업 스티커(엑셀 등)를 시스템에서 직접 출력하도록 대체한다.

## 스티커 레이아웃

C안(2행 분리) 채택.

```
┌──────────────────────────────────┐
│ INNODIGM          담당자: 나현승  │
├──────────────────────────────────┤
│ |||||||||||||||  AST-2026-001    │
└──────────────────────────────────┘
```

- 상단 행: 왼쪽 회사명(INNODIGM, 굵게), 오른쪽 담당자명
- 하단 행: 왼쪽 바코드(Code 128), 오른쪽 자산코드 텍스트
- 크기: 63.5mm x 38.1mm (A4 라벨지 3x7 규격 1칸에 맞춤)

## 용지 규격

- A4 라벨지 3x7 = 21매/장
- 라벨 크기: 63.5mm x 38.1mm
- 상단 여백: 약 15.1mm, 좌우 여백: 약 7.2mm (Avery L7160 호환)

## 바코드

- 형식: Code 128 (영숫자+하이픈 지원, 컴팩트)
- 인코딩 대상: 자산코드 (예: AST-2026-001)
- 라이브러리: JsBarcode (프론트엔드, SVG 렌더링)
- 바코드 하단 텍스트 표시 안 함 (자산코드를 옆에 별도 표시하므로)

## 기능 흐름

### 진입점

1. **자산 목록 (AssetList.jsx)**: 체크박스로 자산 선택 → "스티커 출력" 버튼 (admin 전용) → 선택된 자산 ID를 쿼리 파라미터로 전달
2. **자산 상세 (AssetDetail.jsx)**: "스티커 출력" 버튼 (admin 전용) → 해당 자산 1건

### 출력 페이지 (AssetLabelPrint.jsx)

1. URL: `/assets/label-print?ids=1,2,3`
2. 쿼리 파라미터의 자산 ID로 자산 정보 조회 (GET /api/assets/:id)
3. 각 자산마다 바코드 생성 (JsBarcode)
4. A4 라벨지 레이아웃으로 렌더링 (CSS @media print)
5. 자동으로 `window.print()` 호출 또는 "인쇄" 버튼 제공

### 인쇄 레이아웃 (CSS)

- `@media print`로 화면과 인쇄 스타일 분리
- 인쇄 시: 헤더/사이드바 숨김, 라벨 그리드만 표시
- 라벨 그리드: `display: grid; grid-template-columns: repeat(3, 63.5mm); grid-template-rows: repeat(7, 38.1mm);`
- 페이지 넘김: 21매 초과 시 자동 page-break

### 화면 미리보기

- 인쇄 전 화면에서 라벨 미리보기 표시
- A4 용지 모양의 프레임 안에 라벨 배치
- "인쇄" 버튼, "뒤로가기" 버튼

## 데이터 요구사항

스티커에 표시할 정보 (assets 테이블에서 조회):

| 필드 | 소스 |
|------|------|
| 자산코드 | assets.asset_code |
| 담당자명 | assets.assigned_to → Auth 서버 /api/users에서 이름 조회 |

담당자가 없는 자산은 담당자 영역을 빈칸 또는 "-"으로 표시.

## 변경 파일

| 파일 | 변경 |
|------|------|
| `frontend/src/pages/AssetLabelPrint.jsx` | 신규 — 라벨 출력 페이지 |
| `frontend/src/pages/AssetList.jsx` | 선택된 자산 "스티커 출력" 버튼 추가 |
| `frontend/src/pages/AssetDetail.jsx` | "스티커 출력" 버튼 추가 |
| `frontend/src/App.jsx` | `/assets/label-print` 라우트 추가 |
| `frontend/package.json` | `jsbarcode` 패키지 추가 |

## 외부 의존성

| 패키지 | 용도 | 크기 |
|--------|------|------|
| jsbarcode | 바코드 SVG 생성 | ~50KB |
