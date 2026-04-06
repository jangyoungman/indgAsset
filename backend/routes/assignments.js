const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, isManagerOrAdmin } = require('../middleware/auth');
const { notifyUser } = require('./notifications');
const { sendRequestNotification, sendApprovalNotification } = require('../config/mailer');

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'http://localhost:8090';

// 대여 요청 (일반 사용자)
router.post('/request', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { asset_id, expected_return, request_note } = req.body;

    // 자산 상태 확인
    const [assets] = await conn.query('SELECT * FROM assets WHERE id = ? AND status = ?', [asset_id, 'available']);
    if (assets.length === 0) {
      return res.status(400).json({ error: '대여 가능한 자산이 아닙니다.' });
    }

    // 대여 기록 생성
    const [result] = await conn.query(
      `INSERT INTO asset_assignments (asset_id, user_id, expected_return, request_note)
       VALUES (?, ?, ?, ?)`,
      [asset_id, req.user.id, expected_return, request_note]
    );

    // 승인 워크플로우 생성
    await conn.query(
      `INSERT INTO approval_workflows (action_type, reference_id, requester_id, request_note)
       VALUES ('asset_request', ?, ?, ?)`,
      [result.insertId, req.user.id, request_note]
    );

    await conn.commit();

    // 관리자에게 대여 요청 이메일 발송 (비동기, 응답 차단하지 않음)
    const asset = assets[0];
    const token = req.headers.authorization?.split(' ')[1];
    sendRequestNotification({
      requesterName: req.user.name,
      assetName: asset.name,
      assetCode: asset.asset_code,
      expectedReturn: expected_return,
      requestNote: request_note,
      token,
    });

    res.status(201).json({ id: result.insertId, message: '대여 요청이 접수되었습니다.' });
  } catch (err) {
    await conn.rollback();
    console.error('Assignment request error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 대여 승인/거절 (관리자/부서장)
router.put('/:id/approve', authenticate, isManagerOrAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { status, response_note } = req.body; // 'approved' or 'rejected'

    const [assignments] = await conn.query('SELECT * FROM asset_assignments WHERE id = ?', [req.params.id]);
    if (assignments.length === 0) {
      return res.status(404).json({ error: '대여 기록을 찾을 수 없습니다.' });
    }

    const assignment = assignments[0];

    if (status === 'approved') {
      // 자산 상태를 사용 중으로 변경
      await conn.query(
        "UPDATE assets SET status = 'in_use', assigned_to = ? WHERE id = ?",
        [assignment.user_id, assignment.asset_id]
      );
      await conn.query(
        "UPDATE asset_assignments SET status = 'checked_out', approved_by = ?, approved_date = NOW(), checkout_date = NOW() WHERE id = ?",
        [req.user.id, req.params.id]
      );
    } else {
      await conn.query(
        "UPDATE asset_assignments SET status = 'rejected', approved_by = ?, approved_date = NOW() WHERE id = ?",
        [req.user.id, req.params.id]
      );
    }

    // 워크플로우 업데이트
    await conn.query(
      'UPDATE approval_workflows SET status = ?, approver_id = ?, response_note = ?, resolved_at = NOW() WHERE reference_id = ? AND action_type = ?',
      [status, req.user.id, response_note, req.params.id, 'asset_request']
    );

    // 요청자에게 알림
    const statusText = status === 'approved' ? '승인' : '거절';
    await conn.query(
      'INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, ?)',
      [assignment.user_id, `자산 대여 ${statusText}`, `자산 대여 요청이 ${statusText}되었습니다.`, `/assignments/${req.params.id}`]
    );
    // SSE push
    notifyUser(assignment.user_id);

    // 이력 로그
    await conn.query(
      'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [assignment.asset_id, req.user.id, status === 'approved' ? 'assigned' : 'request_rejected',
       JSON.stringify({ assignment_id: req.params.id, response_note })]
    );

    // 자산 정보 조회 (이메일용)
    const [assetRows] = await conn.query('SELECT name, asset_code FROM assets WHERE id = ?', [assignment.asset_id]);

    await conn.commit();

    // 요청자에게 승인/거절 이메일 발송 (비동기)
    const token = req.headers.authorization?.split(' ')[1];
    try {
      const userRes = await fetch(`${AUTH_SERVER_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      const users = await userRes.json();
      const requester = Array.isArray(users) ? users.find(u => u.id === assignment.user_id) : null;
      if (requester && assetRows[0]) {
        sendApprovalNotification({
          requesterEmail: requester.email,
          requesterName: requester.name,
          assetName: assetRows[0].name,
          assetCode: assetRows[0].asset_code,
          status,
          responseNote: response_note,
        });
      }
    } catch (e) { console.error('[Mail] 사용자 조회 실패:', e.message); }

    res.json({ message: `대여 요청이 ${statusText}되었습니다.` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 반납 처리
router.put('/:id/return', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { return_note } = req.body;

    const [assignments] = await conn.query('SELECT * FROM asset_assignments WHERE id = ?', [req.params.id]);
    if (assignments.length === 0) return res.status(404).json({ error: '대여 기록을 찾을 수 없습니다.' });

    const assignment = assignments[0];

    // 본인 것만 반납 가능 (관리자는 모두 가능)
    if (req.user.role === 'user' && assignment.user_id !== req.user.id) {
      return res.status(403).json({ error: '본인의 대여 건만 반납할 수 있습니다.' });
    }

    await conn.query(
      "UPDATE assets SET status = 'available', assigned_to = NULL WHERE id = ?",
      [assignment.asset_id]
    );
    await conn.query(
      "UPDATE asset_assignments SET status = 'returned', actual_return = NOW(), return_note = ? WHERE id = ?",
      [return_note, req.params.id]
    );

    await conn.query(
      'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [assignment.asset_id, req.user.id, 'returned', JSON.stringify({ assignment_id: req.params.id, return_note })]
    );

    await conn.commit();
    res.json({ message: '반납 처리가 완료되었습니다.' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  } finally {
    conn.release();
  }
});

// 대여 목록 조회
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = `
      SELECT aa.*, a.name as asset_name, a.asset_code
      FROM asset_assignments aa
      JOIN assets a ON aa.asset_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND aa.status = ?'; params.push(status); }

    // 일반 사용자: 본인 것만
    if (req.user.role === 'user') {
      query += ' AND aa.user_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY aa.request_date DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (page - 1) * limit);

    const [assignments] = await pool.query(query, params);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
