const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// WireGuard 서버 설정
const WG_SERVER = {
  publicKey: process.env.WG_SERVER_PUBLIC_KEY || 'bJWH2p7N3A/n8qXb/IOjoCFZFKu8B2CIYIFY066e+TY=',
  endpoint: process.env.WG_SERVER_ENDPOINT || '1.231.177.108:51820',
  subnet: '10.0.0',
  dns: '8.8.8.8',
  allowedIPs: '10.0.0.0/24, 192.168.0.0/24',
};

// X25519 키 쌍 생성 (WireGuard 호환)
function generateKeyPair() {
  const pair = crypto.generateKeyPairSync('x25519');
  const privDer = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
  const pubDer = pair.publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKey: privDer.subarray(16).toString('base64'),
    publicKey: pubDer.subarray(12).toString('base64'),
  };
}

// 다음 사용 가능한 IP 할당
async function getNextIP() {
  const [rows] = await pool.query(
    'SELECT ip_address FROM vpn_configs ORDER BY INET_ATON(ip_address) DESC LIMIT 1'
  );
  if (rows.length === 0) return `${WG_SERVER.subnet}.2`;
  const lastOctet = parseInt(rows[0].ip_address.split('.')[3], 10);
  return `${WG_SERVER.subnet}.${lastOctet + 1}`;
}

// 클라이언트 설정 파일 생성
function buildConfig(privateKey, ipAddress) {
  return `[Interface]
PrivateKey = ${privateKey}
Address = ${ipAddress}/32
DNS = ${WG_SERVER.dns}

[Peer]
PublicKey = ${WG_SERVER.publicKey}
Endpoint = ${WG_SERVER.endpoint}
AllowedIPs = ${WG_SERVER.allowedIPs}
PersistentKeepalive = 25
`;
}

// 전체 VPN 목록 (관리자)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, user_name, user_email, public_key, ip_address, is_active, created_at FROM vpn_configs ORDER BY ip_address'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// VPN 인증서 생성 (관리자)
router.post('/generate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { user_id, user_name, user_email } = req.body;
    if (!user_id || !user_name || !user_email) {
      return res.status(400).json({ error: '사용자 정보가 필요합니다.' });
    }

    // 이미 생성된 인증서가 있는지 확인
    const [existing] = await pool.query('SELECT id FROM vpn_configs WHERE user_id = ?', [user_id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: '이미 VPN 인증서가 존재합니다.' });
    }

    const { privateKey, publicKey } = generateKeyPair();
    const ipAddress = await getNextIP();

    await pool.query(
      'INSERT INTO vpn_configs (user_id, user_name, user_email, private_key, public_key, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, user_name, user_email, privateKey, publicKey, ipAddress]
    );

    res.status(201).json({
      message: 'VPN 인증서가 생성되었습니다.',
      publicKey,
      ipAddress,
      // 서버에 추가할 피어 명령어
      serverCommand: `sudo wg set wg0 peer ${publicKey} allowed-ips ${ipAddress}/32`,
      serverConfig: `\n[Peer]\n# ${user_name} (${user_email})\nPublicKey = ${publicKey}\nAllowedIPs = ${ipAddress}/32`,
    });
  } catch (err) {
    console.error('VPN generate error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// VPN 설정파일 다운로드 (본인 또는 관리자)
router.get('/config/:userId', authenticate, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);

    // 본인이거나 관리자만 다운로드 가능
    if (req.user.id !== targetUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM vpn_configs WHERE user_id = ? AND is_active = TRUE',
      [targetUserId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'VPN 인증서가 없습니다.' });
    }

    const vpn = rows[0];
    const config = buildConfig(vpn.private_key, vpn.ip_address);

    res.json({ config, ipAddress: vpn.ip_address, publicKey: vpn.public_key });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// VPN 인증서 삭제 (관리자)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vpn_configs WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '인증서를 찾을 수 없습니다.' });

    await pool.query('DELETE FROM vpn_configs WHERE id = ?', [req.params.id]);

    res.json({
      message: 'VPN 인증서가 삭제되었습니다.',
      // 서버에서 피어 제거 명령어
      serverCommand: `sudo wg set wg0 peer ${rows[0].public_key} remove`,
    });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
