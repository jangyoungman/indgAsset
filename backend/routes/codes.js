const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// 전체 공통코드 조회 (그룹별) — 인증 불필요 (로그인 전에도 사용)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM common_codes ORDER BY group_code, sort_order, code'
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.group_code]) grouped[row.group_code] = [];
      grouped[row.group_code].push(row);
    }
    res.json(grouped);
  } catch (err) {
    console.error('Codes list error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 그룹 코드 조회 (활성만) — 인증 불필요
router.get('/:groupCode', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM common_codes WHERE group_code = ? AND is_active = TRUE ORDER BY sort_order, code',
      [req.params.groupCode]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 코드 추가
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { group_code, code, name, sort_order, description } = req.body;
    if (!group_code || !code || !name) {
      return res.status(400).json({ error: '그룹코드, 코드, 이름은 필수입니다.' });
    }
    const [result] = await pool.query(
      'INSERT INTO common_codes (group_code, code, name, sort_order, description) VALUES (?, ?, ?, ?, ?)',
      [group_code, code, name, sort_order || 0, description || null]
    );
    res.status(201).json({ id: result.insertId, message: '코드가 추가되었습니다.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '이미 존재하는 코드입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 코드 수정
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, sort_order, description } = req.body;
    await pool.query(
      'UPDATE common_codes SET name = ?, sort_order = ?, description = ? WHERE id = ?',
      [name, sort_order ?? 0, description || null, req.params.id]
    );
    res.json({ message: '코드가 수정되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 활성/비활성 토글
router.put('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE common_codes SET is_active = NOT is_active WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: '상태가 변경되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
