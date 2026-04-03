# 자산관리 시스템 (indgAsset) 개발 기록

## 프로젝트 개요

- **프로젝트명**: indgAsset - 자산관리 시스템
- **기술 스택**: React 18 + Tailwind CSS 3 (프론트엔드) / Node.js + Express (백엔드) / MySQL (데이터베이스)
- **저장소**: https://github.com/jangyoungman/indgAsset

---

## 1. 데이터베이스 구축

### 작업 내용
- `backend/.env.example`의 DB 접속 정보를 기반으로 원격 MySQL 서버({EC2_IP})에 접속
- `backend/config/schema.sql`을 실행하여 `asset_management` 데이터베이스 및 8개 테이블 생성

### 생성된 테이블
| 테이블 | 설명 |
|--------|------|
| departments | 부서 |
| users | 사용자 (admin/manager/user) |
| asset_categories | 자산 카테고리 |
| assets | 자산 |
| asset_assignments | 자산 대여/반납 기록 |
| approval_workflows | 승인 워크플로우 |
| notifications | 알림 |
| asset_logs | 자산 이력 로그 |

### 샘플 데이터
- 부서 4개 (IT팀, 경영지원팀, 개발팀, 마케팅팀)
- 관리자 계정 1개 (admin@company.com)
- 자산 카테고리 6개 (노트북, 모니터, 사무가구, 소프트웨어, 차량, 사무기기)

### 이슈 및 해결
- mysql 클라이언트 미설치 → Node.js의 mysql2 패키지로 스키마 실행
- 관리자 비밀번호가 placeholder → bcrypt로 `admin123` 해시 생성 후 DB 업데이트

---

## 2. 로컬 실행 환경 구성

### 작업 내용
- 프론트엔드 누락 파일 생성: `public/index.html`, `src/index.js`
- 백엔드 `.env` 파일 설정 (DB_NAME을 `asset_management`로 변경)
- 프론트엔드 의존성 설치 (`npm install`)

### 실행 방법
- 백엔드: `npm run dev` (포트 4000)
- 프론트엔드: `npm start` (포트 3000)

---

## 3. 프론트엔드 디자인 개선

