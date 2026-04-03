# 자산 일괄 등록 (엑셀 업로드) 설계

## 개요

관리자(admin)가 엑셀 파일을 업로드하여 자산을 일괄 등록할 수 있는 기능.
프론트엔드에서 엑셀을 파싱하고 미리보기/검증 후, 확인된 데이터를 백엔드 API로 전송하여 등록한다.

## 요구사항

- 대상 규모: 50건 미만 (소규모 초기 데이터 등록)
- 권한: admin만 사용 가능
- 오류 처리: 미리보기에서 오류를 먼저 보여주고, 수정 후 최종 등록
- 시트별 카테고리 구분 + 행별 세부 카테고리 지정

## 엑셀 템플릿 구조

시트별로 자산 유형을 구분하며, 각 시트에 `category` 컬럼으로 세부 카테고리를 지정한다.

### Sheet1: IT장비

| name* | category* | serial_number | mac_address | manufacturer | model | purchase_date | purchase_cost | warranty_expiry | location | department | assigned_to | notes |
|--------|----------|---------------|-------------|-------------|-------|---------------|---------------|-----------------|----------|------------|-------------|-------|

### Sheet2: 사무용품

| name* | category* | manufacturer | model | purchase_date | purchase_cost | location | department | notes |
|--------|----------|-------------|-------|---------------|---------------|----------|------------|-------|

### Sheet3: 기타

| name* | category* | serial_number | manufacturer | model | purchase_date | purchase_cost | warranty_expiry | location | department | notes |
|--------|----------|--------------|-------------|-------|---------------|---------------|-----------------|----------|------------|-------|

- `*` = 필수 필드
- `department`는 부서명으로 입력 (백엔드에서 ID로 매핑)
- `assigned_to`는 사용자 이름으로 입력 (백엔드에서 user_id로 매핑)

## 프론트엔드 흐름

```
[엑셀 업로드 페이지 - /assets/bulk-upload]
    │
    ├─ 1) 파일 선택 (drag & drop 또는 파일 선택 버튼)
    │
    ├─ 2) 파싱 & 미리보기
    │     ├─ 시트별 탭으로 데이터 테이블 표시
    │     ├─ 오류 행은 빨간색 하이라이트 + 오류 메시지
    │     └─ 상단에 요약: "IT장비 15건, 사무용품 8건, 기타 3건 / 오류 2건"
    │
    ├─ 3) 오류 있으면 → "엑셀 수정 후 다시 업로드" 안내
    │     오류 없으면 → "등록" 버튼 활성화
    │
    └─ 4) 등록 완료 → 결과 요약 표시 + 자산목록 페이지로 이동
```

### UI 구성

- 기존 `AssetList` 페이지에 "일괄 등록" 버튼 추가 (admin만 노출)
- 새 페이지: `AssetBulkUpload.jsx`
- 라우트: `/assets/bulk-upload`

## 백엔드 API

### `POST /api/assets/bulk`

- 권한: admin만
- Content-Type: application/json

**Request Body:**

```json
{
  "assets": [
    {
      "name": "노트북A",
      "category": "노트북",
      "serial_number": "SN-001",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "manufacturer": "Dell",
      "model": "XPS 15",
      "purchase_date": "2024-01-15",
      "purchase_cost": 1500000,
      "warranty_expiry": "2027-01-15",
      "location": "본사 3층",
      "department": "개발팀",
      "assigned_to": "홍길동",
      "notes": "개발용"
    }
  ]
}
```

**Response (성공):**

```json
{
  "success": true,
  "created": 26,
  "results": [
    { "row": 1, "asset_code": "AST-2024-001", "name": "노트북A" }
  ]
}
```

**Response (검증 실패):**

```json
{
  "success": false,
  "errors": [
    { "row": 3, "field": "name", "message": "필수 필드 누락" },
    { "row": 7, "field": "serial_number", "message": "중복된 시리얼넘버" }
  ]
}
```

### 처리 로직

- `department`명 → department_id 매핑
- `assigned_to`명 → user_id 매핑
- `category`명 → category_id 매핑
- 전체 트랜잭션 — 2차 검증 오류 시 전체 롤백
- 각 자산에 대해 `asset_code` 자동 생성 (기존 AST-YYYY-NNN 로직 재사용)
- 각 자산에 대해 `asset_logs` 기록

## 검증 규칙

### 프론트엔드 1차 검증 (즉시)

- `name` 필수 체크
- `category` 필수 체크 + 유효한 카테고리명인지 (API에서 카테고리 목록 조회 후 비교)
- `purchase_date`, `warranty_expiry` 날짜 형식 검증
- `purchase_cost` 숫자 여부
- `mac_address` 형식 검증 (AA:BB:CC:DD:EE:FF)
- 엑셀 내 `serial_number` 중복 체크

### 백엔드 2차 검증 (DB 필요)

- `serial_number` DB 기존 데이터와 중복 체크
- `department` 이름 → 존재하는 부서인지 확인
- `assigned_to` → 존재하는 사용자인지 확인
- `category` → 존재하는 카테고리인지 확인

### 오류 발생 시

- 2차 검증 실패 → 오류 목록 반환, 전체 롤백
- 프론트엔드에서 오류 행을 표시하여 사용자가 엑셀 수정 후 재업로드

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 엑셀 파싱 | `xlsx` (SheetJS) |
| 프론트엔드 UI | 기존 Tailwind CSS |
| 백엔드 API | 기존 Express + MySQL 트랜잭션 |

### 추가 패키지

- 프론트엔드: `xlsx`
- 백엔드: 없음 (JSON만 수신)

## 변경/추가 파일

| 파일 | 작업 |
|------|------|
| `frontend/src/pages/AssetBulkUpload.jsx` | 신규 — 업로드, 파싱, 미리보기, 검증, 등록 |
| `frontend/src/App.jsx` (또는 라우터) | 라우트 추가 |
| `frontend/src/pages/AssetList.jsx` | "일괄 등록" 버튼 추가 (admin만) |
| `backend/routes/assets.js` | `POST /bulk` 엔드포인트 추가 |
