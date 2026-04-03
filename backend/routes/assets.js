const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize, isManagerOrAdmin } = require('../middleware/auth');

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'http://localhost:8090';

// 카테고리 목록
router.get('/categories', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM asset_categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 사용자 목록 → Auth 서버 프록시
router.get('/users', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const response = await fetch(`${AUTH_SERVER_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await response.json();
    res.status(response.status).json(users);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 부서 목록 → Auth 서버 프록시
router.get('/departments', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const response = await fetch(`${AUTH_SERVER_URL}/api/departments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const departments = await response.json();
    res.status(response.status).json(departments);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 자산 목록 조회 (필터링/검색/페이지네이션)
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, category_id, department_id, search, page = 1, limit = 20 } = req.query;
    let query = `
      SELECT a.*, c.name as category_name
      FROM assets a
      LEFT JOIN asset_categories c ON a.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND a.status = ?'; params.push(status); }
    if (category_id) { query += ' AND a.category_id = ?'; params.push(category_id); }
    if (department_id) { query += ' AND a.department_id = ?'; params.push(department_id); }
    if (search) {
      query += ' AND (a.name LIKE ? OR a.asset_code LIKE ? OR a.serial_number LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    // 전체 사용자 모든 자산 조회 가능

    // 전체 개수
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // 페이지네이션
    const offset = (page - 1) * limit;
    query += ' ORDER BY a.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [assets] = await pool.query(query, params);

    res.json({
      data: assets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Assets list error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 자산 상세 조회
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [assets] = await pool.query(
      `SELECT a.*, c.name as category_name
       FROM assets a
       LEFT JOIN asset_categories c ON a.category_id = c.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (assets.length === 0) return res.status(404).json({ error: '자산을 찾을 수 없습니다.' });
    res.json(assets[0]);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 자산 등록 (관리자/부서장)
router.post('/', authenticate, isManagerOrAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      name, category_id, description, serial_number, mac_address,
      manufacturer, model, purchase_date, purchase_cost,
      warranty_expiry, location, department_id, assigned_to, notes
    } = req.body;

    // 자산 코드 자동 생성: AST-YYYY-NNN (구매일 기준, 없으면 오늘)
    const baseDate = purchase_date ? new Date(purchase_date) : new Date();
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

    const status = assigned_to ? 'in_use' : 'available';
    const [result] = await conn.query(
      `INSERT INTO assets
       (asset_code, name, category_id, description, serial_number, mac_address, manufacturer, model,
        purchase_date, purchase_cost, warranty_expiry, location, department_id, assigned_to, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [asset_code, name, category_id, description, serial_number, mac_address, manufacturer, model,
       purchase_date, purchase_cost, warranty_expiry, location, department_id, assigned_to || null, status, notes]
    );

    // 이력 로그
    await conn.query(
      'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [result.insertId, req.user.id, 'created', JSON.stringify({ name, asset_code })]
    );

    await conn.commit();
    res.status(201).json({ id: result.insertId, message: '자산이 등록되었습니다.' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '중복된 자산 코드입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 자산 일괄 등록 (관리자 전용)
router.post('/bulk', authenticate, authorize('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ success: false, errors: [{ row: 0, field: 'assets', message: '등록할 자산 데이터가 없습니다.' }] });
    }

    if (assets.length > 200) {
      return res.status(400).json({ success: false, errors: [{ row: 0, field: 'assets', message: '한 번에 최대 200건까지 등록할 수 있습니다.' }] });
    }

    // 카테고리, 부서, 사용자 목록 조회
    const [categories] = await conn.query('SELECT id, name FROM asset_categories');
    const categoryMap = new Map(categories.map(c => [c.name, c.id]));

    // Auth 서버에서 부서/사용자 목록 가져오기
    const token = req.headers.authorization?.split(' ')[1];
    let deptMap = new Map();
    let userMap = new Map();
    try {
      const [deptRes, userRes] = await Promise.all([
        fetch(`${AUTH_SERVER_URL}/api/departments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${AUTH_SERVER_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const departments = await deptRes.json();
      const users = await userRes.json();
      if (Array.isArray(departments)) {
        deptMap = new Map(departments.map(d => [d.name, d.id]));
      }
      if (Array.isArray(users)) {
        userMap = new Map(users.map(u => [u.name, u.id]));
      }
    } catch (e) {
      // Auth 서버 연결 실패 시 부서/사용자 매핑 불가
    }

    // 기존 serial_number 목록 조회
    const [existingSerials] = await conn.query('SELECT serial_number FROM assets WHERE serial_number IS NOT NULL');
    const existingSerialSet = new Set(existingSerials.map(r => r.serial_number));

    // 2차 검증
    const errors = [];
    const newSerials = new Set();

    for (let i = 0; i < assets.length; i++) {
      const row = i + 1;
      const asset = assets[i];

      if (!asset.name || !asset.name.trim()) {
        errors.push({ row, field: 'name', message: '자산명은 필수입니다.' });
      }
      if (!asset.category || !String(asset.category).trim()) {
        errors.push({ row, field: 'category', message: '카테고리는 필수입니다.' });
      } else if (!categoryMap.has(asset.category)) {
        errors.push({ row, field: 'category', message: `존재하지 않는 카테고리: ${asset.category}` });
      }
      if (asset.department && !deptMap.has(asset.department)) {
        errors.push({ row, field: 'department', message: `존재하지 않는 부서: ${asset.department}` });
      }
      if (asset.assigned_to && !userMap.has(asset.assigned_to)) {
        errors.push({ row, field: 'assigned_to', message: `존재하지 않는 사용자: ${asset.assigned_to}` });
      }
      if (asset.serial_number) {
        if (existingSerialSet.has(asset.serial_number)) {
          errors.push({ row, field: 'serial_number', message: `이미 등록된 시리얼넘버: ${asset.serial_number}` });
        }
        if (newSerials.has(asset.serial_number)) {
          errors.push({ row, field: 'serial_number', message: `엑셀 내 중복 시리얼넘버: ${asset.serial_number}` });
        }
        newSerials.add(asset.serial_number);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 트랜잭션으로 일괄 등록
    const results = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      // 자산 코드 생성
      const baseDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date();
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

      const category_id = categoryMap.get(asset.category) || null;
      const department_id = asset.department ? deptMap.get(asset.department) || null : null;
      const assigned_to = asset.assigned_to ? userMap.get(asset.assigned_to) || null : null;
      const status = assigned_to ? 'in_use' : 'available';

      const [result] = await conn.query(
        `INSERT INTO assets
         (asset_code, name, category_id, description, serial_number, mac_address, manufacturer, model,
          purchase_date, purchase_cost, warranty_expiry, location, department_id, assigned_to, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [asset_code, asset.name, category_id, asset.description || null,
         asset.serial_number || null, asset.mac_address || null,
         asset.manufacturer || null, asset.model || null,
         asset.purchase_date || null, asset.purchase_cost || null,
         asset.warranty_expiry || null, asset.location || null,
         department_id, assigned_to, status, asset.notes || null]
      );

      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [result.insertId, req.user.id, 'created', JSON.stringify({ name: asset.name, asset_code, bulk_import: true })]
      );

      results.push({ row: i + 1, asset_code, name: asset.name });
    }

    await conn.commit();
    res.status(201).json({ success: true, created: results.length, results });
  } catch (err) {
    await conn.rollback();
    console.error('Bulk import error:', err);
    res.status(500).json({ success: false, errors: [{ row: 0, field: 'server', message: '서버 오류가 발생했습니다.' }] });
  } finally {
    conn.release();
  }
});

// 자산 수정 (관리자/부서장)
router.put('/:id', authenticate, isManagerOrAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const fields = req.body;
    const setClauses = [];
    const values = [];

    const allowedFields = [
      'name', 'category_id', 'description', 'serial_number', 'mac_address', 'manufacturer',
      'model', 'purchase_date', 'purchase_cost', 'warranty_expiry',
      'location', 'status', 'department_id', 'assigned_to', 'notes'
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(fields[field]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: '수정할 항목이 없습니다.' });
    }

    values.push(req.params.id);
    await conn.query(`UPDATE assets SET ${setClauses.join(', ')} WHERE id = ?`, values);

    await conn.query(
      'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'updated', JSON.stringify(fields)]
    );

    await conn.commit();
    res.json({ message: '자산 정보가 수정되었습니다.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 자산 일괄 삭제 (관리자 전용 - disposed 처리) — /:id 보다 먼저 정의해야 함
router.delete('/bulk', authenticate, authorize('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '삭제할 자산을 선택하세요.' });
    }

    await conn.beginTransaction();

    const placeholders = ids.map(() => '?').join(',');
    await conn.query(`UPDATE assets SET status = 'disposed' WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [id, req.user.id, 'disposed', JSON.stringify({ bulk_dispose: true })]
      );
    }

    await conn.commit();
    res.json({ message: `${ids.length}건의 자산이 폐기 처리되었습니다.` });
  } catch (err) {
    await conn.rollback();
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 자산 삭제 (관리자 전용 - 실제로는 disposed 처리)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE assets SET status = 'disposed' WHERE id = ?", [req.params.id]);
    await conn.query(
      'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, 'disposed', JSON.stringify({ reason: req.body.reason })]
    );
    await conn.commit();
    res.json({ message: '자산이 폐기 처리되었습니다.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 자산 이력 조회
router.get('/:id/logs', authenticate, async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT al.*
       FROM asset_logs al
       WHERE al.asset_id = ?
       ORDER BY al.created_at DESC`,
      [req.params.id]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
