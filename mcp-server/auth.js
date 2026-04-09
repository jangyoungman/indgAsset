import { getPool } from './db.js';
import bcrypt from 'bcryptjs';

// 세션 내 로그인된 사용자 정보
let currentUser = null;

/**
 * 로그인: 이메일+비밀번호로 인증 후 세션에 사용자 저장
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

  currentUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  return { success: true, user: currentUser };
}

/**
 * 현재 로그인된 사용자 반환
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * 로그아웃
 */
export function logout() {
  currentUser = null;
}

/**
 * 권한 체크 후 에러 메시지 반환 (통과 시 null)
 * @param {string[]} allowedRoles - 허용 역할 목록
 * @returns {{ content: Array } | null} 에러 응답 또는 null
 */
export function checkPermission(allowedRoles) {
  if (!currentUser) {
    return {
      content: [{
        type: 'text',
        text: 'Error: 로그인이 필요합니다. login 도구로 먼저 로그인해주세요.',
      }],
    };
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return {
      content: [{
        type: 'text',
        text: `Error: 권한이 없습니다. 이 작업은 ${allowedRoles.join(', ')} 권한이 필요합니다. (현재: ${currentUser.role})`,
      }],
    };
  }

  return null;
}
