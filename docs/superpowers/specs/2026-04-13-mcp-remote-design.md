# MCP 자산관리 서버 원격 전환 설계

## 목표

MCP 자산관리 서버를 로컬(stdio) 방식에서 EC2 원격(Streamable HTTP) 방식으로 전환하여, Claude Code 사용자가 URL 등록만으로 자산관리 도구를 사용할 수 있게 한다.

## 아키텍처

```
Claude Code → HTTPS → asset.indg.co.kr/mcp
                          ↓
                    Nginx (리버스 프록시)
                          ↓
                    localhost:8080 (MCP 서버)
                          ↓
                    localhost:3306 (MySQL)
```

## 변경 사항

### 1. index.js — 트랜스포트 전환

- StdioServerTransport → StreamableHTTPServerTransport
- Express 서버 추가, 포트 8080
- `/mcp` 엔드포인트에 Streamable HTTP 트랜스포트 연결
- 환경변수: `PORT=8080`, `JWT_SECRET`

### 2. db.js — DB 접속 방식 변경

- SSH 터널(ssh2) 제거
- mysql2로 localhost:3306 직접 연결
- 환경변수: `DB_HOST=localhost`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- ssh2 의존성 제거

### 3. auth.js — JWT 토큰 기반 인증

- 메모리 기반 단일 세션 → JWT 토큰 기반 다중 사용자
- `login()`: bcrypt 검증 후 JWT 발급 (payload: userId, username, role)
- `getCurrentUser(token)`: JWT 검증 후 사용자 정보 반환
- `checkPermission(token, allowedRoles)`: 토큰에서 role 추출 후 권한 체크
- jsonwebtoken 의존성 추가

### 4. login 도구 수정

- 로그인 성공 시 JWT 토큰을 응답에 포함
- 이후 요청에서 토큰을 통해 사용자 식별
- whoami: 토큰으로 현재 사용자 확인
- logout: 클라이언트 측 토큰 폐기 안내

### 5. 각 도구 — 토큰 전달 방식 변경

- 권한이 필요한 도구(create, update, change_status, delete): 입력에 token 필드 추가
- checkPermission 호출 시 token 전달
- 도구 로직 자체는 변경 없음

### 6. Nginx 설정

```nginx
location /mcp {
    proxy_pass http://localhost:8080/mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 86400;
}
```

### 7. PM2 등록

- `pm2 start index.js --name mcp-server`
- ecosystem.config.js에 추가

### 8. package.json 변경

- 추가: express, jsonwebtoken
- 제거: ssh2

## 제외 사항

- 도구 비즈니스 로직(CRUD, 상태변경) 변경 없음
- 권한 규칙(admin/manager/viewer) 변경 없음
- DB 스키마 변경 없음

## 사용 방법 (전환 후)

사용자의 `~/.claude/.mcp.json`에 아래 추가:

```json
{
  "mcpServers": {
    "asset-management": {
      "type": "url",
      "url": "https://asset.indg.co.kr/mcp"
    }
  }
}
```
