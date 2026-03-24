const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

// 로그인
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    let users;
    if (email && !email.includes('@')) {
      // @ 없으면 이메일 앞부분으로 LIKE 검색
      [users] = await pool.query(
        'SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.email LIKE ? AND u.is_active = TRUE',
        [`${email}@%`]
      );
    } else {
      [users] = await pool.query(
        'SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.email = ? AND u.is_active = TRUE',
        [email]
      );
    }

    if (users.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = users[0];

    // 계정 잠금 확인
    if (user.login_fail_count >= 5) {
      return res.status(403).json({ error: '로그인 실패 5회 초과로 계정이 잠겼습니다. 관리자에게 문의하세요.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // 실패 횟수 증가
      const newCount = (user.login_fail_count || 0) + 1;
      const lockUpdate = newCount >= 5 ? ', locked_at = NOW()' : '';
      await pool.query(
        `UPDATE users SET login_fail_count = ?${lockUpdate} WHERE id = ?`,
        [newCount, user.id]
      );
      const remaining = 5 - newCount;
      if (remaining <= 0) {
        return res.status(403).json({ error: '로그인 실패 5회 초과로 계정이 잠겼습니다. 관리자에게 문의하세요.' });
      }
      return res.status(401).json({ error: `아이디 또는 비밀번호가 올바르지 않습니다. (실패 ${newCount}회 / 5회 초과 시 잠금)` });
    }

    // 로그인 성공: 실패 횟수 초기화
    await pool.query('UPDATE users SET login_fail_count = 0, locked_at = NULL WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, department_id: user.department_id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department_id: user.department_id,
        department_name: user.department_name,
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 현재 사용자 정보
router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT u.id, u.email, u.name, u.role, u.department_id, u.phone, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?',
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 아이디 찾기 (이름 + 연락처)
router.post('/find-id', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: '이름과 연락처를 모두 입력해주세요.' });
    }
    const [users] = await pool.query(
      "SELECT email FROM users WHERE name = ? AND REPLACE(REPLACE(phone, '-', ''), ' ', '') = ? AND is_active = TRUE",
      [name, phone.replace(/[^0-9]/g, '')]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: '일치하는 사용자를 찾을 수 없습니다.' });
    }
    // 이메일 마스킹: ad***@company.com
    const email = users[0].email;
    const [localPart, domain] = email.split('@');
    const masked = localPart.length <= 2
      ? localPart[0] + '***'
      : localPart.slice(0, 2) + '***';
    res.json({ email: `${masked}@${domain}` });
  } catch (err) {
    console.error('Find ID error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 찾기 (본인 인증 후 새 비밀번호 설정)
router.post('/reset-password', async (req, res) => {
  try {
    const { name, phone, newPassword } = req.body;
    if (!name || !phone || !newPassword) {
      return res.status(400).json({ error: '이름, 연락처, 새 비밀번호를 모두 입력해주세요.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
    }
    const [users] = await pool.query(
      "SELECT id FROM users WHERE name = ? AND REPLACE(REPLACE(phone, '-', ''), ' ', '') = ? AND is_active = TRUE",
      [name, phone.replace(/[^0-9]/g, '')]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: '일치하는 사용자를 찾을 수 없습니다.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, login_fail_count = 0, locked_at = NULL, must_change_password = FALSE WHERE id = ?',
      [hashedPassword, users[0].id]
    );
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 비밀번호 변경 (로그인 후 본인)
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다.' });
    }
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?',
      [hashedPassword, req.user.id]
    );
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
