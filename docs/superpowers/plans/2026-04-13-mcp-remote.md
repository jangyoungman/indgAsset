# MCP 자산관리 서버 원격 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MCP 자산관리 서버를 로컬 stdio에서 EC2 원격 Streamable HTTP로 전환

**Architecture:** Express 서버(8080)에 StreamableHTTPServerTransport를 `/mcp` 엔드포인트로 연결. DB는 SSH 터널 제거 후 localhost 직접 접속. 인증은 JWT 토큰 기반으로 다중 사용자 지원.

**Tech Stack:** Express, @modelcontextprotocol/sdk (StreamableHTTPServerTransport), jsonwebtoken, mysql2, bcryptjs

---

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `mcp-server/package.json` | 수정 | express, jsonwebtoken 추가, ssh2 제거 |
| `mcp-server/db.js` | 수정 | SSH 터널 제거, localhost 직접 접속 |
| `mcp-server/auth.js` | 수정 | JWT 토큰 발급/검증, 다중 사용자 지원 |
| `mcp-server/tools/login.js` | 수정 | 로그인 시 JWT 반환, whoami/logout 토큰 기반 |
| `mcp-server/tools/create-asset.js` | 수정 | token 입력 필드 추가, checkPermission(token) |
| `mcp-server/tools/update-asset.js` | 수정 | token 입력 필드 추가, checkPermission(token) |
| `mcp-server/tools/change-status.js` | 수정 | token 입력 필드 추가, checkPermission(token) |
| `mcp-server/tools/delete-asset.js` | 수정 | token 입력 필드 추가, checkPermission(token) |
| `mcp-server/index.js` | 수정 | Express + StreamableHTTPServerTransport |
| `mcp-server/.env` | 수정 | EC2용 환경변수 (SSH 제거, JWT_SECRET 추가) |

---

### Task 1: package.json 의존성 변경

**Files:**
- Modify: `mcp-server/package.json`

- [ ] **Step 1: 의존성 업데이트**

```json
{
  "name": "indg-asset-mcp-server",
  "version": "2.0.0",
  "description": "MCP server for INNODIGM asset management (remote)",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "bcryptjs": "^3.0.3",
    "dotenv": "^16.5.0",
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.14.0",
    "zod": "^3.25.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `cd /home/neon/project/indgAsset/mcp-server && npm install`
Expected: express, jsonwebtoken 설치 완료, ssh2 제거

- [ ] **Step 3: 커밋**

```bash
git add mcp-server/package.json mcp-server/package-lock.json
git commit -m "chore(mcp): update deps - add express, jsonwebtoken, remove ssh2"
```

---

### Task 2: db.js — SSH 터널 제거, 직접 접속

**Files:**
- Modify: `mcp-server/db.js`

- [ ] **Step 1: db.js 전체 교체**

SSH 터널 로직을 모두 제거하고 mysql2로 직접 접속:

```javascript
import mysql from 'mysql2/promise';

let pool = null;

export async function initDB() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  const conn = await pool.getConnection();
  conn.release();
  console.log('DB connected directly');
}

export function getPool() {
  if (!pool) throw new Error('DB not initialized. Call initDB() first.');
  return pool;
}

export async function closeDB() {
  if (pool) { await pool.end(); pool = null; }
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/db.js
git commit -m "refactor(mcp): remove SSH tunnel, use direct MySQL connection"
```

---

### Task 3: auth.js — JWT 토큰 기반 인증

**Files:**
- Modify: `mcp-server/auth.js`

- [ ] **Step 1: auth.js 전체 교체**

메모리 세션을 JWT 토큰 기반으로 변경:

```javascript
import { getPool } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * 로그인: 이메일+비밀번호 검증 후 JWT 토큰 발급
 */
export async function login(email, password) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, email, name, role, password_hash, is_active, locked_at FROM user_management.users WHERE email = ?',
    [email]
  );

  if (rows.length === 0) {
    return { success: false, message: '존재하지 않는 이메일입니다.' };
  }

  const user = rows[0];

  if (!user.is_active) {
    return { success: false, message: '비활성화된 계정입니다.' };
  }

  if (user.locked_at) {
    return { success: false, message: '잠긴 계정입니다. 관리자에게 문의하세요.' };
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return { success: false, message: '비밀번호가 일치하지 않습니다.' };
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { success: true, user: payload, token };
}

/**
 * 토큰에서 사용자 정보 추출
 */
