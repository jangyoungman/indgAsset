# 자산관리 시스템 변경 이력

## 2026-04-10

### 자산 스티커 출력 기능

자산 목록/상세에서 선택한 자산의 스티커를 A4 라벨지(3x7, 21매/장)에 인쇄하는 기능.

**스티커 레이아웃:**
- 상단: 회사명(INNODIGM) + 담당자
- 하단: 바코드(Code 128) + 자산코드
- 크기: 63.5mm x 38.1mm (Avery L7160 호환)

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetLabelPrint.jsx | 신규 — 라벨 출력 페이지 (바코드, A4 레이아웃, 인쇄) |
| frontend/src/App.jsx | /assets/label-print 라우트 추가 (admin 전용) |
| frontend/src/pages/AssetList.jsx | 선택 자산 "스티커 출력" 버튼 추가 (admin) |
| frontend/src/pages/AssetDetail.jsx | 개별 자산 "스티커 출력" 버튼 추가 (admin) |
| frontend/package.json | jsbarcode 패키지 추가 |

**권한:** admin 전용

---

## 2026-04-09

### 자산 등록 경로 추적 (created_via)

자산이 웹 화면에서 등록되었는지, MCP(AI)를 통해 등록되었는지 구분할 수 있도록 `created_via` 컬럼을 추가하였습니다.

**DB 변경:**

```sql
ALTER TABLE assets ADD COLUMN created_via ENUM('web','mcp') DEFAULT 'web' AFTER notes;
```

- 기존 자산은 모두 기본값 `web`으로 설정
- 웹 화면에서 등록 시 `web`, MCP 서버를 통해 등록 시 `mcp` 자동 기록

**자연어 검색 지원:**

AI 자연어 검색에서 등록 경로 필터링을 지원합니다.

| 예시 입력 | 생성되는 조건 |
|-----------|---------------|
| "MCP로 등록한 자산" | created_via = 'mcp' |
| "웹에서 등록한 노트북" | created_via = 'web' AND category_id = ? |

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| backend/config/schema.sql | assets 테이블에 `created_via ENUM('web','mcp')` 컬럼 추가 |
| backend/routes/assets.js | 단건/일괄 등록 시 `created_via = 'web'` 명시, AI 검색 프롬프트에 created_via 필터 추가 |
| mcp-server/tools/create-asset.js | INSERT 시 `created_via = 'mcp'` 설정 |
| EC2 DB | ALTER TABLE 실행 완료 |

---

## 2026-04-06

### 모바일 UI 개선

모바일 환경에서의 사용성을 개선하였습니다.

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/public/index.html | viewport에 `maximum-scale=1, user-scalable=no` 추가 (핀치 줌 방지) |
| frontend/src/components/Layout.jsx | 반응형 breakpoint `md` → `lg`로 변경 (태블릿 대응), 페이지 이동 시 스크롤 위치 리셋 |
| frontend/src/index.css | 수평 스크롤 방지 CSS (`overflow-x: hidden`, `touch-action: pan-y`) |
| frontend/src/pages/AssetList.jsx | 모바일 카드 리스트 UI 추가 (`lg:hidden`), 관리 버튼 모바일 숨김 |

---

### 자연어 자산 검색 (AI 기반 메인 페이지)

메인 페이지를 대시보드에서 **자연어 자산 검색** 페이지로 변경. textarea에 자연어를 입력하면 AI(Claude Haiku)가 검색 조건을 자동 생성하여 자산을 조회합니다.

**아키텍처:**

```
사용자 입력 → 백엔드 POST /api/assets/search
  → Anthropic Claude Haiku API로 자연어 파싱
  → 구조화된 JSON 필터 반환 (카테고리, 상태, 부서, 사용자, 금액, 날짜 등)
  → SQL WHERE 조건 조립 → 결과 반환
  → AI 호출 실패 시 키워드 기반 파싱으로 자동 폴백
```

**지원하는 검색 조건:**

| 유형 | 예시 입력 | 생성되는 조건 |
|------|-----------|---------------|
| 카테고리 | "노트북" | category_id = ? |
| 상태 | "사용중인 장비" | status = 'in_use' |
| 부정 조건 | "폐기 외의 노트북" | category_id = ? AND status != 'disposed' |
| 부서 | "IT팀 장비" | department_id = ? |
| 부서 제외 | "IT팀 빼고" | department_id != ? |
| 사용자 | "홍길동이 쓰는" | assigned_to = ? |
| 금액 범위 | "100만원 이상" | purchase_cost >= 1000000 |
| 날짜 범위 | "올해 구매한" | purchase_date >= '2026-01-01' |
| 보증 만료 | "보증 만료 임박" | warranty_expiry <= ? |
| 텍스트 검색 | "ThinkPad" | name/asset_code/serial_number LIKE '%ThinkPad%' |

**UI 구성:**

- 상단: textarea (여러 줄 입력, Enter 검색 / Shift+Enter 줄바꿈)
- 중단: 탭 형태 도움말
  - **자연어 검색 탭** (기본): 검색 예시 테이블 + AI 폴백 안내 문구
  - **키워드 검색 탭**: 카테고리/상태/부서/사용자 칩 클릭으로 입력
- 하단: 검색 결과 목록 (AssetList와 동일 — PC 테이블 + 모바일 카드, 정렬, 페이지네이션, 상세 링크, 일괄 삭제)
- 검색 실행 시 도움말 탭 숨김, 필터 태그 + 결과 건수 표시
- 부정 조건 필터 태그는 빨간색으로 구분

**키워드 폴백 (AI 실패 시):**

AI API 호출 실패 시 기존 키워드 매칭 방식으로 자동 전환됩니다. 카테고리 → 상태 → 사용자 → 부서 순서로 DB에 있는 이름과 매칭하고, 공백 무시 매칭(예: "사용중" ↔ "사용 중")과 노이즈 단어 제거(조회, 검색, 보여줘 등)를 지원합니다. 단, 부정 조건/금액/날짜 범위는 지원하지 않습니다.

**라우팅 변경:**

| 경로 | 변경 전 | 변경 후 |
|------|---------|---------|
| `/` | Dashboard (admin/manager) | AssetSearch (모든 역할) |
| `/dashboard` | — | Dashboard (admin/manager) |

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetSearch.jsx | 신규 — 자연어 검색 페이지 (textarea, 탭 도움말, 결과 목록) |
| frontend/src/App.jsx | AssetSearch import, `/` → AssetSearch, `/dashboard` → Dashboard |
| frontend/src/components/Layout.jsx | 검색 아이콘 추가, navItems에 자산 검색/대시보드 분리 |
| backend/routes/assets.js | `POST /api/assets/search` 엔드포인트 (AI 파싱 + 키워드 폴백) |
| backend/package.json | `@anthropic-ai/sdk` 패키지 추가 |
| EC2 backend/.env | `ANTHROPIC_API_KEY` 환경변수 추가 |

**외부 서비스:**

| 항목 | 내용 |
|------|------|
| API | Anthropic Claude API (claude-haiku-4-5-20251001) |
| 계정 | Anthropic Console (회사 계정, 법인카드 결제) |
| 요금 | 종량제 ~$0.001/건, Build 플랜 $5/월 |
| API 키 이름 | indg-common-search |

---

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
