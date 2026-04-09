# 로컬 개발 환경 구축 가이드 (그램 프로 17)

## 1. 기본 도구 설치

### Node.js (v20 LTS)
```bash
# Windows - https://nodejs.org 에서 LTS 다운로드
# 또는 nvm-windows 사용
nvm install 20
nvm use 20
```

### Git
```bash
# Windows - https://git-scm.com 에서 다운로드
# 설치 후 설정
git config --global user.name "장영만"
git config --global user.email "gellotin@indg.co.kr"
```

### Claude Code
```bash
npm install -g @anthropic-ai/claude-code
```

---

## 2. GitLab 저장소 연결

### SSH 키 생성 및 등록
```bash
ssh-keygen -t ed25519 -C "gellotin@indg.co.kr"
# 생성된 공개키 복사
cat ~/.ssh/id_ed25519.pub
```
→ GitLab (gitlab.indg.co.kr) > Settings > SSH Keys에 등록

### 프로젝트 클론
```bash
git clone ssh://git@gitlab.indg.co.kr:2222/indg/indgAsset.git
git clone ssh://git@gitlab.indg.co.kr:2222/indg/auth-server.git
```

---

## 3. 필수 파일 복사

현재 작업 환경에서 아래 파일들을 집 PC로 복사:

| 파일 | 용도 | 위치 |
|------|------|------|
| `aws-key.pem` | EC2 SSH 접속 / 배포 | 프로젝트 루트 |
| `backend/.env` | 백엔드 환경변수 | backend/ |
| `mcp-server/.env` | MCP 서버 환경변수 | mcp-server/ |

> 이 파일들은 `.gitignore`에 포함되어 저장소에 없으므로 수동 복사 필요

---

## 4. 의존성 설치

```bash
cd indgAsset

# 백엔드
cd backend && npm install

# 프론트엔드
cd ../frontend && npm install

# MCP 서버 (선택)
cd ../mcp-server && npm install
```

---

## 5. 로컬 실행

### 프론트엔드만 수정하는 경우 (가장 흔한 케이스)

로컬에서 개발 서버 실행 → EC2 백엔드 API 사용:

```bash
cd frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npm start
```
→ http://localhost:3000 에서 확인

### 백엔드도 로컬에서 실행하는 경우

EC2 DB에 SSH 터널 연결 필요:

```bash
# 터미널 1: SSH 터널
ssh -i aws-key.pem -L 3306:127.0.0.1:3306 ubuntu@3.130.223.104 -N

# 터미널 2: 백엔드 실행
cd backend
# .env에서 DB_HOST=127.0.0.1 확인
npm run dev
```

### Auth 서버도 로컬에서 실행하는 경우

```bash
# .env에서 DB 설정이 SSH 터널을 통하도록 구성
cd auth-server
npm run dev
```

> 보통 프론트엔드 수정은 EC2 API를 직접 사용하면 되므로 터널 불필요

---

## 6. 배포

### 프론트엔드 배포

```bash
# 빌드
cd frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npx react-scripts build

# EC2 업로드
rsync -avz --delete -e "ssh -i aws-key.pem" build/ ubuntu@3.130.223.104:/home/ubuntu/indgAsset/frontend/build/
```

### 백엔드 배포

```bash
# 변경 파일 업로드
rsync -avz -e "ssh -i aws-key.pem" backend/routes/파일명.js ubuntu@3.130.223.104:/home/ubuntu/indgAsset/backend/routes/

# 재시작
ssh -i aws-key.pem ubuntu@3.130.223.104 "pm2 restart indg-backend"
```

---

## 7. MCP 서버 설정 (선택)

Claude Code에서 자산관리 MCP를 사용하려면:

```bash
# ~/.claude/.mcp.json 에 추가
{
  "mcpServers": {
    "asset-management": {
      "command": "node",
      "args": ["<프로젝트경로>/mcp-server/index.js"],
      "cwd": "<프로젝트경로>/mcp-server"
    }
  }
}
```

---

## 8. 일반적인 작업 흐름

```
git pull origin dev          # 최신 코드 받기
코드 수정                      # Claude Code 또는 에디터
로컬에서 확인                   # npm start (프론트) / npm run dev (백엔드)
git add / commit / push       # 저장소 반영
배포 (rsync + pm2 restart)    # EC2에 반영
```

---

## 9. 주의사항

1. **EC2에서 React 빌드 금지** — 반드시 로컬 빌드 후 rsync
2. `.env`, `aws-key.pem`은 절대 커밋하지 않을 것
3. `dev` 브랜치에서 작업, `main`은 안정 버전용
4. WireGuard VPN이 필요할 수 있음 (사내 GitLab 접속 시)