export function getUserFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 권한 체크 (토큰 기반)
 * @param {string} token - JWT 토큰
 * @param {string[]} allowedRoles - 허용 역할 목록
 * @returns {{ content: Array } | { user: object }} 에러 응답 또는 { user }
 */
export function checkPermission(token, allowedRoles) {
  const user = getUserFromToken(token);

  if (!user) {
    return {
      content: [{
        type: 'text',
        text: 'Error: 로그인이 필요합니다. login 도구로 먼저 로그인해주세요.',
      }],
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      content: [{
        type: 'text',
        text: `Error: 권한이 없습니다. 이 작업은 ${allowedRoles.join(', ')} 권한이 필요합니다. (현재: ${user.role})`,
      }],
    };
  }

  return { user };
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/auth.js
git commit -m "refactor(mcp): switch auth from memory session to JWT tokens"
```

---

### Task 4: login.js — JWT 토큰 반환

**Files:**
- Modify: `mcp-server/tools/login.js`

- [ ] **Step 1: login.js 전체 교체**

```javascript
import { z } from 'zod';
import { login, getUserFromToken } from '../auth.js';

export function registerLogin(server) {
  server.registerTool('login', {
    title: 'MCP 로그인',
    description: '자산관리 시스템에 로그인합니다. 로그인 성공 시 JWT 토큰이 발급됩니다. 이후 등록/수정/삭제 작업 시 이 토큰을 token 필드에 전달하세요.',
    inputSchema: z.object({
      email: z.string().describe('사용자 이메일'),
      password: z.string().describe('비밀번호'),
    }),
  }, async (args) => {
    const result = await login(args.email, args.password);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Error: ${result.message}` }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: '로그인 성공. 아래 token을 등록/수정/삭제 작업 시 전달하세요.',
          user: result.user,
          token: result.token,
        }, null, 2),
      }],
    };
  });

  server.registerTool('whoami', {
    title: '현재 로그인 정보',
    description: '토큰으로 현재 로그인된 사용자 정보를 확인합니다.',
    inputSchema: z.object({
      token: z.string().describe('로그인 시 발급받은 JWT 토큰'),
    }),
  }, async (args) => {
    const user = getUserFromToken(args.token);
    if (!user) {
      return {
        content: [{ type: 'text', text: '유효하지 않은 토큰입니다. login 도구로 다시 로그인해주세요.' }],
      };
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ message: '현재 로그인 정보', user: { id: user.id, email: user.email, name: user.name, role: user.role } }, null, 2),
      }],
    };
  });

  server.registerTool('logout', {
    title: 'MCP 로그아웃',
    description: 'JWT 토큰 기반이므로 클라이언트에서 토큰을 폐기하면 됩니다.',
    inputSchema: z.object({}),
  }, async () => {
    return {
      content: [{ type: 'text', text: '로그아웃: 보유한 토큰을 폐기해주세요. (JWT 기반이므로 서버 측 세션 없음)' }],
    };
  });
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/login.js
git commit -m "refactor(mcp): login tool returns JWT token"
```

---

### Task 5: 자산 도구들 — token 필드 추가

**Files:**
- Modify: `mcp-server/tools/create-asset.js`
- Modify: `mcp-server/tools/update-asset.js`
- Modify: `mcp-server/tools/change-status.js`
- Modify: `mcp-server/tools/delete-asset.js`

각 도구에 대해 동일한 패턴으로 수정:

1. import에서 `getCurrentUser` → `getUserFromToken` 변경
2. inputSchema에 `token` 필드 추가
3. `checkPermission(roles)` → `checkPermission(args.token, roles)` 변경
4. `getCurrentUser()?.id` → `result.user.id` 변경 (checkPermission 반환값에서 user 추출)

- [ ] **Step 1: create-asset.js 수정**

import 변경:
```javascript
// 변경 전
import { checkPermission, getCurrentUser } from '../auth.js';
// 변경 후
import { checkPermission, getUserFromToken } from '../auth.js';
```

inputSchema에 token 추가:
```javascript
token: z.string().describe('로그인 시 발급받은 JWT 토큰'),
```

핸들러 내부 변경:
```javascript
// 변경 전
const denied = await checkPermission(['admin', 'manager']);
if (denied) return denied;
// ... 
const userId = getCurrentUser()?.id;

// 변경 후
const result = checkPermission(args.token, ['admin', 'manager']);
if (result.content) return result;
// ...
const userId = result.user.id;
```

- [ ] **Step 2: update-asset.js 동일 패턴 수정**

import, inputSchema, checkPermission 호출, getCurrentUser → result.user 동일하게 변경.

- [ ] **Step 3: change-status.js 동일 패턴 수정**

import, inputSchema, checkPermission 호출, getCurrentUser → result.user 동일하게 변경.

- [ ] **Step 4: delete-asset.js 수정**

동일 패턴이지만 권한은 `['admin']`만:
```javascript
const result = checkPermission(args.token, ['admin']);
if (result.content) return result;
```

- [ ] **Step 5: 커밋**

```bash
git add mcp-server/tools/create-asset.js mcp-server/tools/update-asset.js mcp-server/tools/change-status.js mcp-server/tools/delete-asset.js
git commit -m "refactor(mcp): add JWT token param to all auth-required tools"
```

---

### Task 6: index.js — Express + Streamable HTTP 전환

**Files:**
- Modify: `mcp-server/index.js`

- [ ] **Step 1: index.js 전체 교체**

```javascript
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { initDB, closeDB } from './db.js';
import { registerListAssets } from './tools/list-assets.js';
import { registerGetAsset } from './tools/get-asset.js';
import { registerCreateAsset } from './tools/create-asset.js';
import { registerUpdateAsset } from './tools/update-asset.js';
import { registerChangeStatus } from './tools/change-status.js';
import { registerDeleteAsset } from './tools/delete-asset.js';
import { registerGetAssetLogs } from './tools/get-asset-logs.js';
import { registerLogin } from './tools/login.js';

const PORT = process.env.PORT || 8080;

function createServer() {
  const server = new McpServer(
    { name: 'asset-management', version: '2.0.0' },
    {
      capabilities: { logging: {} },
      instructions: `자산관리 시스템 MCP 서버입니다.
- 자산 조회/등록/수정/상태변경/삭제/이력 조회가 가능합니다.
- 삭제는 소프트 삭제(status='deleted')이며, disposed 상태인 자산만 삭제할 수 있습니다.
- 모든 변경 작업은 asset_logs에 기록됩니다.
- 권한 체크: 등록/수정/상태변경은 admin, manager만 가능. 삭제는 admin만 가능. 조회는 모든 사용자 가능.
- 사용 전 반드시 login 도구로 로그인하여 토큰을 발급받으세요. 등록/수정/삭제 시 token 필드에 토큰을 전달하세요.`
    }
  );

  registerLogin(server);
  registerListAssets(server);
  registerGetAsset(server);
  registerCreateAsset(server);
  registerUpdateAsset(server);
  registerChangeStatus(server);
  registerDeleteAsset(server);
  registerGetAssetLogs(server);

  return server;
}

const app = express();
app.use(express.json());

// Streamable HTTP transport on /mcp
app.post('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'asset-management-mcp' });
});

try {
  await initDB();
  console.log('DB connected');
  app.listen(PORT, () => {
    console.log(`MCP Server listening on port ${PORT}`);
  });
} catch (err) {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
}

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/index.js
git commit -m "feat(mcp): switch to Express + StreamableHTTP transport"
```

---

### Task 7: EC2 환경변수 및 배포

**Files:**
- Modify: `mcp-server/.env` (EC2에서만)

- [ ] **Step 1: EC2에 .env 생성**

```env
PORT=8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=indg
DB_PASSWORD=dlshekdla2016!
DB_NAME=asset_management
JWT_SECRET=<랜덤 문자열 생성>
```

- [ ] **Step 2: EC2에 소스 배포**

```bash
rsync -avz --exclude node_modules --exclude .env -e "ssh -i /home/neon/project/indgAsset/aws-key.pem" \
  /home/neon/project/indgAsset/mcp-server/ \
  ubuntu@3.130.223.104:/home/ubuntu/indgAsset/mcp-server/
```

- [ ] **Step 3: EC2에서 npm install 및 PM2 등록**

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "cd /home/ubuntu/indgAsset/mcp-server && npm install && pm2 start index.js --name mcp-server && pm2 save"
```

- [ ] **Step 4: 동작 확인**

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "curl -s http://localhost:8080/health"
```

Expected: `{"status":"ok","service":"asset-management-mcp"}`

---

### Task 8: Nginx 리버스 프록시 설정

- [ ] **Step 1: Nginx 설정에 /mcp 추가**

EC2에서 기존 asset.indg.co.kr 설정 파일에 추가:

```nginx
location /mcp {
    proxy_pass http://localhost:8080/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

- [ ] **Step 2: Nginx 테스트 및 리로드**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Step 3: 외부 접속 확인**

```bash
curl -s https://asset.indg.co.kr/health
```

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(mcp): remote MCP server deployment complete"
```
