import { z } from 'zod';
import { getPool } from '../db.js';

export function registerGetAssetLogs(server) {
  server.registerTool('get_asset_logs', {
    title: '자산 이력 조회',
    description: '자산의 변경 이력을 조회합니다.',
    inputSchema: z.object({
      id: z.number().int().optional().describe('자산 ID'),
      asset_code: z.string().optional().describe('자산 코드'),
    }).refine(data => data.id !== undefined || data.asset_code !== undefined, {
      message: 'id 또는 asset_code 중 하나는 필수입니다.',
    }),
  }, async (args) => {
    try {
      const pool = getPool();
      let assetId = args.id;

      // If asset_code provided, look up asset id
      if (assetId === undefined) {
        const [rows] = await pool.query('SELECT id FROM assets WHERE asset_code = ?', [args.asset_code]);
        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
        }
        assetId = rows[0].id;
      }

      const [logs] = await pool.query(
        'SELECT * FROM asset_logs WHERE asset_id = ? ORDER BY created_at DESC',
        [assetId]
      );

      // Parse JSON details
      const parsed = logs.map(log => ({
        ...log,
        details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ asset_id: assetId, total: parsed.length, logs: parsed }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  });
}
