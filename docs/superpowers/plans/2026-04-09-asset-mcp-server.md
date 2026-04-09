# 자산관리 MCP 서버 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code에서 자산관리 DB를 직접 조작할 수 있는 MCP 서버 구축

**Architecture:** Node.js MCP 서버가 stdio transport로 Claude Code와 통신하고, SSH 터널을 통해 EC2 MySQL에 접속한다. 7개의 도구(list/get/create/update/change_status/delete/logs)를 제공한다.

**Tech Stack:** @modelcontextprotocol/sdk 1.29, mysql2/promise, ssh2, zod, dotenv

---

## 파일 구조

```
mcp-server/
  index.js          # MCP 서버 진입점, 도구 등록
  db.js             # SSH 터널 + MySQL 풀 관리
  tools/
    list-assets.js    # 자산 목록 조회
    get-asset.js      # 자산 상세 조회
    create-asset.js   # 자산 등록
    update-asset.js   # 자산 수정
    change-status.js  # 상태 변경
    delete-asset.js   # 소프트 삭제
    get-asset-logs.js # 이력 조회
  package.json
  .env
```

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/.env`

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "indg-asset-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for INNODIGM asset management",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "mysql2": "^3.14.0",
    "ssh2": "^1.16.0",
    "zod": "^3.25.0",
    "dotenv": "^16.5.0"
  }
}
```

- [ ] **Step 2: .env 생성**

```
SSH_KEY_PATH=/home/neon/project/indgAsset/aws-key.pem
SSH_HOST=3.130.223.104
SSH_USER=ubuntu
SSH_TUNNEL_PORT=33060
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=indg
DB_PASSWORD=dlshekdla2016!
DB_NAME=asset_management
MCP_USER_ID=0
```

- [ ] **Step 3: npm install**

Run: `cd /home/neon/project/indgAsset/mcp-server && npm install`
Expected: node_modules 생성, 의존성 설치 완료

- [ ] **Step 4: .gitignore 확인**

`mcp-server/node_modules`와 `mcp-server/.env`가 .gitignore에 포함되어 있는지 확인. 없으면 추가.

- [ ] **Step 5: 커밋**

```bash
cd /home/neon/project/indgAsset
git add mcp-server/package.json mcp-server/package-lock.json
git commit -m "chore: MCP 서버 프로젝트 초기화"
```

---

### Task 2: SSH 터널 + DB 연결 모듈

**Files:**
- Create: `mcp-server/db.js`

- [ ] **Step 1: db.js 작성**

SSH 터널을 열고 MySQL 풀을 생성하는 모듈. MCP 서버 시작 시 `initDB()`를 호출하고, 종료 시 `closeDB()`로 정리한다.

```javascript
import { readFileSync } from 'fs';
import { Client } from 'ssh2';
import mysql from 'mysql2/promise';
import { createServer } from 'net';

let sshClient = null;
let pool = null;
let localServer = null;

export async function initDB() {
  const sshConfig = {
    host: process.env.SSH_HOST,
    port: 22,
    username: process.env.SSH_USER,
    privateKey: readFileSync(process.env.SSH_KEY_PATH),
  };

  const tunnelPort = Number(process.env.SSH_TUNNEL_PORT) || 33060;
  const dbPort = Number(process.env.DB_PORT) || 3306;

  return new Promise((resolve, reject) => {
    sshClient = new Client();

    sshClient.on('ready', () => {
      localServer = createServer((sock) => {
        sshClient.forwardOut(
          sock.remoteAddress || '127.0.0.1',
          sock.remotePort || 0,
          process.env.DB_HOST || '127.0.0.1',
          dbPort,
          (err, stream) => {
            if (err) { sock.end(); return; }
            sock.pipe(stream).pipe(sock);
          }
        );
      });

      localServer.listen(tunnelPort, '127.0.0.1', async () => {
        try {
          pool = mysql.createPool({
            host: '127.0.0.1',
            port: tunnelPort,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
          });
          // 연결 테스트
          const conn = await pool.getConnection();
          conn.release();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    sshClient.on('error', reject);
    sshClient.connect(sshConfig);
  });
}

export function getPool() {
  if (!pool) throw new Error('DB not initialized. Call initDB() first.');
  return pool;
}

export async function closeDB() {
  if (pool) { await pool.end(); pool = null; }
  if (localServer) { localServer.close(); localServer = null; }
  if (sshClient) { sshClient.end(); sshClient = null; }
}
```

- [ ] **Step 2: 연결 테스트**

