import { getPool } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set, using insecure default. Set JWT_SECRET in .env for production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * 로그인: 이메일+비밀번호 검증 후 JWT 토큰 발급
 */
export async function login(email, password) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, email, name, role, password_hash, is_active, locked_at FROM user_management.users WHERE email = ?',
    [email]
  );

  if (rows.length === 0) {
    return { success: false, message: '존재하지 않는 이메일입니다.' };
  }

  const user = rows[0];

  if (!user.is_active) {
    return { success: false, message: '비활성화된 계정입니다.' };
  }

  if (user.locked_at) {
    return { success: false, message: '잠긴 계정입니다. 관리자에게 문의하세요.' };
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return { success: false, message: '비밀번호가 일치하지 않습니다.' };
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { success: true, user: payload, token };
}

/**
 * 토큰에서 사용자 정보 추출
 */
export function getUserFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 권한 체크 (토큰 기반)
 * @param {string} token - JWT 토큰
 * @param {string[]} allowedRoles - 허용 역할 목록
 * @returns {{ content: Array } | { user: object }} 에러 응답 또는 { user }
 */
export function checkPermission(token, allowedRoles) {
  const user = getUserFromToken(token);

  if (!user) {
    return {
      content: [{
        type: 'text',
        text: 'Error: 로그인이 필요합니다. login 도구로 먼저 로그인해주세요.',
      }],
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      content: [{
        type: 'text',
        text: `Error: 권한이 없습니다. 이 작업은 ${allowedRoles.join(', ')} 권한이 필요합니다. (현재: ${user.role})`,
      }],
    };
  }

  return { user };
}
