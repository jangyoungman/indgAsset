import { useState, useEffect } from 'react';
import api from '../utils/api';

// 사용자/부서 목록을 가져와 ID → 이름 매핑을 제공하는 훅
// 모듈 레벨 캐시: 한 세션 동안 한 번만 API 호출
let userCache = null;
let deptCache = null;

export function useLookup() {
  const [users, setUsers] = useState(userCache || []);
  const [departments, setDepartments] = useState(deptCache || []);

  useEffect(() => {
    if (!userCache) {
      api.get('/assets/users')
        .then(res => { userCache = res.data; setUsers(res.data); })
        .catch(() => {});
    }
    if (!deptCache) {
      api.get('/assets/departments')
        .then(res => { deptCache = res.data; setDepartments(res.data); })
        .catch(() => {});
    }
  }, []);

  const userName = (id) => {
    if (!id) return '-';
    const u = users.find(u => u.id === id);
    return u ? u.name : `#${id}`;
  };

  const deptName = (id) => {
    if (!id) return '-';
    const d = departments.find(d => d.id === id);
    return d ? d.name : `#${id}`;
  };

  return { users, departments, userName, deptName };
}
