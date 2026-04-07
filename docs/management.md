# EC2 서버 통합 운영 관리

## 서버 환경

| 항목 | 내용 |
|------|------|
| 서버 | AWS EC2 t3a.micro (1 vCPU, 1GB RAM) |
| IP | 3.130.223.104 (Elastic IP) |
| 리전 | us-east-2 (Ohio) |
| OS | Ubuntu 20.04 LTS |
| 도메인 관리 | AWS Route53 |
| SSL | Let's Encrypt (certbot, 자동 갱신) |
| EBS | 64GB gp2 |

## 서비스 구성

### 현재 운영 중인 서비스

| 서비스 | 기술 | 포트 | 도메인 | 경로 |
|--------|------|------|--------|------|
| 홈페이지 + 문의 API | Node.js + Express | 5000 | www.indg.co.kr | /home/ubuntu/homepage |
| 자산관리 (API) | Node.js + Express | 4000 | asset.indg.co.kr | /home/ubuntu/indgAsset |
| 자산관리 (프론트) | React 빌드 파일 | - | asset.indg.co.kr | /home/ubuntu/indgAsset/frontend/build |
| Auth 서버 | Node.js + Express | 8090 | - (내부) | /home/ubuntu/auth-server |
| DB | MySQL | 3306 | - | localhost |

### 통합 아키텍처

```
                              ┌─ www.indg.co.kr ──→ Node.js (5000) 홈페이지 + 문의 API
클라이언트 → Nginx (80/443) ──┤
                              └─ asset.indg.co.kr ──→ Node.js (4000) + React 정적파일
                                                      └→ Auth 서버 (8090) 내부 프록시
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
scp -i your-key.pem -r build ubuntu@3.130.223.104:/home/ubuntu/indgAsset/frontend/
```

### 홈페이지

