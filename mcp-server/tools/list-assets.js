import { z } from 'zod';
import { getPool } from '../db.js';

export function registerListAssets(server) {
  server.registerTool('list_assets', {
    title: '자산 목록 조회',
    description: '자산 목록을 조회합니다. 상태, 카테고리, 검색어로 필터링할 수 있습니다.',
    inputSchema: z.object({
      status: z.enum(['available', 'in_use', 'maintenance', 'disposed']).optional().describe('자산 상태 필터'),
      category: z.string().optional().describe('카테고리명 필터 (예: 노트북, 모니터)'),
      search: z.string().optional().describe('자산명, 시리얼넘버, 모델명 검색'),
      include_deleted: z.boolean().optional().default(false).describe('삭제된 자산 포함 여부'),
      page: z.number().int().min(1).optional().default(1).describe('페이지 번호'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('페이지당 항목 수'),
    }),
  }, async (args) => {
    try {
      const pool = getPool();
      const { status, category, search, include_deleted, page, limit } = args;
      const offset = (page - 1) * limit;

      const conditions = [];
      const params = [];

      if (!include_deleted) {
        conditions.push("a.status != 'deleted'");
      }

      if (status) {
        conditions.push('a.status = ?');
        params.push(status);
      }

      if (category) {
        conditions.push('c.name = ?');
        params.push(category);
      }

      if (search) {
        conditions.push('(a.name LIKE ? OR a.serial_number LIKE ? OR a.model LIKE ?)');
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countSql = `SELECT COUNT(*) as total FROM assets a LEFT JOIN asset_categories c ON a.category_id = c.id ${whereClause}`;
      const [[{ total }]] = await pool.query(countSql, params);

      const totalPages = Math.ceil(total / limit);

      const dataSql = `
        SELECT a.*, c.name as category_name
        FROM assets a
        LEFT JOIN asset_categories c ON a.category_id = c.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const [rows] = await pool.query(dataSql, [...params, limit, offset]);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ total, page, totalPages, data: rows }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  });
}
