const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, isManagerOrAdmin } = require('../middleware/auth');

// 대시보드 통계
router.get('/stats', authenticate, isManagerOrAdmin, async (req, res) => {
  try {
    // 자산 상태별 개수
    const [statusCounts] = await pool.query(
      `SELECT status, COUNT(*) as count FROM assets GROUP BY status`
    );

    // 카테고리별 자산 수
    const [categoryCounts] = await pool.query(
      `SELECT c.name as category, COUNT(a.id) as count
       FROM asset_categories c
       LEFT JOIN assets a ON a.category_id = c.id
       GROUP BY c.id, c.name
       ORDER BY count DESC`
    );

    // 부서별 자산 수
    const [departmentCounts] = await pool.query(
      `SELECT d.name as department, COUNT(a.id) as count
       FROM departments d
       LEFT JOIN assets a ON a.department_id = d.id
       GROUP BY d.id, d.name
       ORDER BY count DESC`
    );

    // 총 자산 가치
    const [totalValue] = await pool.query(
      `SELECT SUM(purchase_cost) as total_value FROM assets WHERE status != 'disposed'`
    );

    // 대기 중인 승인 건수
    const [pendingApprovals] = await pool.query(
      `SELECT COUNT(*) as count FROM approval_workflows WHERE status = 'pending'`
    );

    // 최근 활동 (최근 10건)
    const [recentLogs] = await pool.query(
      `SELECT al.*, a.name as asset_name, a.asset_code, u.name as user_name
       FROM asset_logs al
       JOIN assets a ON al.asset_id = a.id
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 10`
    );

    // 곧 만료되는 보증 (30일 이내)
    const [expiringWarranties] = await pool.query(
      `SELECT id, name, asset_code, warranty_expiry
       FROM assets
       WHERE warranty_expiry IS NOT NULL
         AND warranty_expiry BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         AND status != 'disposed'
       ORDER BY warranty_expiry ASC`
    );

    // 연체된 대여 건
    const [overdueAssignments] = await pool.query(
      `SELECT aa.*, a.name as asset_name, u.name as user_name
       FROM asset_assignments aa
       JOIN assets a ON aa.asset_id = a.id
       JOIN users u ON aa.user_id = u.id
       WHERE aa.status = 'checked_out'
         AND aa.expected_return < CURDATE()
       ORDER BY aa.expected_return ASC`
    );

    res.json({
      statusCounts,
      categoryCounts,
      departmentCounts,
      totalValue: totalValue[0].total_value || 0,
      pendingApprovals: pendingApprovals[0].count,
      recentLogs,
      expiringWarranties,
      overdueAssignments,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 월별 자산 등록 추이 (최근 12개월)
router.get('/trends', authenticate, isManagerOrAdmin, async (req, res) => {
  try {
    const [monthlyAssets] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count
       FROM assets
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month
       ORDER BY month ASC`
    );

    const [monthlyAssignments] = await pool.query(
      `SELECT DATE_FORMAT(request_date, '%Y-%m') as month, COUNT(*) as count
       FROM asset_assignments
       WHERE request_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month
       ORDER BY month ASC`
    );

    res.json({ monthlyAssets, monthlyAssignments });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
