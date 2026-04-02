const jwt = require('jsonwebtoken');

// JWT 인증 미들웨어 (Auth 서버와 동일한 JWT_SECRET으로 자체 검증)
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Auth 서버 토큰 형식에 맞게 매핑
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      department_id: decoded.departmentId || decoded.department_id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// 역할 기반 접근 제어 미들웨어
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    next();
  };
};

// 부서장 이상 권한 확인
const isManagerOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: '부서장 이상의 권한이 필요합니다.' });
  }
  next();
};

module.exports = { authenticate, authorize, isManagerOrAdmin };