Run: `cd /home/neon/project/indgAsset/mcp-server && node -e "import('dotenv/config').then(() => import('./db.js')).then(async (db) => { await db.initDB(); const pool = db.getPool(); const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM assets'); console.log('Assets count:', rows[0].cnt); await db.closeDB(); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"`

Expected: `Assets count: 20` (또는 현재 자산 수)

- [ ] **Step 3: 커밋**

```bash
git add mcp-server/db.js
git commit -m "feat(mcp): SSH 터널 + MySQL 연결 모듈 추가"
```

---

### Task 3: DB 스키마 변경 — status ENUM에 'deleted' 추가

**Files:**
- Modify: EC2 MySQL `assets` 테이블

- [ ] **Step 1: ALTER TABLE 실행**

EC2 SSH를 통해 MySQL에서 실행:

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "mysql -u indg -p'dlshekdla2016!' asset_management -e \"
    ALTER TABLE assets MODIFY COLUMN status
      ENUM('available','in_use','maintenance','disposed','deleted') DEFAULT 'available';
  \""
```

- [ ] **Step 2: 변경 확인**

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "mysql -u indg -p'dlshekdla2016!' asset_management -e \"
    SHOW COLUMNS FROM assets LIKE 'status';
  \""
```

Expected: `enum('available','in_use','maintenance','disposed','deleted')`

- [ ] **Step 3: common_codes에 ASSET_STATUS deleted 추가**

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "mysql -u indg -p'dlshekdla2016!' asset_management -e \"
    INSERT INTO common_codes (group_code, code, name, sort_order, is_active, description)
    VALUES ('ASSET_STATUS', 'deleted', '삭제됨', 5, 1, 'bg-red-100 text-red-500');
  \""
```

- [ ] **Step 4: common_codes에 LOG_ACTION deleted 추가**

```bash
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.130.223.104 \
  "mysql -u indg -p'dlshekdla2016!' asset_management -e \"
    INSERT INTO common_codes (group_code, code, name, sort_order, is_active, description)
    VALUES ('LOG_ACTION', 'deleted', '삭제', 6, 1, 'bg-red-700');
  \""
```

- [ ] **Step 5: schema.sql 업데이트 (로컬)**

`backend/config/schema.sql`의 assets 테이블 status ENUM에 `'deleted'` 추가:

변경 전:
```sql
status ENUM('available','in_use','maintenance','disposed') DEFAULT 'available',
```

변경 후:
```sql
status ENUM('available','in_use','maintenance','disposed','deleted') DEFAULT 'available',
```

- [ ] **Step 6: 커밋**

```bash
git add backend/config/schema.sql
git commit -m "feat: assets 테이블 status ENUM에 'deleted' 추가 (소프트 삭제)"
```

---

### Task 4: MCP 서버 진입점

**Files:**
- Create: `mcp-server/index.js`

- [ ] **Step 1: index.js 작성**

MCP 서버를 초기화하고, DB 연결 후 도구를 등록하고, stdio transport에 연결한다.

```javascript
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDB, closeDB } from './db.js';
import { registerListAssets } from './tools/list-assets.js';
import { registerGetAsset } from './tools/get-asset.js';
import { registerCreateAsset } from './tools/create-asset.js';
import { registerUpdateAsset } from './tools/update-asset.js';
import { registerChangeStatus } from './tools/change-status.js';
import { registerDeleteAsset } from './tools/delete-asset.js';
import { registerGetAssetLogs } from './tools/get-asset-logs.js';

const server = new McpServer(
  { name: 'asset-management', version: '1.0.0' },
  {
    capabilities: { logging: {} },
    instructions: `자산관리 시스템 MCP 서버입니다.
- 자산 조회/등록/수정/상태변경/삭제/이력 조회가 가능합니다.
- 삭제는 소프트 삭제(status='deleted')이며, disposed 상태인 자산만 삭제할 수 있습니다.
- 모든 변경 작업은 asset_logs에 기록됩니다.`
  }
);

registerListAssets(server);
registerGetAsset(server);
registerCreateAsset(server);
registerUpdateAsset(server);
registerChangeStatus(server);
registerDeleteAsset(server);
registerGetAssetLogs(server);

