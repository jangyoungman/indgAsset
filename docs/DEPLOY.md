# AWS EC2 배포 가이드

## 환경 정보

- **서버**: AWS EC2 (Ubuntu)
- **IP**: (EC2 퍼블릭 IP)
- **DB**: 같은 서버에 MySQL 설치됨
- **구성**: Nginx(정적파일 + 리버스프록시) + PM2(Node.js) + MySQL

---

## 1단계: EC2 접속

```bash
ssh -i your-key.pem ubuntu@{EC2_IP}
```

---

## 2단계: Node.js 설치 (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

설치 확인:

```bash
node -v
npm -v
```

---

## 3단계: PM2, Nginx 설치

```bash
sudo npm install -g pm2
sudo apt-get install -y nginx
```

---

## 4단계: 프로젝트 clone

```bash
cd /home/ubuntu
git clone https://github.com/jangyoungman/indgAsset.git
cd indgAsset
```

---

## 5단계: 백엔드 설정

```bash
cd backend
npm install
cp .env.example .env
```

`.env` 파일 수정:

```
PORT=4000
NODE_ENV=production

DB_HOST=localhost
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=asset_management

JWT_SECRET=your-production-secret-key-here

FRONTEND_URL=http://{EC2_IP}
```

> DB가 같은 서버이므로 `DB_HOST`를 `localhost`로 설정합니다.
> `JWT_SECRET`은 운영 환경에 맞게 변경하세요.

PM2로 백엔드 실행:

```bash
pm2 start app.js --name indg-backend
pm2 save
pm2 startup
```

> `pm2 startup` 실행 후 출력되는 sudo 명령어를 한 번 더 실행해야 서버 재부팅 시 자동 시작됩니다.

---

## 6단계: 프론트엔드 빌드 (로컬에서 수행)

> **경고: EC2 서버에서 직접 빌드하면 메모리 부족으로 서버가 먹통이 됩니다.**
> 반드시 로컬 PC에서 빌드 후 결과물을 업로드하세요.

```bash
# 로컬 PC에서 실행
cd /path/to/indgAsset/frontend
npm install
REACT_APP_API_URL=http://{EC2_IP}/api npm run build

# 빌드 결과물을 EC2에 업로드
rsync -avz --delete -e "ssh -i your-key.pem" \
  build/ ubuntu@{EC2_IP}:/home/ubuntu/indgAsset/frontend/build/
```

---

## 7단계: Nginx 설정

설정 파일 생성:

```bash
sudo nano /etc/nginx/sites-available/indgAsset
```

아래 내용 입력:

```nginx
server {
    listen 80;
    server_name {EC2_IP};

    # 프론트엔드 (React 빌드 파일)
    location / {
        root /home/ubuntu/indgAsset/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 백엔드 API 프록시
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

활성화 및 재시작:

```bash
sudo ln -s /etc/nginx/sites-available/indgAsset /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 8단계: EC2 보안 그룹 확인

AWS 콘솔에서 해당 EC2의 보안 그룹에 아래 인바운드 규칙이 있는지 확인:

| 포트 | 프로토콜 | 소스 | 용도 |
|------|----------|------|------|
| 22 | TCP | 내 IP | SSH 접속 |
| 80 | TCP | 0.0.0.0/0 | HTTP 웹 접속 |
| 443 | TCP | 0.0.0.0/0 | HTTPS (도메인 연결 시) |

---

## 배포 완료 후 접속

브라우저에서 **http://{EC2_IP}** 으로 접속

---

## 도메인 연결 (추후)

### DNS 설정

1. 도메인 구매 (가비아, Route53 등)
2. DNS에서 A 레코드를 `{EC2_IP}`으로 설정

### Nginx 수정

```bash
sudo nano /etc/nginx/sites-available/indgAsset
```

`server_name`을 도메인으로 변경:

```nginx
server_name yourdomain.com;
```

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### SSL 인증서 설치 (HTTPS)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

> 인증서는 자동 갱신됩니다. `sudo certbot renew --dry-run`으로 확인 가능합니다.

### 프론트엔드 재빌드

API URL을 HTTPS 도메인으로 변경하여 **로컬에서** 재빌드:

```bash
# 로컬 PC에서 실행
cd /path/to/indgAsset/frontend
REACT_APP_API_URL=https://yourdomain.com/api npm run build

# EC2에 업로드
rsync -avz --delete -e "ssh -i your-key.pem" \
  build/ ubuntu@{EC2_IP}:/home/ubuntu/indgAsset/frontend/build/
```

### 백엔드 .env 수정

```
FRONTEND_URL=https://yourdomain.com
```

```bash
cd /home/ubuntu/indgAsset/backend
pm2 restart indg-backend
```

---

## 유지보수 명령어

| 명령어 | 설명 |
|--------|------|
| `pm2 status` | 백엔드 실행 상태 확인 |
| `pm2 logs indg-backend` | 백엔드 로그 확인 |
| `pm2 restart indg-backend` | 백엔드 재시작 |
| `sudo systemctl status nginx` | Nginx 상태 확인 |
| `sudo systemctl restart nginx` | Nginx 재시작 |

## 소스 업데이트 배포

```bash
cd /home/ubuntu/indgAsset
git pull

# 백엔드 변경 시
cd backend
npm install
pm2 restart indg-backend
```

### 프론트엔드 변경 시 (로컬에서 빌드 후 업로드)

> **주의: EC2 서버에서 직접 `npm run build` 하지 마세요!**
> React 빌드는 메모리를 많이 사용하여 EC2(t2 계열)에서 실행 시 서버가 먹통이 됩니다.
> 반드시 로컬에서 빌드 후 결과물만 업로드하세요.

```bash
# 1. 로컬 PC에서 빌드
cd /home/neon/project/indgAsset/frontend
npm install
REACT_APP_API_URL=https://asset.indg.co.kr/api npm run build

# 2. 빌드 결과물만 EC2에 업로드
rsync -avz --delete -e "ssh -i /path/to/aws-key.pem" \
  build/ ubuntu@{EC2_IP}:/home/ubuntu/indgAsset/frontend/build/
```
