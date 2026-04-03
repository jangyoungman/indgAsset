# EC2 서버 통합 운영 관리

## 서버 환경

| 항목 | 내용 |
|------|------|
| 서버 | AWS EC2 (Ubuntu) |
| 도메인 관리 | AWS Route53 |
| SSL | Let's Encrypt (certbot, 자동 갱신) |

## 서비스 구성

### 현재 운영 중인 서비스

| 서비스 | 기술 | 포트 | 도메인 | 경로 |
|--------|------|------|--------|------|
| 홈페이지 + 문의 API | Node.js + Express | 5000 | www.indg.co.kr | /home/ubuntu/homepage |
| 자산관리 (API) | Node.js + Express | 4000 | asset.indg.co.kr | /home/ubuntu/indgAsset |
| 자산관리 (프론트) | React 빌드 파일 | - | asset.indg.co.kr | /home/ubuntu/indgAsset/frontend/build |
| DB | MySQL | 3306 | - | localhost |

### 통합 아키텍처

```
                              ┌─ www.indg.co.kr ──→ Node.js (5000) 홈페이지 + 문의 API
클라이언트 → Nginx (80/443) ──┤
                              └─ asset.indg.co.kr ──→ Node.js (4000) + React 정적파일
```

- Nginx가 모든 외부 요청을 수신 (포트 80, 443)
- 도메인별로 적절한 백엔드 서비스로 프록시
- Node.js는 외부 포트를 열지 않고 Nginx 뒤에서만 동작
- SSL 인증서는 Nginx에서 통합 관리

## Nginx 설정

### 자산관리 (asset.indg.co.kr)

```nginx
server {
    listen 443 ssl;
    server_name asset.indg.co.kr;

    ssl_certificate /etc/letsencrypt/live/asset.indg.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/asset.indg.co.kr/privkey.pem;

    # 프론트엔드
    location / {
        root /home/ubuntu/indgAsset/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 백엔드 API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name asset.indg.co.kr;
    return 301 https://$host$request_uri;
}
```

### 홈페이지 (www.indg.co.kr)

```nginx
server {
    listen 443 ssl;
    server_name www.indg.co.kr indg.co.kr;

    ssl_certificate /etc/letsencrypt/live/www.indg.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.indg.co.kr/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name www.indg.co.kr indg.co.kr;
    return 301 https://$host$request_uri;
}
```

## 서비스 관리 명령어

### 자산관리 (Node.js + PM2)

| 명령어 | 설명 |
|--------|------|
| `pm2 status` | 실행 상태 확인 |
| `pm2 logs indg-backend` | 로그 확인 |
| `pm2 restart indg-backend` | 재시작 |
| `pm2 stop indg-backend` | 중지 |

### 홈페이지 (Node.js + PM2)

| 명령어 | 설명 |
|--------|------|
| `pm2 start app.js --name indg-homepage` | 홈페이지 시작 |
| `pm2 logs indg-homepage` | 로그 확인 |
| `pm2 restart indg-homepage` | 재시작 |
| `pm2 stop indg-homepage` | 중지 |
| `curl http://localhost:5000` | 동작 확인 |

### Nginx

| 명령어 | 설명 |
|--------|------|
| `sudo nginx -t` | 설정 검증 |
| `sudo systemctl restart nginx` | 재시작 |
| `sudo systemctl status nginx` | 상태 확인 |
| `sudo certbot renew --dry-run` | SSL 갱신 테스트 |

### MySQL

| 명령어 | 설명 |
|--------|------|
| `sudo systemctl status mysql` | 상태 확인 |
| `sudo systemctl restart mysql` | 재시작 |
| `mysql -u root -p` | 접속 |

## EC2 보안 그룹 (인바운드 규칙)

| 포트 | 프로토콜 | 소스 | 용도 |
|------|----------|------|------|
| 22 | TCP | 내 IP | SSH 접속 |
| 80 | TCP | 0.0.0.0/0 | HTTP (HTTPS로 리다이렉트) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 3306 | TCP | 내 IP 또는 차단 | MySQL (외부 접속 필요 시) |