### 디자인 결정
- **스타일**: SaaS 비즈니스 대시보드 (Notion/Linear/Vercel 느낌)
- **테마**: 다크 사이드바 + 화이트 콘텐츠
- **레이아웃**: 상단 4개 통계 카드 + 하단 최근 활동 테이블
- **컬러**: 인디고(#4f46e5) 포인트, 그레이 배경

### Tailwind CSS 설정
- tailwindcss v3, postcss, autoprefixer 설치
- `tailwind.config.js`, `postcss.config.js` 생성
- `src/index.css`에 Tailwind 디렉티브 추가

### 이슈 및 해결
- Tailwind v4가 자동 설치되어 CRA와 호환 안됨 → v3로 다운그레이드

### 리디자인 완료 파일
| 파일 | 변경 내용 |
|------|-----------|
| `Layout.jsx` | 다크 사이드바(bg-gray-900), SVG 아이콘, 활성 라우트 하이라이팅, 유저 아바타 |
| `Login.jsx` | 깔끔한 카드 스타일, 인디고 포커스링, shadow-xl |
| `Dashboard.jsx` | 화이트 통계 카드, 컬러 악센트 도트, border-l-4 알림 섹션 |
| `AssetList.jsx` | SaaS 테이블, uppercase 헤더, 소프트 컬러 뱃지, 화이트 카드 검색바 |

---

## 4. 자산 등록 기능

### 작업 내용
- `AssetForm.jsx` 페이지 생성 (등록/수정 겸용)
- `App.jsx`에 `/assets/new` 라우트 추가
- 백엔드에 카테고리/부서 목록 API 추가: `GET /api/assets/categories`, `GET /api/assets/departments`

### 자산 코드 자동 생성
- 형식: `AST-YYYY-NNN` (예: AST-2026-001)
- 구매일 기준 연도 사용, 구매일 없으면 오늘 날짜 기준
- 프론트엔드에서 자산 코드 입력 필드 제거

---

## 5. 자산 상세/수정 기능

### 작업 내용
- `AssetDetail.jsx` 페이지 생성 (기본 정보, 설명/비고, 변경 이력)
- `App.jsx`에 `/assets/:id`, `/assets/:id/edit` 라우트 추가
- `AssetForm.jsx`에 수정 모드 추가 (URL에 id가 있으면 기존 데이터 로드)

---

## 6. 검색 기능 수정

### 이슈 및 해결
- **입력할 때마다 API 호출됨**: `searchInput`(입력값)과 `filters.search`(검색 필터)를 분리하여 엔터/검색 버튼 클릭 시에만 API 호출
- **검색 시 서버 오류 발생**: 백엔드 `countQuery` 생성 시 정규식 `SELECT.*FROM`이 greedy하게 매칭 → `SELECT[\s\S]*?FROM` (non-greedy)으로 수정

---

## 7. 사용자 관리 기능

### 작업 내용
- `UserList.jsx` 페이지 생성
- 사용자 목록 테이블 (이름, 이메일, 역할, 부서, 상태)
- 사용자 등록/수정 모달
- 활성/비활성 토글
- `App.jsx`에 `/users` 라우트 추가 (admin 전용)

---

## 8. 자산에 사용자 연결

### 작업 내용
- 백엔드에 사용자 목록 API 추가: `GET /api/assets/users` (role='user'만)
- 자산 등록/수정 폼에 사용자 드롭다운 추가
- 사용자 선택 시 자산 상태 자동 변경: 사용자 있으면 `in_use`, 없으면 `available`
- 자산 수정 API `allowedFields`에 `assigned_to` 추가

---

## 9. 로그인 기능 개선

### 아이디 저장
- 로그인 시 "아이디 저장" 체크박스 추가
- localStorage에 이메일 저장/불러오기

### 아이디 간편 입력
- `@` 없이 아이디만 입력하면 백엔드에서 `email LIKE 'admin@%'`로 자동 매칭
- 프론트엔드 input을 `type="text"`로 변경

### 아이디 찾기
- `POST /api/auth/find-id` API 추가
- 이름 + 연락처로 사용자 조회
- 이메일 마스킹 처리 (예: `ad***@company.com`)
- 연락처 입력 시 숫자만 허용, DB 비교 시 하이픈 제거

### 비밀번호 찾기 (본인 초기화)
- `POST /api/auth/reset-password` API 추가
- 이름 + 연락처 본인 인증 → 새 비밀번호 직접 설정
- 비밀번호 6자 이상 제한, 확인 입력 검증

### 비밀번호 변경 강제
- `POST /api/auth/change-password` API 추가
- users 테이블에 `must_change_password` 컬럼 추가
- 관리자가 비밀번호 초기화 시 `must_change_password = TRUE` 설정
- 해당 사용자 로그인 시 비밀번호 변경 모달 강제 표시

### 관리자 비밀번호 초기화
- `PUT /api/users/:id/reset-password` API 추가
- 임시 비밀번호 자동 생성 (예: reset1234)
- 사용자 관리 화면에 "PW초기화" 버튼 추가
- 임시 비밀번호 모달로 표시

---

## 10. 로그인 보안 강화

### 로그인 실패 잠금
- users 테이블에 `login_fail_count`, `locked_at` 컬럼 추가
- 비밀번호 5회 실패 시 계정 잠금
- 실패 시 남은 횟수 메시지 표시
- 로그인 성공 시 실패 횟수 자동 초기화

### 계정 잠금 해제
- `PUT /api/users/:id/unlock` API 추가
- 사용자 관리 화면에서 잠긴 계정은 "잠김" 뱃지(빨간색) 표시
- "잠금해제" 버튼으로 관리자가 잠금 해제

### 로그인 에러 메시지 유지
- axios 응답 인터셉터에서 `/auth/` 경로 요청은 401 리다이렉트 제외
- 로그인 실패 메시지가 페이지 새로고침으로 사라지는 문제 해결

---

## 11. GitHub 저장소 생성

### 작업 내용
- git 초기화 및 `.gitignore` 생성 (node_modules, .env, build 등 제외)
- 초기 커밋 생성
- GitHub Private 저장소 생성: https://github.com/jangyoungman/indgAsset
- master 브랜치로 push

---

## 스키마 변경 이력

| 변경 | 테이블 | 컬럼 | 설명 |
|------|--------|------|------|
| ALTER | users | login_fail_count (INT DEFAULT 0) | 로그인 실패 횟수 |
| ALTER | users | locked_at (TIMESTAMP NULL) | 계정 잠금 시각 |
| ALTER | users | must_change_password (BOOLEAN DEFAULT FALSE) | 비밀번호 변경 강제 플래그 |

---

## 프로젝트 파일 구조

```
indgAsset/
├── backend/
│   ├── app.js                  # Express 서버 진입점
│   ├── config/
│   │   ├── database.js         # MySQL 연결 풀
│   │   └── schema.sql          # DB 스키마 + 샘플 데이터
│   ├── middleware/
│   │   └── auth.js             # JWT 인증/인가
│   ├── routes/
│   │   ├── auth.js             # 로그인, 아이디/비밀번호 찾기
│   │   ├── users.js            # 사용자 CRUD, 잠금해제, PW초기화
│   │   ├── assets.js           # 자산 CRUD, 카테고리/부서/사용자 목록
│   │   ├── assignments.js      # 대여/반납
│   │   ├── dashboard.js        # 대시보드 통계
│   │   └── notifications.js    # 알림
│   └── .env.example
├── frontend/
│   ├── public/index.html
│   ├── src/
│   │   ├── App.jsx             # 라우팅 설정
│   │   ├── index.js            # 엔트리 포인트
│   │   ├── index.css           # Tailwind CSS
│   │   ├── components/
│   │   │   └── Layout.jsx      # 사이드바 + 헤더 레이아웃
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # 인증 상태 관리
│   │   ├── pages/
│   │   │   ├── Login.jsx       # 로그인 + 아이디/비밀번호 찾기
│   │   │   ├── Dashboard.jsx   # 대시보드
│   │   │   ├── AssetList.jsx   # 자산 목록
│   │   │   ├── AssetDetail.jsx # 자산 상세
│   │   │   ├── AssetForm.jsx   # 자산 등록/수정
│   │   │   └── UserList.jsx    # 사용자 관리
│   │   └── utils/
│   │       └── api.js          # Axios 인스턴스
│   ├── tailwind.config.js
│   └── postcss.config.js
├── docker-compose.yml
├── docs/
│   ├── plan.md                 # 개발 기록 (이 문서)
│   └── DEPLOY.md               # AWS 배포 가이드
└── .gitignore
```

---

## 12. AWS EC2 배포

### 환경
- 기존 EC2 서버 (Ubuntu, {EC2_IP})에 MySQL이 이미 설치되어 있는 상태
- Node.js v20, PM2, Nginx가 설치됨

### 배포 절차
1. GitHub에서 EC2로 소스 clone
2. 백엔드: `npm install` → `.env` 설정 (DB_HOST=localhost) → PM2로 실행
3. 프론트엔드: 로컬에서 빌드 후 `scp`로 EC2에 build 폴더 전송 (EC2에서 npm install 시 메모리 부족으로 서버 다운 발생)
4. Nginx 리버스 프록시 설정: `/` → React 빌드 파일, `/api` → localhost:4000

### 이슈 및 해결
- **EC2에서 npm install 시 서버 다운**: t2.micro 메모리(1GB) 부족 → 로컬에서 빌드 후 결과물만 전송하는 방식으로 변경
- **.ppk 키 파일**: PuTTY용 .ppk 파일만 있어서 Node.js crypto로 .pem 변환 후 scp 사용

---

## 13. 도메인 연결 및 SSL 적용

### 도메인 설정
- 기존 도메인: `www.indg.co.kr` (홈페이지 서비스 중)
- 자산관리 서브도메인: `asset.indg.co.kr`
- AWS Route53에서 A 레코드 추가: `asset` → `{EC2_IP}`

### SSL 인증서
- Let's Encrypt (certbot) 사용
- `sudo certbot --nginx -d asset.indg.co.kr` 으로 자동 설치
- HTTP → HTTPS 자동 리다이렉트 설정
- 인증서 만료일: 2026-06-22 (자동 갱신)

### 추가 설정
- 프론트엔드 재빌드: `REACT_APP_API_URL=https://asset.indg.co.kr/api`
- 백엔드 `.env` CORS 설정: `FRONTEND_URL=https://asset.indg.co.kr`
- PM2 백엔드 재시작

### 최종 접속 주소
- **https://asset.indg.co.kr**
