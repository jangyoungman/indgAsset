const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// 사용자 목록 조회 (관리자 전용)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u.department_id, u.phone, u.is_active,
              u.login_fail_count, u.locked_at, u.created_at, d.name as department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.created_at DESC`
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 사용자 등록 (관리자 전용)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { email, password, name, role, department_id, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, department_id, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hashedPassword, name, role || 'user', department_id, phone]
    );

    res.status(201).json({ id: result.insertId, message: '사용자가 등록되었습니다.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 사용자 수정 (관리자 전용)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, role, department_id, phone, is_active } = req.body;
    await pool.query(
      'UPDATE users SET name = ?, role = ?, department_id = ?, phone = ?, is_active = ? WHERE id = ?',
      [name, role, department_id, phone, is_active, req.params.id]
    );
    res.json({ message: '사용자 정보가 수정되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 계정 잠금 해제 (관리자 전용)
router.put('/:id/unlock', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET login_fail_count = 0, locked_at = NULL WHERE id = ?', [req.params.id]);
    res.json({ message: '계정 잠금이 해제되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 초기화 (관리자 전용) - 임시 비밀번호 생성
router.put('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  try {
    const tempPassword = 'reset' + String(Math.floor(1000 + Math.random() * 9000));
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, login_fail_count = 0, locked_at = NULL, must_change_password = TRUE WHERE id = ?',
      [hashedPassword, req.params.id]
    );
    res.json({ message: '비밀번호가 초기화되었습니다.', tempPassword });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
