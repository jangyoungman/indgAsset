import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
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
import { registerLogin } from './tools/login.js';

const server = new McpServer(
  { name: 'asset-management', version: '1.0.0' },
  {
    capabilities: { logging: {} },
    instructions: `자산관리 시스템 MCP 서버입니다.
- 자산 조회/등록/수정/상태변경/삭제/이력 조회가 가능합니다.
- 삭제는 소프트 삭제(status='deleted')이며, disposed 상태인 자산만 삭제할 수 있습니다.
- 모든 변경 작업은 asset_logs에 기록됩니다.
- 권한 체크: 등록/수정/상태변경은 admin, manager만 가능. 삭제는 admin만 가능. 조회는 모든 사용자 가능.
- 사용 전 반드시 login 도구로 로그인이 필요합니다. whoami로 현재 로그인 상태를 확인할 수 있습니다.`
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

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Asset Management MCP Server running on stdio');
  await initDB();
  console.error('DB connected via SSH tunnel');
} catch (err) {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
}

process.on('SIGINT', async () => {
  await closeDB();
  process.exit(0);
});
