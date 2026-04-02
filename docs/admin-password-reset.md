# admin 계정 비밀번호 재설정

## 개요

- **작업일자:** 2026-04-02
- **대상 시스템:** indgAsset (자산관리시스템)
- **대상 계정:** admin@company.com
- **데이터베이스:** MySQL 8.0 (asset_management)

## 원인

admin@company.com 계정의 비밀번호 분실로 인해 로그인 불가 상태 발생.

## 조치 내용

### 1. 비밀번호 저장 방식 확인

- 비밀번호는 `bcrypt` (salt rounds: 10)로 해시되어 `users` 테이블의 `password_hash` 컬럼에 저장
- 단방향 해시로 기존 비밀번호 복호화 불가

### 2. 비밀번호 재설정 수행

Node.js 스크립트를 통해 새 비밀번호의 bcrypt 해시를 생성하고 DB에 직접 업데이트 처리.

```bash
cd /home/neon/project/indgAsset/backend
node -e "
const bcrypt = require('bcrypt');
const db = require('./config/database');
async function resetPassword() {
  const hash = await bcrypt.hash('이노다임디폴트', 10);
  await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, 'admin@company.com']);
  console.log('비밀번호가 재설정되었습니다.');
  process.exit(0);
}
resetPassword();
"
```

### 3. 결과

- users 테이블의 admin@company.com 계정 비밀번호가 정상적으로 재설정됨
- 변경된 비밀번호: `이노다임디폴트`

## 참고 파일

| 파일 | 설명 |
|------|------|
| `backend/config/schema.sql` | users 테이블 스키마 정의 |
| `backend/config/database.js` | DB 연결 설정 |
| `backend/routes/auth.js` | 인증 및 비밀번호 처리 로직 |

## 비고

- 보안을 위해 로그인 후 즉시 비밀번호 변경 권장
- 계정 잠금(5회 로그인 실패 시) 상태인 경우 `login_fail_count`를 0으로, `locked_at`을 NULL로 초기화 필요
