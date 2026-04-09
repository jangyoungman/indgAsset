import { z } from 'zod';
import { getPool } from '../db.js';

export function registerUpdateAsset(server) {
  server.registerTool('update_asset', {
    title: '자산 정보 수정',
    description: '자산의 정보를 수정합니다. 변경할 필드만 전달하면 됩니다.',
    inputSchema: z.object({
      id: z.number().int().optional().describe('자산 ID'),
      asset_code: z.string().optional().describe('자산 코드'),
      name: z.string().optional().describe('자산명'),
      category: z.string().optional().describe('카테고리명'),
      serial_number: z.string().optional().describe('시리얼 넘버'),
      mac_address: z.string().optional().describe('MAC 주소'),
      manufacturer: z.string().optional().describe('제조사'),
      model: z.string().optional().describe('모델명'),
      purchase_date: z.string().optional().describe('구매일 (YYYY-MM-DD)'),
      purchase_cost: z.number().optional().describe('구매 비용'),
      warranty_expiry: z.string().optional().describe('보증 만료일 (YYYY-MM-DD)'),
      location: z.string().optional().describe('위치'),
      notes: z.string().optional().describe('비고'),
    }).refine(data => data.id !== undefined || data.asset_code !== undefined, {
      message: 'id 또는 asset_code 중 하나는 필수입니다.',
    }),
  }, async (args) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Find existing asset
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

      // Build update fields
      const updates = {};
      const updatableFields = ['name', 'serial_number', 'mac_address', 'manufacturer', 'model', 'purchase_date', 'purchase_cost', 'warranty_expiry', 'location', 'notes'];
      for (const f of updatableFields) {
        if (args[f] !== undefined) updates[f] = args[f];
      }

      // Handle category lookup
      if (args.category !== undefined) {
        const [cats] = await conn.query('SELECT id FROM asset_categories WHERE name = ?', [args.category]);
        if (cats.length === 0) {
          await conn.rollback();
          return { content: [{ type: 'text', text: `Error: 카테고리 '${args.category}'를 찾을 수 없습니다.` }] };
        }
        updates.category_id = cats[0].id;
      }

      if (Object.keys(updates).length === 0) {
        await conn.rollback();
        return { content: [{ type: 'text', text: 'Error: 변경할 필드가 없습니다.' }] };
      }

      // Build SET clause
      const setClauses = Object.keys(updates).map(k => `${k} = ?`);
      const setValues = Object.values(updates);

      await conn.query(
        `UPDATE assets SET ${setClauses.join(', ')} WHERE id = ?`,
        [...setValues, asset.id]
      );

      // Build changes log (before/after)
      const changes = {};
      for (const [key, newVal] of Object.entries(updates)) {
        const oldVal = asset[key];
        if (String(oldVal) !== String(newVal)) {
          changes[key] = { before: oldVal, after: newVal };
        }
      }

      const userId = Number(process.env.MCP_USER_ID) || 0;
      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [asset.id, userId, 'updated', JSON.stringify({ source: 'mcp', changes })]
      );

      await conn.commit();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: '자산 정보가 수정되었습니다.',
            id: asset.id,
            asset_code: asset.asset_code,
            changes,
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
