const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

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

// 사용자 목록 조회 (관리자 전용)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/users', { token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 사용자 등록 (관리자 전용)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/users', { method: 'POST', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 사용자 수정 (관리자 전용)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth(`/api/users/${req.params.id}`, { method: 'PUT', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 계정 잠금 해제 (관리자 전용)
router.put('/:id/unlock', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth(`/api/users/${req.params.id}/unlock`, { method: 'PUT', token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 비밀번호 초기화 (관리자 전용)
router.put('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth(`/api/users/${req.params.id}/reset-password`, { method: 'PUT', token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 부서 등록 (관리자 전용)
router.post('/departments', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth('/api/departments', { method: 'POST', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

// 부서 수정 (관리자 전용)
router.put('/departments/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const result = await proxyToAuth(`/api/departments/${req.params.id}`, { method: 'PUT', body: req.body, token });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Auth 서버에 연결할 수 없습니다.' });
  }
});

module.exports = router;
