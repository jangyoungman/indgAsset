import { z } from 'zod';
import { getPool } from '../db.js';
import { checkPermission } from '../auth.js';

export function registerDeleteAsset(server) {
  server.registerTool('delete_asset', {
    title: '자산 삭제',
    description: '자산을 소프트 삭제합니다. disposed 상태인 자산만 삭제할 수 있습니다. (admin 권한 필요)',
    inputSchema: z.object({
      token: z.string().describe('로그인 시 발급받은 JWT 토큰'),
      id: z.number().int().optional().describe('자산 ID'),
      asset_code: z.string().optional().describe('자산 코드'),
      reason: z.string().optional().describe('삭제 사유'),
    }).refine(data => data.id !== undefined || data.asset_code !== undefined, {
      message: 'id 또는 asset_code 중 하나는 필수입니다.',
    }),
  }, async (args) => {
    // 권한 체크: admin만 자산 삭제 가능
    const result = checkPermission(args.token, ['admin']);
    if (result.content) return result;

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Find asset
      let findSql, findParams;
      if (args.id !== undefined) {
        findSql = 'SELECT * FROM assets WHERE id = ?';
        findParams = [args.id];
      } else {
        findSql = 'SELECT * FROM assets WHERE asset_code = ?';
        findParams = [args.asset_code];
      }
      const [existing] = await conn.query(findSql, findParams);
      if (existing.length === 0) {
        await conn.rollback();
        return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
      }
      const asset = existing[0];

      if (asset.status !== 'disposed') {
        await conn.rollback();
        return {
          content: [{
            type: 'text',
            text: `Error: disposed 상태인 자산만 삭제할 수 있습니다. 현재 상태: '${asset.status}'`,
          }],
        };
      }

      await conn.query("UPDATE assets SET status = 'deleted' WHERE id = ?", [asset.id]);

      // Log with asset snapshot
      const userId = result.user.id;
      const snapshot = { ...asset };
      delete snapshot.created_at;
      delete snapshot.updated_at;

      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [asset.id, userId, 'deleted', JSON.stringify({
          source: 'mcp',
          reason: args.reason || null,
          snapshot,
        })]
      );

      await conn.commit();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: '자산이 삭제되었습니다.',
            id: asset.id,
            asset_code: asset.asset_code,
            name: asset.name,
          }, null, 2),
        }],
      };
    } catch (err) {
      await conn.rollback();
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    } finally {
      conn.release();
    }
  });
}
