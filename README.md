# indgAsset - 자산관리 시스템

INNODIGM 사내 자산(노트북, 모니터, 사무기기 등)의 등록, 조회, 대여/반납, 현황 관리를 위한 웹 애플리케이션입니다.

## 접속 주소

**https://asset.indg.co.kr**

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18, Tailwind CSS 3, React Router v6 |
| 백엔드 | Node.js, Express |
| 데이터베이스 | MySQL |
| 인증 | JWT, Auth 서버 분리 (포트 8090) |
| AI 검색 | Anthropic Claude API (Haiku) |
| 배포 | AWS EC2, Nginx, PM2, Let's Encrypt SSL |

## 주요 기능

- **AI 자연어 자산 검색** -- 자연어로 자산을 검색 (예: "노트북 폐기 외의 목록", "올해 구매한 100만원 이상 장비")
- **자산 CRUD** -- 등록, 조회, 수정, 상태 변경
- **자산 일괄 등록** -- 엑셀 파일 업로드로 대량 등록
- **자산 일괄 폐기** -- 체크박스 선택 후 일괄 폐기 처리
- **사용자 관리** -- 등록, 역할(관리자/매니저/사용자) 설정, 계정 잠금/해제, 비밀번호 초기화
- **시스템 관리** -- 공통코드 관리, 부서 관리
- **대시보드** -- 자산 현황, 카테고리별/부서별 분포, 최근 활동
- **모바일 반응형** -- 모든 페이지에서 모바일 카드 뷰 지원
- **로그인 보안** -- 5회 실패 시 계정 잠금, 비밀번호 변경 강제

## 프로젝트 구조

```
indgAsset/
├── backend/                # Express API 서버 (포트 4000)
│   ├── app.js
│   ├── config/             # DB 연결, 스키마
│   ├── middleware/          # JWT 인증
│   └── routes/             # API 라우트 (auth, users, assets, codes 등)
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # Layout
│   │   ├── contexts/       # AuthContext, CodeContext
│   │   ├── hooks/          # useLookup
│   │   └── pages/          # 페이지 컴포넌트
│   └── tailwind.config.js
├── docs/                   # 문서 (매뉴얼, 변경이력, 배포가이드)
└── docker-compose.yml
```

## 로컬 실행

```bash
# 백엔드
cd backend
cp .env.example .env    # DB 접속 정보 설정
npm install
npm run dev             # http://localhost:4000

# 프론트엔드
cd frontend
npm install
npm start               # http://localhost:3000
```

## 배포

```bash
# 프론트엔드 빌드 (로컬에서 실행, EC2에서 빌드 금지)
cd frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npm run build

# EC2에 업로드
rsync -avz --delete -e "ssh -i aws-key.pem" build/ ubuntu@EC2:/home/ubuntu/indgAsset/frontend/build/

# 백엔드 재시작
ssh -i aws-key.pem ubuntu@EC2 "pm2 restart indg-backend"
```

## 문서

- [사용 매뉴얼](docs/asset_user_manual.html)
- [변경 이력](docs/changelog.md)
- [배포 가이드](docs/DEPLOY.md)
- [서버 운영 관리](docs/management.md)

## 관리자

장영만 (gellotin@indg.co.kr)
