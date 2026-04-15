import './config.js';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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

// --- Streamable HTTP transport (신규) ---
const streamableSessions = new Map();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && streamableSessions.has(sessionId)) {
    transport = streamableSessions.get(sessionId).transport;
  } else if (!sessionId) {
    // 새 세션 생성
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createServer();

    transport.onclose = () => {
      streamableSessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    streamableSessions.set(transport.sessionId, { transport, server });
  } else {
    res.status(400).json({ error: 'Invalid or expired session' });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !streamableSessions.has(sessionId)) {
    res.status(400).json({ error: 'Invalid or expired session' });
    return;
  }
  const { transport } = streamableSessions.get(sessionId);
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (sessionId && streamableSessions.has(sessionId)) {
    const { transport, server } = streamableSessions.get(sessionId);
    await transport.handleRequest(req, res, req.body);
    streamableSessions.delete(sessionId);
    await server.close();
  } else {
    res.status(400).json({ error: 'Invalid or expired session' });
  }
});

// --- Legacy SSE transport (하위 호환) ---
const sseSessions = new Map();

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  const server = createServer();

  sseSessions.set(transport.sessionId, { transport, server });

  res.on('close', () => {
    sseSessions.delete(transport.sessionId);
    server.close();
  });

  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ error: 'Invalid or expired session' });
  }

  await session.transport.handlePostMessage(req, res, req.body);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'asset-management-mcp' });
});

try {
  await initDB();
  console.log('DB connected');
  app.listen(PORT, () => {
    console.log(`MCP Server listening on port ${PORT} (SSE + Streamable HTTP)`);
  });
} catch (err) {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closeDB();
    process.exit(0);
  });
}
