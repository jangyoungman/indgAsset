import { z } from 'zod';
import { getPool } from '../db.js';
import { checkPermission, getCurrentUser } from '../auth.js';

export function registerCreateAsset(server) {
  server.registerTool('create_asset', {
    title: '자산 등록',
    description: '새로운 자산을 등록합니다. 자산코드는 구매연도 기준으로 자동 생성됩니다. (admin, manager 권한 필요)',
    inputSchema: z.object({
      name: z.string().describe('자산명 (필수)'),
      category: z.string().describe('카테고리명 (필수, 예: 노트북, 모니터, 사무가구, 소프트웨어, 차량, 사무기기)'),
      serial_number: z.string().optional().describe('시리얼 넘버'),
      mac_address: z.string().optional().describe('MAC 주소'),
      manufacturer: z.string().optional().describe('제조사'),
      model: z.string().optional().describe('모델명'),
      purchase_date: z.string().optional().describe('구매일 (YYYY-MM-DD)'),
      purchase_cost: z.number().optional().describe('구매 비용'),
      warranty_expiry: z.string().optional().describe('보증 만료일 (YYYY-MM-DD)'),
      location: z.string().optional().describe('위치'),
      status: z.enum(['available', 'in_use', 'maintenance']).optional().default('available').describe('초기 상태'),
      notes: z.string().optional().describe('비고'),
    }),
  }, async (args) => {
    // 권한 체크: admin, manager만 자산 등록 가능
    const denied = await checkPermission(['admin', 'manager']);
    if (denied) return denied;

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Look up category_id
      const [cats] = await conn.query('SELECT id FROM asset_categories WHERE name = ?', [args.category]);
      if (cats.length === 0) {
        await conn.rollback();
        return { content: [{ type: 'text', text: `Error: 카테고리 '${args.category}'를 찾을 수 없습니다.` }] };
      }
      const categoryId = cats[0].id;

      // Determine year for asset code
      const year = args.purchase_date ? args.purchase_date.substring(0, 4) : new Date().getFullYear().toString();

      // Generate asset_code: AST-{YYYY}-{NNN}
      const [maxRows] = await conn.query(
        "SELECT asset_code FROM assets WHERE asset_code LIKE ? ORDER BY asset_code DESC LIMIT 1",
        [`AST-${year}-%`]
      );
      let nextNum = 1;
      if (maxRows.length > 0) {
        const lastCode = maxRows[0].asset_code;
        const lastNum = parseInt(lastCode.split('-')[2], 10);
        nextNum = lastNum + 1;
      }
      const assetCode = `AST-${year}-${String(nextNum).padStart(3, '0')}`;

      // Build insert
      const fields = {
        asset_code: assetCode,
        name: args.name,
        category_id: categoryId,
        status: args.status,
        created_via: 'mcp',
      };
      const optionalFields = ['serial_number', 'mac_address', 'manufacturer', 'model', 'purchase_date', 'purchase_cost', 'warranty_expiry', 'location', 'notes'];
      for (const f of optionalFields) {
        if (args[f] !== undefined) fields[f] = args[f];
      }

      const columns = Object.keys(fields);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(fields);

      const [result] = await conn.query(
        `INSERT INTO assets (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );

      // Log
      const userId = getCurrentUser()?.id || 0;
      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [result.insertId, userId, 'created', JSON.stringify({ source: 'mcp', name: args.name, asset_code: assetCode })]
      );

      await conn.commit();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: '자산이 등록되었습니다.',
            id: result.insertId,
            asset_code: assetCode,
            name: args.name,
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
