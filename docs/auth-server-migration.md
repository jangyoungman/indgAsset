# Auth 서버 전환 작업 내역

## 개요

- **작업일자:** 2026-04-02
- **목적:** indgAsset의 인증/사용자 관리를 독립 Auth 서버로 분리
- **Auth 서버 경로:** /home/neon/project/auth-server (포트 8090)

## 1차 전환: 인증/사용자 관리 API 프록시

### 변경된 파일

#### backend/middleware/auth.js
- Auth 서버가 발급한 JWT 토큰을 자체 검증하도록 변경
- `JWT_SECRET`을 Auth 서버와 동일하게 공유
- 토큰 payload의 `departmentId` → `department_id` 매핑 추가

#### backend/routes/auth.js
- 기존: 직접 DB 쿼리로 로그인/비밀번호 처리
- 변경: Auth 서버(http://localhost:8090)로 프록시 전달
- 영향 API:
  - POST /api/auth/login → Auth 서버 프록시
  - POST /api/auth/logout → Auth 서버 프록시
  - POST /api/auth/refresh → Auth 서버 프록시 (신규)
  - GET  /api/auth/me → Auth 서버 프록시
  - POST /api/auth/find-id → Auth 서버 프록시
  - POST /api/auth/reset-password → Auth 서버 프록시
  - POST /api/auth/change-password → Auth 서버 프록시

#### backend/routes/users.js
- 기존: 직접 DB 쿼리로 사용자 CRUD
- 변경: Auth 서버로 프록시 전달
- 영향 API:
  - GET  /api/users → Auth 서버 프록시
  - POST /api/users → Auth 서버 프록시
  - PUT  /api/users/:id → Auth 서버 프록시
  - PUT  /api/users/:id/unlock → Auth 서버 프록시
  - PUT  /api/users/:id/reset-password → Auth 서버 프록시

#### backend/.env
- `AUTH_SERVER_URL=http://localhost:8090` 추가

## 2차 전환: users 테이블 JOIN 제거

### 변경된 파일

#### backend/routes/assets.js
- `LEFT JOIN users u ON a.assigned_to = u.id` 제거 (자산 목록, 상세 조회)
- `LEFT JOIN users u ON al.user_id = u.id` 제거 (자산 이력 조회)
- `assigned_to_name`, `user_name` 필드 더 이상 반환하지 않음 → ID만 반환
- `/assets/users` 엔드포인트: DB 직접 쿼리 → Auth 서버 프록시로 전환
- `/assets/departments` 엔드포인트: DB 직접 쿼리 → Auth 서버 프록시로 전환

#### backend/routes/assignments.js
- `JOIN users u ON aa.user_id = u.id` 제거 (대여 목록)
- `LEFT JOIN users ap ON aa.approved_by = ap.id` 제거 (대여 목록)
- `SELECT id FROM users WHERE ...` 제거 (부서장/관리자 알림 조회)
- `user_name`, `approver_name` 필드 더 이상 반환하지 않음 → `user_id`, `approved_by` ID만 반환

#### backend/routes/dashboard.js
- `LEFT JOIN users u ON al.user_id = u.id` 제거 (최근 활동 로그)
- `JOIN users u ON aa.user_id = u.id` 제거 (연체 대여 건)
- `LEFT JOIN departments d` 제거 (부서별 자산 수) → `department_id` 기준 그룹핑
- `user_name` 필드 더 이상 반환하지 않음 → `user_id` ID만 반환

#### backend/routes/notifications.js
- 변경 없음 (users 테이블 JOIN 없음, user_id FK만 사용)

### 프론트엔드 대응 필요 사항
- 사용자 이름 표시: Auth 서버 `/api/users` API에서 사용자 목록을 조회하여 ID → 이름 매핑
- 부서 이름 표시: Auth 서버 `/api/departments` API에서 부서 목록을 조회하여 ID → 이름 매핑
- 캐싱 권장: 사용자/부서 목록은 자주 변경되지 않으므로 프론트엔드에서 캐싱

## 아키텍처 (최종)

```
클라이언트 (프론트엔드 :3000)
  │
  ├── 인증/사용자 요청 (/api/auth/*, /api/users/*)
  │     ↓
  │   indgAsset Backend (:4000)
  │     ↓ 프록시
  │   Auth Server (:8090) ←→ user_management DB
  │
  └── 자산관리 요청 (/api/assets/*, /api/assignments/*, ...)
        ↓
      indgAsset Backend (:4000) ←→ asset_management DB
      (JWT 토큰 자체 검증, users 테이블 JOIN 없음)
```

## 운영 시 주의사항

1. **Auth 서버가 먼저 시작되어야 함** — indgAsset의 auth/users API가 Auth 서버에 의존
2. **JWT_SECRET 동기화 필수** — 양쪽 .env의 JWT_SECRET이 반드시 동일해야 함
3. **asset_management DB의 users/departments 테이블** — 현재 FK가 남아 있으므로 당장 삭제 불가. 향후 FK 제거 후 테이블 삭제 가능

## 향후 작업 (선택)

1. asset_management DB 스키마에서 users/departments FK 제거
2. asset_management DB에서 users/departments 테이블 삭제
3. 프론트엔드에서 사용자/부서 이름 매핑 로직 구현

## 서버 시작 순서

```bash
# 1. Auth 서버 시작
cd /home/neon/project/auth-server
npm run dev

# 2. indgAsset 서버 시작
cd /home/neon/project/indgAsset/backend
npm run dev
```
