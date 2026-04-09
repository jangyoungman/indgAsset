import { z } from 'zod';
import { getPool } from '../db.js';
import { checkPermission, getCurrentUser } from '../auth.js';

export function registerChangeStatus(server) {
  server.registerTool('change_status', {
    title: '자산 상태 변경',
    description: '자산의 상태를 변경합니다. (available, in_use, maintenance, disposed) (admin, manager 권한 필요)',
    inputSchema: z.object({
      id: z.number().int().optional().describe('자산 ID'),
      asset_code: z.string().optional().describe('자산 코드'),
      status: z.enum(['available', 'in_use', 'maintenance', 'disposed']).describe('변경할 상태'),
      reason: z.string().optional().describe('변경 사유'),
    }).refine(data => data.id !== undefined || data.asset_code !== undefined, {
      message: 'id 또는 asset_code 중 하나는 필수입니다.',
    }),
  }, async (args) => {
    // 권한 체크: admin, manager만 상태 변경 가능
    const denied = await checkPermission(['admin', 'manager']);
    if (denied) return denied;

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

      if (asset.status === args.status) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: 이미 '${args.status}' 상태입니다.` }] };
      }

      if (asset.status === 'deleted') {
        await conn.rollback();
        return { content: [{ type: 'text', text: 'Error: 삭제된 자산의 상태는 변경할 수 없습니다.' }] };
      }

      await conn.query('UPDATE assets SET status = ? WHERE id = ?', [args.status, asset.id]);

      const action = args.status === 'disposed' ? 'disposed' : 'updated';
      const userId = getCurrentUser()?.id || 0;
      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [asset.id, userId, action, JSON.stringify({
          source: 'mcp',
          status_change: { before: asset.status, after: args.status },
          reason: args.reason || null,
        })]
      );

      await conn.commit();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: '자산 상태가 변경되었습니다.',
            id: asset.id,
            asset_code: asset.asset_code,
            before: asset.status,
            after: args.status,
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
