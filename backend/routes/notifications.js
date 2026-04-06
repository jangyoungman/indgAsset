const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

// SSE 연결 관리 (userId → Set<res>)
const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (set) { set.delete(res); if (set.size === 0) clients.delete(userId); }
}

// 외부에서 호출: 특정 사용자에게 알림 push
function notifyUser(userId) {
  const set = clients.get(userId);
  if (!set) return;
  pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId])
    .then(([result]) => {
      const data = JSON.stringify({ count: result[0].count });
      for (const res of set) {
        res.write(`data: ${data}\n\n`);
      }
    })
    .catch(() => {});
}

// SSE 스트림 엔드포인트
router.get('/stream', authenticate, (req, res) => {
  const userId = req.user.id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx 버퍼링 비활성화
  });

  // 연결 시 즉시 현재 unread count 전송
  pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId])
    .then(([result]) => { res.write(`data: ${JSON.stringify({ count: result[0].count })}\n\n`); })
    .catch(() => {});

  addClient(userId, res);

  // 30초마다 heartbeat (연결 유지)
  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
});

// 내 알림 목록
router.get('/', authenticate, async (req, res) => {
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 읽지 않은 알림 수
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ count: result[0].count });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 알림 읽음 처리
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ message: '알림이 읽음 처리되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 모든 알림 읽음 처리
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ message: '모든 알림이 읽음 처리되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

router.notifyUser = notifyUser;
module.exports = router;
