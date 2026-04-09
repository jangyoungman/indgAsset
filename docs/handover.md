# 자산관리 시스템 (indgAsset) 인수인계 문서

## 1. 시스템 개요

사내 자산(IT장비, 사무용품 등)의 등록/조회/대여/반납/폐기를 관리하는 웹 시스템.

- **URL**: https://asset.indg.co.kr
- **기술 스택**: React 18 + Tailwind CSS 3 / Node.js + Express / MySQL (MariaDB)
- **저장소**: ssh://gitlab.indg.co.kr:2222/indg/indgAsset.git (dev/main 브랜치)

---

## 2. 아키텍처

```
사용자 브라우저
  ↓ HTTPS
Nginx (asset.indg.co.kr)
  ├─ /         → React 빌드 정적 파일
  ├─ /api      → 백엔드 (Express, 포트 4000)
  └─ 내부
       └─ Auth 서버 (포트 8090) ← 백엔드가 프록시
```

### 서버 구성

| 구성 요소 | 포트 | PM2 서비스명 | DB |
|-----------|------|-------------|-----|
| 백엔드 (Express) | 4000 | indg-backend | asset_management |
| Auth 서버 | 8090 | auth-server | user_management |
| 프론트엔드 | - | - (Nginx 정적 서빙) | - |

**핵심 포인트:**
- 인증/사용자 관리는 **Auth 서버(별도 프로젝트)**가 담당하며, 백엔드는 이를 프록시함
- Auth 서버 저장소: ssh://git@gitlab.indg.co.kr:2222/indg/auth-server.git

---

## 3. 접속 정보

### EC2 서버
- **IP**: 3.130.223.104 (Elastic IP)
- **SSH**: `ssh -i aws-key.pem ubuntu@3.130.223.104`
- **SSH 키 위치**: 프로젝트 루트 `aws-key.pem`

### 데이터베이스
- **호스트**: localhost (EC2 내부)
- **계정**: indg
- **DB**: asset_management (자산), user_management (사용자/인증)

### 관리자 계정
- **이메일**: admin@indg.co.kr
- **역할**: admin (전체 권한)

### 환경변수 (.env)

백엔드 `.env` 주요 항목:

| 항목 | 설명 |
|------|------|
| DB_HOST, DB_USER, DB_PASSWORD, DB_NAME | MySQL 접속 |
| AUTH_SERVER_URL | Auth 서버 주소 (http://localhost:8090) |
| JWT_SECRET | JWT 토큰 서명키 |
| ANTHROPIC_API_KEY | Claude AI API 키 (자연어 검색용) |
| MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD | 메일 발송 (mail.indg.co.kr:587) |
| FRONTEND_URL | CORS 허용 도메인 |

---

## 4. 배포 절차

### 프론트엔드

> **EC2에서 `npm run build` 실행 금지** — t2 인스턴스 메모리 부족으로 서버가 먹통됨 (2회 이상 발생)

```bash
# 1. 로컬에서 빌드
cd frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npx react-scripts build

# 2. EC2에 업로드
rsync -avz --delete -e "ssh -i aws-key.pem" build/ ubuntu@3.130.223.104:/home/ubuntu/indgAsset/frontend/build/
```

### 백엔드

```bash
# 변경된 파일을 EC2에 업로드
rsync -avz -e "ssh -i aws-key.pem" backend/routes/파일명.js ubuntu@3.130.223.104:/home/ubuntu/indgAsset/backend/routes/

# EC2에서 재시작
ssh -i aws-key.pem ubuntu@3.130.223.104 "pm2 restart indg-backend"
```

### Auth 서버

```bash
rsync -avz -e "ssh -i aws-key.pem" 파일 ubuntu@3.130.223.104:/home/ubuntu/auth-server/
ssh -i aws-key.pem ubuntu@3.130.223.104 "pm2 restart auth-server"
```

---

## 5. 주요 기능

| 기능 | 설명 |
|------|------|
| AI 자연어 검색 | Claude Haiku API로 검색어 파싱, 실패 시 키워드 폴백 |
| 자산 CRUD | 등록/조회/수정/상태변경, 자산코드 자동생성 (AST-YYYY-NNN) |
| 일괄 등록 | 엑셀 업로드로 대량 자산 등록 |
| 등록 경로 추적 | `created_via` 컬럼으로 웹/MCP 등록 구분 |
| 대여/반납 | 요청→승인/거절→사용중→반납, 3탭 UI |
| 이메일 알림 | 대여 요청→관리자, 승인/거절→요청자 (nodemailer) |
| SSE 실시간 알림 | 서버→클라이언트 실시간 푸시 |
| 공통코드 | 상태/역할/액션 등 DB 기반 코드 관리 |
| 사용자 관리 | 역할/부서/잠금/PW초기화/이메일수신설정 |
| 모바일 반응형 | 전 페이지 카드 뷰 지원 |

---

## 6. 삭제 정책

자산 삭제는 2단계 소프트 삭제:

1. **상태 변경**: available/in_use → `disposed` (폐기 처리)
2. **실제 삭제**: disposed 상태에서만 DB 삭제 가능 (admin 전용)

---

## 7. 외부 서비스

| 서비스 | 용도 | 비고 |
|--------|------|------|
| Anthropic API | 자연어 검색 (Claude Haiku) | 종량제 ~$0.001/건, 법인카드 결제 |
| Let's Encrypt | SSL 인증서 | certbot 자동 갱신 |
| 메일 서버 | 대여 알림 발송 | mail.indg.co.kr:587 |
| Route53 | DNS (asset.indg.co.kr) | A 레코드 → EC2 IP |

---

## 8. MCP 서버 (AI 연동)

Claude Code에서 자산관리 시스템에 직접 접근하는 MCP 서버.
현재 로컬 stdio 방식으로 실행되며, 향후 원격 서버(SSE/HTTP)로 전환 예정.

- 프로젝트: `indgAsset/mcp-server/`
- 상세: `docs/plan.md` 14항 참조

---

## 9. 관련 문서

| 문서 | 경로 | 내용 |
|------|------|------|
| 개발 기록 | `docs/plan.md` | 전체 기능 개발 히스토리 |
| 변경 이력 | `docs/changelog.md` | 날짜별 변경 내역 |
| 배포 가이드 | `docs/DEPLOY.md` | AWS 배포 상세 절차 |
| Auth 서버 분리 | `docs/auth-server-migration.md` | Auth 서버 분리 경위 및 구조 |
| DB 스키마 | `backend/config/schema.sql` | 테이블 정의 + 샘플 데이터 |

---

## 10. 주의사항

1. **EC2에서 React 빌드 절대 금지** — 반드시 로컬 빌드 후 rsync
2. Auth 서버와 백엔드는 **별도 프로젝트/DB** — 사용자 관련 수정 시 Auth 서버 저장소 확인
3. AI 검색 API 키 만료/변경 시 EC2의 `backend/.env` ANTHROPIC_API_KEY 업데이트 필요
4. SSL 인증서 자동 갱신 확인 (certbot timer)
5. `common_codes` 테이블로 상태/역할 코드를 관리하므로, 하드코딩된 상태값 추가 시 DB도 함께 업데이트