> 포트 8080, 4000은 Nginx가 내부에서 프록시하므로 외부에 열 필요 없음

## 소스 업데이트 배포

### 자산관리 시스템

```bash
cd /home/ubuntu/indgAsset
git pull

# 백엔드 변경 시
cd backend
npm install
pm2 restart indg-backend

# 프론트엔드 변경 시 (로컬에서 빌드 후 전송)
# 로컬:
cd frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npm run build
scp -i your-key.pem -r build ubuntu@{EC2_IP}:/home/ubuntu/indgAsset/frontend/
```

### 홈페이지

```bash
# Tomcat webapps에 WAR 배포 또는 소스 업데이트 후
sudo /server/apache-tomcat-8.5.64/bin/shutdown.sh
sudo /server/apache-tomcat-8.5.64/bin/startup.sh
```

## 홈페이지 문의 기능 (구현 완료)

### 구성 변경

Tomcat 대신 Node.js(Express)로 통합 구현. 기술 스택을 자산관리 시스템과 동일하게 유지하여 유지보수 편의성 확보, 서버 메모리 절약.

| 항목 | 내용 |
|------|------|
| 프로젝트 | /home/neon/project/homepage (로컬) |
| 기술 | Node.js + Express 4 + MySQL + nodemailer |
| DB | indg_homepage (inquiries 테이블) |
| 포트 | 5000 |

### 구현된 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /api/inquiries | 문의 등록 + 관리자 메일 알림 |
| GET | /api/inquiries | 문의 목록 (상태 필터, 페이지네이션) |
| GET | /api/inquiries/:id | 문의 상세 (자동 읽음 처리) |
| PUT | /api/inquiries/:id | 상태 변경, 관리자 메모 |
| DELETE | /api/inquiries/:id | 문의 삭제 |

### 문의 상태 흐름

`new` → `read` (상세 조회 시 자동) → `replied` (답변 시) → `closed`

### 메일 알림

- 문의 등록 시 ADMIN_EMAIL로 자동 발송 (nodemailer)
- HTML 포맷 (이름, 이메일, 연락처, 회사명, 제목, 내용)
- SMTP 설정 필요 (.env의 MAIL_HOST, MAIL_USER, MAIL_PASSWORD)

### 홈페이지 프론트엔드

- EC2의 /home/ubuntu/webhome 파일을 homepage/public/으로 통합
- Express에서 정적 파일 서빙 (express.static)
- index.html에 문의 폼 섹션 추가 (Contact)
- 네비게이션에 Contact 메뉴 추가
- 문의 등록 시 /api/inquiries로 fetch POST → 성공 메시지 표시

### 프로젝트 구조

```
homepage/
├── app.js                  # Express 서버 (포트 5000)
├── config/
│   ├── database.js         # MySQL 연결
│   ├── schema.sql          # inquiries 테이블
│   └── mailer.js           # 메일 발송
├── routes/
│   └── inquiries.js        # 문의 CRUD API
├── public/                 # 홈페이지 정적 파일
│   ├── index.html
│   ├── style.css
│   ├── assets/
│   └── main/
├── .env.example
└── package.json
```

### 통합 후 아키텍처

```
                              ┌─ www.indg.co.kr ──→ Node.js (5000) 홈페이지 + 문의 API
클라이언트 → Nginx (443) ─────┤
                              └─ asset.indg.co.kr ──→ Node.js (4000) 자산관리
```

> Tomcat은 더 이상 사용하지 않음. Node.js로 통합하여 서버 리소스 절약.

## 서버 재부팅 시 자동 시작 설정

### PM2 (자산관리 + 홈페이지)

```bash
pm2 startup    # 출력되는 sudo 명령어 실행
pm2 save
```

### Nginx, MySQL

```bash
# 기본적으로 자동 시작 설정됨. 확인:
sudo systemctl is-enabled nginx
sudo systemctl is-enabled mysql
```