try {
  await initDB();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Asset Management MCP Server running on stdio');
} catch (err) {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
}

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});
```

- [ ] **Step 2: tools 디렉토리 생성**

```bash
mkdir -p /home/neon/project/indgAsset/mcp-server/tools
```

- [ ] **Step 3: 커밋**

```bash
git add mcp-server/index.js
git commit -m "feat(mcp): MCP 서버 진입점 추가"
```

---

### Task 5: 도구 — list_assets

**Files:**
- Create: `mcp-server/tools/list-assets.js`

- [ ] **Step 1: list-assets.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerListAssets(server) {
  server.registerTool(
    'list_assets',
    {
      title: '자산 목록 조회',
      description: '자산 목록을 조회합니다. 상태, 카테고리, 검색어로 필터링할 수 있습니다.',
      inputSchema: z.object({
        status: z.enum(['available', 'in_use', 'maintenance', 'disposed']).optional()
          .describe('자산 상태 필터'),
        category: z.string().optional()
          .describe('카테고리명 (예: 노트북, 모니터)'),
        search: z.string().optional()
          .describe('자산명/코드/시리얼번호 검색어'),
        include_deleted: z.boolean().default(false).optional()
          .describe('삭제된 자산 포함 여부'),
        page: z.number().int().min(1).default(1).optional()
          .describe('페이지 번호'),
        limit: z.number().int().min(1).max(100).default(20).optional()
          .describe('페이지당 건수'),
      }),
    },
    async (args) => {
      const pool = getPool();
      const { status, category, search, include_deleted = false, page = 1, limit = 20 } = args;

      let query = `
        SELECT a.id, a.asset_code, a.name, a.status, a.serial_number, a.manufacturer, a.model,
               a.purchase_date, a.purchase_cost, a.location, a.notes,
               c.name as category_name
        FROM assets a
        LEFT JOIN asset_categories c ON a.category_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (!include_deleted) {
        query += " AND a.status != 'deleted'";
      }
      if (status) {
        query += ' AND a.status = ?';
        params.push(status);
      }
      if (category) {
        query += ' AND c.name = ?';
        params.push(category);
      }
      if (search) {
        query += ' AND (a.name LIKE ? OR a.asset_code LIKE ? OR a.serial_number LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      // 전체 건수
      const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
      const [countResult] = await pool.query(countQuery, params);
      const total = countResult[0].total;

      // 페이지네이션
      const offset = (page - 1) * limit;
      query += ' ORDER BY a.updated_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows] = await pool.query(query, params);

      const result = {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: rows,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/list-assets.js
git commit -m "feat(mcp): list_assets 도구 추가"
```

---

### Task 6: 도구 — get_asset

**Files:**
- Create: `mcp-server/tools/get-asset.js`

- [ ] **Step 1: get-asset.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerGetAsset(server) {
  server.registerTool(
    'get_asset',
    {
      title: '자산 상세 조회',
      description: '자산 ID 또는 자산코드로 상세 정보를 조회합니다.',
      inputSchema: z.object({
        id: z.number().int().optional().describe('자산 ID'),
        asset_code: z.string().optional().describe('자산 코드 (예: AST-2026-001)'),
      }),
    },
    async (args) => {
      const { id, asset_code } = args;
      if (!id && !asset_code) {
        return { content: [{ type: 'text', text: 'Error: id 또는 asset_code 중 하나를 지정하세요.' }] };
      }

      const pool = getPool();
      const where = id ? 'a.id = ?' : 'a.asset_code = ?';
      const param = id || asset_code;

      const [rows] = await pool.query(
        `SELECT a.*, c.name as category_name
         FROM assets a
         LEFT JOIN asset_categories c ON a.category_id = c.id
         WHERE ${where}`,
        [param]
      );

      if (rows.length === 0) {
        return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/get-asset.js
git commit -m "feat(mcp): get_asset 도구 추가"
```

---

### Task 7: 도구 — create_asset

**Files:**
- Create: `mcp-server/tools/create-asset.js`

- [ ] **Step 1: create-asset.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerCreateAsset(server) {
  server.registerTool(
    'create_asset',
    {
      title: '자산 등록',
      description: '새 자산을 등록합니다. 자산코드는 자동 생성됩니다.',
      inputSchema: z.object({
        name: z.string().describe('자산명'),
        category: z.string().describe('카테고리명 (노트북, 모니터, 사무가구, 소프트웨어, 차량, 사무기기)'),
        serial_number: z.string().optional().describe('시리얼번호'),
        mac_address: z.string().optional().describe('MAC 주소'),
        manufacturer: z.string().optional().describe('제조사'),
        model: z.string().optional().describe('모델명'),
        purchase_date: z.string().optional().describe('구매일 (YYYY-MM-DD)'),
        purchase_cost: z.number().optional().describe('구매가격'),
        warranty_expiry: z.string().optional().describe('보증만료일 (YYYY-MM-DD)'),
        location: z.string().optional().describe('위치'),
        status: z.enum(['available', 'in_use', 'maintenance']).default('available').optional()
          .describe('초기 상태 (기본: available)'),
        notes: z.string().optional().describe('비고'),
      }),
    },
    async (args) => {
      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        // 카테고리 ID 조회
        const [cats] = await conn.query(
          'SELECT id FROM asset_categories WHERE name = ?',
          [args.category]
        );
        if (cats.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: `Error: 카테고리 '${args.category}'를 찾을 수 없습니다. 사용 가능: 노트북, 모니터, 사무가구, 소프트웨어, 차량, 사무기기` }] };
        }
        const category_id = cats[0].id;

        // 자산코드 자동 생성
        const baseDate = args.purchase_date ? new Date(args.purchase_date) : new Date();
        const year = baseDate.getFullYear();
        const prefix = `AST-${year}-`;
        const [lastRow] = await conn.query(
          'SELECT asset_code FROM assets WHERE asset_code LIKE ? ORDER BY asset_code DESC LIMIT 1',
          [`${prefix}%`]
        );
        let seq = 1;
        if (lastRow.length > 0) {
          const lastSeq = parseInt(lastRow[0].asset_code.split('-')[2], 10);
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const asset_code = `${prefix}${String(seq).padStart(3, '0')}`;

        const status = args.status || 'available';
        const [result] = await conn.query(
          `INSERT INTO assets
           (asset_code, name, category_id, serial_number, mac_address, manufacturer, model,
            purchase_date, purchase_cost, warranty_expiry, location, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [asset_code, args.name, category_id, args.serial_number || null,
           args.mac_address || null, args.manufacturer || null, args.model || null,
           args.purchase_date || null, args.purchase_cost || null,
           args.warranty_expiry || null, args.location || null, status, args.notes || null]
        );

        // 이력 로그
        await conn.query(
          'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
          [result.insertId, Number(process.env.MCP_USER_ID) || 0, 'created',
           JSON.stringify({ source: 'mcp', name: args.name, asset_code })]
        );

        await conn.commit();

        return {
          content: [{ type: 'text', text: JSON.stringify({
            message: '자산이 등록되었습니다.',
            id: result.insertId,
            asset_code,
            name: args.name,
            status,
          }, null, 2) }],
        };
      } catch (err) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      } finally {
        conn.release();
      }
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/create-asset.js
git commit -m "feat(mcp): create_asset 도구 추가"
```

---

### Task 8: 도구 — update_asset

**Files:**
- Create: `mcp-server/tools/update-asset.js`

- [ ] **Step 1: update-asset.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerUpdateAsset(server) {
  server.registerTool(
    'update_asset',
    {
      title: '자산 정보 수정',
      description: '기존 자산의 정보를 수정합니다. 변경할 필드만 전달하세요.',
      inputSchema: z.object({
        id: z.number().int().optional().describe('자산 ID'),
        asset_code: z.string().optional().describe('자산 코드'),
        name: z.string().optional().describe('자산명'),
        category: z.string().optional().describe('카테고리명'),
        serial_number: z.string().optional().describe('시리얼번호'),
        mac_address: z.string().optional().describe('MAC 주소'),
        manufacturer: z.string().optional().describe('제조사'),
        model: z.string().optional().describe('모델명'),
        purchase_date: z.string().optional().describe('구매일 (YYYY-MM-DD)'),
        purchase_cost: z.number().optional().describe('구매가격'),
        warranty_expiry: z.string().optional().describe('보증만료일 (YYYY-MM-DD)'),
        location: z.string().optional().describe('위치'),
        notes: z.string().optional().describe('비고'),
      }),
    },
    async (args) => {
      const { id, asset_code, ...fields } = args;
      if (!id && !asset_code) {
        return { content: [{ type: 'text', text: 'Error: id 또는 asset_code 중 하나를 지정하세요.' }] };
      }

      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        // 대상 자산 조회
        const where = id ? 'id = ?' : 'asset_code = ?';
        const param = id || asset_code;
        const [existing] = await conn.query(`SELECT * FROM assets WHERE ${where}`, [param]);
        if (existing.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
        }
        const asset = existing[0];

        // 카테고리명 → ID 변환
        if (fields.category) {
          const [cats] = await conn.query('SELECT id FROM asset_categories WHERE name = ?', [fields.category]);
          if (cats.length === 0) {
            await conn.rollback();
            return { content: [{ type: 'text', text: `Error: 카테고리 '${fields.category}'를 찾을 수 없습니다.` }] };
          }
          fields.category_id = cats[0].id;
          delete fields.category;
        }

        const setClauses = [];
        const values = [];
        const changes = {};

        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            setClauses.push(`${key} = ?`);
            values.push(value);
            changes[key] = { before: asset[key], after: value };
          }
        }

        if (setClauses.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: 'Error: 수정할 항목이 없습니다.' }] };
        }

        values.push(asset.id);
        await conn.query(`UPDATE assets SET ${setClauses.join(', ')} WHERE id = ?`, values);

        await conn.query(
          'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
          [asset.id, Number(process.env.MCP_USER_ID) || 0, 'updated',
           JSON.stringify({ source: 'mcp', changes })]
        );

        await conn.commit();

        return {
          content: [{ type: 'text', text: JSON.stringify({
            message: '자산 정보가 수정되었습니다.',
            asset_code: asset.asset_code,
            changes,
          }, null, 2) }],
        };
      } catch (err) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      } finally {
        conn.release();
      }
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/update-asset.js
git commit -m "feat(mcp): update_asset 도구 추가"
```

---

### Task 9: 도구 — change_status

**Files:**
- Create: `mcp-server/tools/change-status.js`

- [ ] **Step 1: change-status.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerChangeStatus(server) {
  server.registerTool(
    'change_status',
    {
      title: '자산 상태 변경',
      description: '자산의 상태를 변경합니다.',
      inputSchema: z.object({
        id: z.number().int().optional().describe('자산 ID'),
        asset_code: z.string().optional().describe('자산 코드'),
        status: z.enum(['available', 'in_use', 'maintenance', 'disposed'])
          .describe('변경할 상태'),
        reason: z.string().optional().describe('상태 변경 사유'),
      }),
    },
    async (args) => {
      const { id, asset_code, status, reason } = args;
      if (!id && !asset_code) {
        return { content: [{ type: 'text', text: 'Error: id 또는 asset_code 중 하나를 지정하세요.' }] };
      }

      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        const where = id ? 'id = ?' : 'asset_code = ?';
        const param = id || asset_code;
        const [existing] = await conn.query(`SELECT id, asset_code, name, status FROM assets WHERE ${where}`, [param]);
        if (existing.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
        }

        const asset = existing[0];
        const beforeStatus = asset.status;

        if (beforeStatus === status) {
          await conn.rollback();
          return { content: [{ type: 'text', text: `이미 '${status}' 상태입니다.` }] };
        }

        await conn.query('UPDATE assets SET status = ? WHERE id = ?', [status, asset.id]);

        const action = status === 'disposed' ? 'disposed' : 'updated';
        await conn.query(
          'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
          [asset.id, Number(process.env.MCP_USER_ID) || 0, action,
           JSON.stringify({ source: 'mcp', status_change: { before: beforeStatus, after: status }, reason })]
        );

        await conn.commit();

        return {
          content: [{ type: 'text', text: JSON.stringify({
            message: '상태가 변경되었습니다.',
            asset_code: asset.asset_code,
            name: asset.name,
            before: beforeStatus,
            after: status,
          }, null, 2) }],
        };
      } catch (err) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      } finally {
        conn.release();
      }
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/change-status.js
git commit -m "feat(mcp): change_status 도구 추가"
```