```bash
# 로컬에서 EC2로 소스 전송 후
ssh -i aws-key.pem ubuntu@3.130.223.104
cd /home/ubuntu/homepage
pm2 restart indg-homepage
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

## AWS 비용 최적화 (2026-04-07 시행)

### 변경 전 월 비용 (2026년 3월 청구서 기준)

| 항목 | 월 비용 |
|------|---------|
| Elastic Load Balancing (ALB) | $16.75 |
| VPC Public IPv4 주소 (3개) | $11.17 |
| EC2 t2.micro (온디맨드) | $8.63 |
| EBS 64GB gp2 + 스냅샷 | $6.83 |
| Route 53 | $0.51 |
| Data Transfer | $0.00 |
| **소계 (세전)** | **$43.89** |
| 세금 | $4.40 |
| **총합** | **$48.29** |

### 시행한 조치

#### 1. ALB 삭제 — 절감 $16.75/월

기존에 www.indg.co.kr용으로 ALB를 사용했으나, Nginx가 이미 동일한 역할(리버스 프록시 + SSL)을 수행하고 있어 중복 구조였음.

**작업 내용:**
- Route53 DNS를 ALB에서 EC2 IP(Elastic IP)로 변경
- www.indg.co.kr, indg.co.kr에 Let's Encrypt SSL 인증서 발급
- nginx.conf의 기존 정적파일 서버 블록 비활성화 (sites-enabled/homepage와 충돌)
- ALB(ALBindg), 리스너 2개, 타겟그룹(indgwww) 삭제

**변경 전:**
```
www.indg.co.kr → ALB (SSL) → EC2 → Nginx → Node.js(5000)
```

**변경 후:**
```
www.indg.co.kr → Nginx (SSL, Let's Encrypt) → Node.js(5000)
```

#### 2. Public IPv4 정리 — 절감 ~$7.44/월

ALB 삭제로 ALB에 할당된 퍼블릭 IP가 자동 해제됨. EC2의 Elastic IP 1개만 유지.

#### 3. 인스턴스 타입 변경 — 절감 ~$1.80/월

| | 변경 전 | 변경 후 |
|--|--------|---------|
| 타입 | t2.micro | t3a.micro |
| 비용 | $8.63/월 | ~$6.83/월 |
| CPU | Intel | AMD (동일 스펙, 더 저렴) |

**작업 내용:**
- Elastic IP 할당 (인스턴스 중지 시 IP 변경 방지)
- Route53 DNS 3개 도메인 모두 새 IP로 업데이트
- 인스턴스 중지 → 타입 변경 → 시작
- SSL 인증서 갱신
- PM2 서비스 자동 시작 확인

#### 4. Elastic IP 할당

| | 변경 전 | 변경 후 |
|--|--------|---------|
| IP | 3.142.135.156 (동적) | 3.130.223.104 (Elastic IP, 고정) |

동적 IP는 인스턴스 중지/시작 시 변경되므로, Elastic IP로 고정하여 DNS/SSH 설정 안정화.

### 변경 후 예상 월 비용

| 항목 | 월 비용 |
|------|---------|
| EC2 t3a.micro (온디맨드) | ~$6.83 |
| EBS 64GB gp2 + 스냅샷 | ~$6.83 |
| VPC Public IPv4 (Elastic IP 1개) | ~$3.73 |
| Route 53 | ~$0.51 |
| **소계 (세전)** | **~$17.90** |
| **절감액** | **~$25.99/월 (~$312/년)** |
| **절감률** | **59%** |

### 추가 절감 가능 (미시행)

| 방안 | 절감액 | 비고 |
|------|--------|------|
| EBS 64GB → 20GB 축소 | ~$4.40/월 | 현재 14GB 사용중, 새 볼륨 생성 필요 |
| 1년 예약 인스턴스 (선결제 없음) | ~$2/월 | 1년 이상 운영 확정 시 |
| 1년 예약 인스턴스 (전액 선결제) | ~$3/월 | 연 $50 선결제 필요 |

#### 5. 전체 서브도메인 SSL 전환 (ALB → Let's Encrypt)

ALB 삭제로 인해 기존 ALB 인증서(와일드카드)에 의존하던 서브도메인의 SSL이 끊어짐. 모든 서브도메인을 개별 Let's Encrypt 인증서로 전환 완료.

**작업 내용:**
- Route53에서 CNAME(→www.indg.co.kr) 레코드를 A 레코드(→3.130.223.104)로 변경
- nginx.conf의 서브도메인 서버 블록을 `/etc/nginx/sites-available/`로 분리
- certbot으로 각 도메인 SSL 인증서 발급 + HTTPS 리다이렉트 자동 설정

**SSL 인증서 현황:**

| 도메인 | 용도 | 프록시 대상 | SSL | 만료일 |
|--------|------|-------------|-----|--------|
| www.indg.co.kr | 홈페이지 | localhost:5000 | Let's Encrypt | 2026-07-06 |
| indg.co.kr | 홈페이지 (리다이렉트) | localhost:5000 | Let's Encrypt | 2026-07-06 |
| asset.indg.co.kr | 자산관리 | localhost:4000 | Let's Encrypt | 2026-06-22 |
| gitlab.indg.co.kr | GitLab | 1.231.177.108:8888 | Let's Encrypt | 2026-07-06 |
| license.indg.co.kr | 라이선스 관리 | 1.231.177.108:8090 | Let's Encrypt | 2026-07-06 |
| pms.indg.co.kr | PMS | 1.231.177.108:3000 | Let's Encrypt | 2026-07-06 |
| new.indg.co.kr | 신규 홈페이지 | 정적 파일 (/home/ubuntu/homepage) | Let's Encrypt | 2026-07-06 |

**Nginx 설정 파일 구조 (변경 후):**

```
/etc/nginx/
├── nginx.conf              # 기본 설정 (서브도메인 블록은 비활성화됨)
├── sites-available/
│   ├── homepage             # www.indg.co.kr, indg.co.kr
│   ├── indgAsset            # asset.indg.co.kr
│   ├── gitlab               # gitlab.indg.co.kr
│   ├── license              # license.indg.co.kr
│   ├── pms                  # pms.indg.co.kr
│   └── newindg              # new.indg.co.kr
└── sites-enabled/           # sites-available 심볼릭 링크
```

> 모든 인증서는 certbot 자동 갱신으로 관리됨. `sudo certbot renew --dry-run`으로 갱신 테스트 가능.
