# 자산관리 시스템 변경 이력

## 2026-04-02

### 공통코드 시스템 추가

하드코딩된 코드성 데이터(상태, 역할, 액션 등)를 DB `common_codes` 테이블로 관리하도록 변경. 관리자 화면에서 표시명, 순서, 색상, 활성여부 관리 가능.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| backend/config/schema.sql | common_codes 테이블 DDL + 초기 데이터 (5그룹, 20건) |
| backend/routes/codes.js | 신규 — 공통코드 CRUD API (GET/POST/PUT/toggle) |
| backend/app.js | /api/codes 라우트 등록 |
| frontend/src/contexts/CodeContext.jsx | 신규 — 공통코드 전역 Context (getCodeName, getCodeColor, getCodeList) |
| frontend/src/pages/CodeManagement.jsx | 신규 — 공통코드 관리 페이지 (그룹 선택, 코드 테이블, 추가/수정 모달) |
| frontend/src/App.jsx | CodeProvider 래핑, /system/codes 라우트 추가 |
| frontend/src/components/Layout.jsx | 시스템 관리 접이식 메뉴 추가 |
| frontend/src/pages/AssetList.jsx | STATUS_LABELS/COLORS → useCode() 대체 |
| frontend/src/pages/AssetDetail.jsx | STATUS_LABELS/COLORS/ACTION_COLORS → useCode() 대체 |
| frontend/src/pages/Dashboard.jsx | statusMap → useCode() 대체 |
| frontend/src/pages/UserList.jsx | ROLE_LABELS/COLORS → useCode() 대체 |

**공통코드 그룹:** ASSET_STATUS, USER_ROLE, ASSIGN_STATUS, APPROVAL_STATUS, LOG_ACTION

---

### 부서 관리 페이지 추가

시스템 관리 메뉴 하위에 부서 관리 페이지 추가. Auth 서버 API를 프록시하여 부서 조회/추가/수정 가능.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/DepartmentManagement.jsx | 신규 — 부서 CRUD 페이지 |
| frontend/src/App.jsx | /system/departments 라우트 추가 |
| backend/routes/users.js | POST/PUT /departments 프록시 추가 |

---

### 자산 일괄 등록 기능 (엑셀 업로드)

관리자가 엑셀 파일을 업로드하여 자산을 일괄 등록하는 기능. 프론트엔드에서 xlsx 파싱 + 미리보기/검증 후 백엔드로 전송.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetBulkUpload.jsx | 신규 — 엑셀 업로드, 시트별 파싱, 미리보기, 1차 검증, 템플릿 다운로드 |
| frontend/src/App.jsx | /assets/bulk-upload 라우트 추가 (admin only) |
| frontend/src/pages/AssetList.jsx | "일괄 등록" 버튼 추가 (admin only) |
| backend/routes/assets.js | POST /bulk 엔드포인트 — 2차 검증(DB), 트랜잭션 일괄 등록 |
| frontend/package.json | xlsx 패키지 추가 |

**시트 구성:** IT장비, 사무용품, 기타 (시트별 컬럼 구성 상이)
**템플릿:** 한글 헤더 + 예제 데이터 포함, 프론트엔드에서 즉석 생성/다운로드

---

### 자산 일괄 삭제 (폐기) 기능

자산 목록에서 체크박스로 선택 후 일괄 폐기 처리. 전체 선택/해제 지원.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetList.jsx | 체크박스 컬럼, 전체선택, 선택삭제 버튼 (admin only) |
| backend/routes/assets.js | DELETE /bulk 엔드포인트 — 선택된 자산 일괄 disposed 처리 |

---

### 자산 상태 변경 (상세 페이지)

관리자가 자산 상세 페이지에서 상태를 드롭다운으로 즉시 변경 가능. 폐기된 자산도 복원 가능.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetDetail.jsx | 상태 배지 → admin일 때 드롭다운 select로 변경 |

---

### 테이블 정렬 기능

자산 목록, 사용자 관리 페이지에서 컬럼 헤더 클릭 시 오름차순/내림차순 정렬.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetList.jsx | 자산코드, 자산명, 카테고리, 부서, 사용자, 상태 정렬 |
| frontend/src/pages/UserList.jsx | 이름, 이메일, 역할, 부서, 상태 정렬 |

---

### MAC Address 필드 추가

자산 항목에 MAC Address 필드를 추가하였습니다.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| backend/config/schema.sql | assets 테이블에 `mac_address VARCHAR(50)` 컬럼 추가 |
| backend/routes/assets.js | 등록/수정 시 mac_address 필드 처리 추가 |
| frontend/src/pages/AssetForm.jsx | 입력 폼에 MAC Address 필드 추가 (시리얼 번호 옆) |
| frontend/src/pages/AssetDetail.jsx | 상세 화면에 MAC Address 표시 추가 |
| EC2 DB | ALTER TABLE assets ADD COLUMN mac_address 실행 완료 |

**입력 형식:** `AA:BB:CC:DD:EE:FF`

---

### Auth 서버 분리 및 users 테이블 JOIN 제거

인증/사용자 관리를 독립 Auth 서버(포트 8090)로 분리하고, asset_management DB에서 users/departments 테이블을 완전히 제거하였습니다.

- 상세 내용: [auth-server-migration.md](auth-server-migration.md)
- 아키텍처 문서: /home/neon/project/auth-server/docs/architecture.pdf

---

### 로그 관리 구성

- Auth 서버에 morgan(combined) 요청 로그 추가
- pm2-logrotate 설치 (10MB/파일, 7일 보관, gz 압축)

---

### admin 계정 이메일 변경

- `admin@company.com` → `admin@indg.co.kr` 변경
- DB 및 전체 문서 반영 완료

---

### admin 계정 비밀번호 재설정

- user_management DB의 admin 비밀번호 재설정 처리
- 상세 내용: [admin-password-reset.md](admin-password-reset.md)
