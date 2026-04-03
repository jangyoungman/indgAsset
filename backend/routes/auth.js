const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'http://localhost:8090';

// Auth 서버로 프록시 요청
async function proxyToAuth(path, options = {}) {
  const url = `${AUTH_SERVER_URL}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// 로그인
router.post('/login', async (req, res) => {
  try {
    const result = await proxyToAuth('/api/auth/login', { method: 'POST', body: req.body });
    res.status(result.status).json(result.data);
  } catch (err) {
    console.error('Auth proxy error:', err);
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 로그아웃
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/auth/logout', { method: 'POST', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 토큰 갱신
router.post('/refresh', async (req, res) => {
  try {
    const result = await proxyToAuth('/api/auth/refresh', { method: 'POST', body: req.body });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 현재 사용자 정보
router.get('/me', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/auth/me', { token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 아이디 찾기
router.post('/find-id', async (req, res) => {
  try {
    const result = await proxyToAuth('/api/auth/find-id', { method: 'POST', body: req.body });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 비밀번호 재설정
router.post('/reset-password', async (req, res) => {
  try {
    const result = await proxyToAuth('/api/auth/reset-password', { method: 'POST', body: req.body });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 비밀번호 변경
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/auth/change-password', { method: 'POST', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

module.exports = router;