---

### Task 10: 도구 — delete_asset (소프트 삭제)

**Files:**
- Create: `mcp-server/tools/delete-asset.js`

- [ ] **Step 1: delete-asset.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerDeleteAsset(server) {
  server.registerTool(
    'delete_asset',
    {
      title: '자산 삭제 (소프트)',
      description: '폐기 상태(disposed)인 자산을 소프트 삭제합니다. disposed 상태가 아닌 자산은 삭제할 수 없습니다.',
      inputSchema: z.object({
        id: z.number().int().optional().describe('자산 ID'),
        asset_code: z.string().optional().describe('자산 코드'),
        reason: z.string().optional().describe('삭제 사유'),
      }),
    },
    async (args) => {
      const { id, asset_code, reason } = args;
      if (!id && !asset_code) {
        return { content: [{ type: 'text', text: 'Error: id 또는 asset_code 중 하나를 지정하세요.' }] };
      }

      const pool = getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        const where = id ? 'id = ?' : 'asset_code = ?';
        const param = id || asset_code;
        const [existing] = await conn.query(`SELECT * FROM assets WHERE ${where}`, [param]);
        if (existing.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
        }

        const asset = existing[0];
        if (asset.status !== 'disposed') {
          await conn.rollback();
          return { content: [{ type: 'text', text: `Error: 폐기(disposed) 상태인 자산만 삭제할 수 있습니다. 현재 상태: ${asset.status}` }] };
        }

        await conn.query("UPDATE assets SET status = 'deleted' WHERE id = ?", [asset.id]);

        // 삭제 로그에 자산 정보 스냅샷 보존
        await conn.query(
          'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
          [asset.id, Number(process.env.MCP_USER_ID) || 0, 'deleted',
           JSON.stringify({
             source: 'mcp',
             reason,
             snapshot: {
               asset_code: asset.asset_code,
               name: asset.name,
               serial_number: asset.serial_number,
               manufacturer: asset.manufacturer,
               model: asset.model,
               purchase_date: asset.purchase_date,
               purchase_cost: asset.purchase_cost,
             },
           })]
        );

        await conn.commit();

        return {
          content: [{ type: 'text', text: JSON.stringify({
            message: '자산이 삭제(소프트) 처리되었습니다.',
            asset_code: asset.asset_code,
            name: asset.name,
          }, null, 2) }],
        };
      } catch (err) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
      } finally {
        conn.release();
      }
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/delete-asset.js
git commit -m "feat(mcp): delete_asset 소프트 삭제 도구 추가"
```

---

### Task 11: 도구 — get_asset_logs

**Files:**
- Create: `mcp-server/tools/get-asset-logs.js`

- [ ] **Step 1: get-asset-logs.js 작성**

```javascript
import { z } from 'zod';
import { getPool } from '../db.js';

export function registerGetAssetLogs(server) {
  server.registerTool(
    'get_asset_logs',
    {
      title: '자산 이력 조회',
      description: '자산의 변경 이력을 조회합니다.',
      inputSchema: z.object({
        id: z.number().int().optional().describe('자산 ID'),
        asset_code: z.string().optional().describe('자산 코드'),
      }),
    },
    async (args) => {
      const { id, asset_code } = args;
      if (!id && !asset_code) {
        return { content: [{ type: 'text', text: 'Error: id 또는 asset_code 중 하나를 지정하세요.' }] };
      }

      const pool = getPool();

      // asset_code인 경우 id 조회
      let assetId = id;
      if (!assetId) {
        const [rows] = await pool.query('SELECT id FROM assets WHERE asset_code = ?', [asset_code]);
        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
        }
        assetId = rows[0].id;
      }

      const [logs] = await pool.query(
        `SELECT id, action, details, created_at
         FROM asset_logs
         WHERE asset_id = ?
         ORDER BY created_at DESC`,
        [assetId]
      );

      return {
        content: [{ type: 'text', text: JSON.stringify({
          asset_id: assetId,
          asset_code: asset_code || undefined,
          total: logs.length,
          logs,
        }, null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add mcp-server/tools/get-asset-logs.js
git commit -m "feat(mcp): get_asset_logs 도구 추가"
```

---

### Task 12: Claude Code에 MCP 서버 등록

**Files:**
- Modify: `~/.claude/settings.json`

- [ ] **Step 1: settings.json에 MCP 서버 등록**

`~/.claude/settings.json`의 `mcpServers` 섹션에 추가:

```json
{
  "mcpServers": {
    "asset-management": {
      "command": "node",
      "args": ["/home/neon/project/indgAsset/mcp-server/index.js"],
      "cwd": "/home/neon/project/indgAsset/mcp-server"
    }
  }
}
```

기존 설정이 있으면 `mcpServers` 키에 병합한다.

- [ ] **Step 2: Claude Code 재시작 후 도구 인식 확인**

Claude Code를 재시작하고, MCP 도구가 로드되는지 확인한다.
`mcp__asset-management__list_assets` 등의 도구가 사용 가능해야 한다.

- [ ] **Step 3: 통합 테스트 — 조회**

Claude Code에서 `list_assets` 호출하여 자산 목록이 정상 반환되는지 확인.

- [ ] **Step 4: 통합 테스트 — 등록 + 수정 + 삭제**

1. `create_asset`으로 테스트 자산 등록
2. `get_asset`으로 등록된 자산 조회
3. `update_asset`으로 자산 수정
4. `change_status`로 disposed 변경
5. `delete_asset`으로 소프트 삭제
6. `get_asset_logs`로 전체 이력 확인

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat(mcp): 자산관리 MCP 서버 구현 완료"
```
