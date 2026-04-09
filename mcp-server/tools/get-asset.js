import { z } from 'zod';
import { getPool } from '../db.js';

export function registerGetAsset(server) {
  server.registerTool('get_asset', {
    title: '자산 상세 조회',
    description: '자산 ID 또는 자산코드로 자산 상세 정보를 조회합니다.',
    inputSchema: z.object({
      id: z.number().int().optional().describe('자산 ID'),
      asset_code: z.string().optional().describe('자산 코드 (예: AST-2026-001)'),
    }).refine(data => data.id !== undefined || data.asset_code !== undefined, {
      message: 'id 또는 asset_code 중 하나는 필수입니다.',
    }),
  }, async (args) => {
    try {
      const pool = getPool();
      const { id, asset_code } = args;

      let sql = `
        SELECT a.*, c.name as category_name
        FROM assets a
        LEFT JOIN asset_categories c ON a.category_id = c.id
      `;
      let params;

      if (id !== undefined) {
        sql += ' WHERE a.id = ?';
        params = [id];
      } else {
        sql += ' WHERE a.asset_code = ?';
        params = [asset_code];
      }

      const [rows] = await pool.query(sql, params);

      if (rows.length === 0) {
        return { content: [{ type: 'text', text: 'Error: 자산을 찾을 수 없습니다.' }] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(rows[0], null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  });
}
