# 공통코드 시스템 설계

## 개요

하드코딩된 상태값/역할/액션 등의 코드성 데이터를 DB 테이블로 관리하고, 관리자 화면에서 추가/수정/비활성화할 수 있는 공통코드 시스템.

## 요구사항

- 공통코드 테이블로 표시명, 순서, 활성여부를 DB에서 관리
- 기존 ENUM은 유지 (DB 무결성), 공통코드는 표시명 관리 용도
- 관리자 전용 관리 화면 (시스템 설정 > 공통코드 관리)
- 삭제 대신 비활성화 (is_active = false)
- 프론트엔드에서 하드코딩된 LABELS/COLORS를 공통코드 Context로 대체

## 1. DB 테이블

```sql
CREATE TABLE common_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  group_code  VARCHAR(50)  NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  description VARCHAR(200),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_group_code (group_code, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `description` 필드에 CSS 클래스를 저장하여 색상도 DB 관리 (예: `bg-emerald-50 text-emerald-700`)

### 초기 데이터

| group_code | code | name | sort_order | description (CSS) |
|-----------|------|------|------------|-------------------|
| ASSET_STATUS | available | 사용 가능 | 1 | bg-emerald-50 text-emerald-700 |
| ASSET_STATUS | in_use | 사용 중 | 2 | bg-blue-50 text-blue-700 |
| ASSET_STATUS | maintenance | 정비 중 | 3 | bg-amber-50 text-amber-700 |
| ASSET_STATUS | disposed | 폐기 | 4 | bg-gray-100 text-gray-500 |
| USER_ROLE | admin | 관리자 | 1 | bg-red-50 text-red-700 |
| USER_ROLE | manager | 부서장 | 2 | bg-indigo-50 text-indigo-700 |
| USER_ROLE | user | 사용자 | 3 | bg-gray-100 text-gray-600 |
| ASSIGN_STATUS | requested | 요청 | 1 | bg-amber-50 text-amber-700 |
| ASSIGN_STATUS | approved | 승인 | 2 | bg-emerald-50 text-emerald-700 |
| ASSIGN_STATUS | rejected | 반려 | 3 | bg-red-50 text-red-700 |
| ASSIGN_STATUS | checked_out | 대여중 | 4 | bg-blue-50 text-blue-700 |
| ASSIGN_STATUS | returned | 반납 | 5 | bg-gray-100 text-gray-500 |
| APPROVAL_STATUS | pending | 대기 | 1 | bg-amber-50 text-amber-700 |
| APPROVAL_STATUS | approved | 승인 | 2 | bg-emerald-50 text-emerald-700 |
| APPROVAL_STATUS | rejected | 반려 | 3 | bg-red-50 text-red-700 |
| LOG_ACTION | created | 등록 | 1 | bg-emerald-500 |
| LOG_ACTION | updated | 수정 | 2 | bg-blue-500 |
| LOG_ACTION | assigned | 배정 | 3 | bg-indigo-500 |
| LOG_ACTION | returned | 반납 | 4 | bg-amber-500 |
| LOG_ACTION | disposed | 폐기 | 5 | bg-red-500 |

## 2. 백엔드 API

새 라우트 파일: `backend/routes/codes.js`

### 엔드포인트

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | /api/codes | 인증된 사용자 | 전체 공통코드 조회 (그룹별 정리) |
| GET | /api/codes/:groupCode | 인증된 사용자 | 특정 그룹 코드 조회 (활성만) |
| POST | /api/codes | admin | 코드 추가 |
| PUT | /api/codes/:id | admin | 코드 수정 (name, sort_order, description) |
| PUT | /api/codes/:id/toggle | admin | 활성/비활성 토글 |

### GET /api/codes 응답 형식

```json
{
  "ASSET_STATUS": [
    { "id": 1, "code": "available", "name": "사용 가능", "sort_order": 1, "is_active": true, "description": "bg-emerald-50 text-emerald-700" }
  ],
  "USER_ROLE": [...]
}
```

### POST /api/codes 요청

```json
{
  "group_code": "ASSET_STATUS",
  "code": "repair",
  "name": "수리중",
  "sort_order": 5,
  "description": "bg-orange-50 text-orange-700"
}
```

### PUT /api/codes/:id 요청

```json
{
  "name": "수리 중",
  "sort_order": 3,
  "description": "bg-orange-50 text-orange-700"
}
```

`group_code`와 `code`는 수정 불가 (데이터 무결성).

## 3. 프론트엔드

### CodeContext (`frontend/src/contexts/CodeContext.jsx`)

앱 로딩 시 `GET /api/codes` 호출, 전역 제공.

```jsx
// 사용법
const { getCodeName, getCodeColor, getCodeList } = useCode();

getCodeName('ASSET_STATUS', 'available')  // → '사용 가능'
getCodeColor('ASSET_STATUS', 'available') // → 'bg-emerald-50 text-emerald-700'
getCodeList('ASSET_STATUS')               // → [{ code, name, description }, ...] (활성만, sort_order순)
```

### CodeManagement.jsx (`frontend/src/pages/CodeManagement.jsx`)

- 라우트: `/system/codes` (admin만)
- 왼쪽: 그룹 코드 목록 (클릭으로 선택)
- 오른쪽: 선택된 그룹의 코드 테이블 (code, name, 순서, CSS, 활성여부)
- 코드 추가/수정: 모달
- 활성/비활성: 토글 버튼

### Layout.jsx 메뉴 추가

"시스템 설정" 메뉴 그룹 (admin만 표시):
- 공통코드 관리 → `/system/codes`

### 기존 코드 변경

| 파일 | 변경 |
|------|------|
| App.jsx | CodeProvider 래핑, `/system/codes` 라우트 추가 |
| Layout.jsx | "시스템 설정 > 공통코드 관리" 메뉴 추가 |
| AssetList.jsx | STATUS_LABELS/COLORS 하드코딩 → useCode() |
| AssetDetail.jsx | STATUS_LABELS/COLORS/ACTION_COLORS → useCode() |
| Dashboard.jsx | statusMap → useCode() |
| UserList.jsx | ROLE_LABELS/ROLE_COLORS → useCode() |

## 4. 변경/추가 파일 요약

| 파일 | 작업 |
|------|------|
| `backend/config/schema.sql` | common_codes 테이블 + 초기 데이터 추가 |
| `backend/routes/codes.js` | 신규 — 공통코드 CRUD API |
| `backend/app.js` | codes 라우트 등록 |
| `frontend/src/contexts/CodeContext.jsx` | 신규 — 공통코드 전역 Context |
| `frontend/src/pages/CodeManagement.jsx` | 신규 — 공통코드 관리 페이지 |
| `frontend/src/App.jsx` | CodeProvider 래핑, 라우트 추가 |
| `frontend/src/components/Layout.jsx` | 시스템 설정 메뉴 추가 |
| `frontend/src/pages/AssetList.jsx` | useCode() 적용 |
| `frontend/src/pages/AssetDetail.jsx` | useCode() 적용 |
| `frontend/src/pages/Dashboard.jsx` | useCode() 적용 |
| `frontend/src/pages/UserList.jsx` | useCode() 적용 |
