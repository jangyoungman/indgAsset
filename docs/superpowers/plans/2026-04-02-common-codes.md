# 공통코드 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하드코딩된 코드성 데이터를 DB 공통코드 테이블로 관리하고, 관리자 화면에서 CRUD 가능하게 구현

**Architecture:** MySQL에 common_codes 테이블 생성 → Express API 추가 → React Context로 전역 제공 → 기존 하드코딩 대체 → 관리 페이지 추가

**Tech Stack:** Express.js, MySQL (mysql2), React 18, Tailwind CSS

---

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `backend/config/schema.sql` | 수정 | common_codes 테이블 DDL + 초기 데이터 |
| `backend/routes/codes.js` | 신규 | 공통코드 CRUD API |
| `backend/app.js` | 수정 | codes 라우트 등록 |
| `frontend/src/contexts/CodeContext.jsx` | 신규 | 공통코드 전역 Context |
| `frontend/src/pages/CodeManagement.jsx` | 신규 | 공통코드 관리 페이지 |
| `frontend/src/App.jsx` | 수정 | CodeProvider 래핑, 라우트 추가 |
| `frontend/src/components/Layout.jsx` | 수정 | 시스템 설정 메뉴 추가 |
| `frontend/src/pages/AssetList.jsx` | 수정 | useCode() 적용 |
| `frontend/src/pages/AssetDetail.jsx` | 수정 | useCode() 적용 |
| `frontend/src/pages/Dashboard.jsx` | 수정 | useCode() 적용 |
| `frontend/src/pages/UserList.jsx` | 수정 | useCode() 적용 |

---

### Task 1: DB 테이블 생성 및 초기 데이터

**Files:**
- Modify: `backend/config/schema.sql`

- [ ] **Step 1: EC2 MySQL에서 common_codes 테이블 생성 및 초기 데이터 삽입**

SSH로 EC2에 접속하여 MySQL에서 실행:

```sql
CREATE TABLE IF NOT EXISTS common_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  group_code  VARCHAR(50)  NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  description VARCHAR(200),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_group_code (group_code, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO common_codes (group_code, code, name, sort_order, description) VALUES
('ASSET_STATUS', 'available', '사용 가능', 1, 'bg-emerald-50 text-emerald-700'),
('ASSET_STATUS', 'in_use', '사용 중', 2, 'bg-blue-50 text-blue-700'),
('ASSET_STATUS', 'maintenance', '정비 중', 3, 'bg-amber-50 text-amber-700'),
('ASSET_STATUS', 'disposed', '폐기', 4, 'bg-gray-100 text-gray-500'),
('USER_ROLE', 'admin', '관리자', 1, 'bg-red-50 text-red-700'),
('USER_ROLE', 'manager', '부서장', 2, 'bg-indigo-50 text-indigo-700'),
('USER_ROLE', 'user', '사용자', 3, 'bg-gray-100 text-gray-600'),
('ASSIGN_STATUS', 'requested', '요청', 1, 'bg-amber-50 text-amber-700'),
('ASSIGN_STATUS', 'approved', '승인', 2, 'bg-emerald-50 text-emerald-700'),
('ASSIGN_STATUS', 'rejected', '반려', 3, 'bg-red-50 text-red-700'),
('ASSIGN_STATUS', 'checked_out', '대여중', 4, 'bg-blue-50 text-blue-700'),
('ASSIGN_STATUS', 'returned', '반납', 5, 'bg-gray-100 text-gray-500'),
('APPROVAL_STATUS', 'pending', '대기', 1, 'bg-amber-50 text-amber-700'),
('APPROVAL_STATUS', 'approved', '승인', 2, 'bg-emerald-50 text-emerald-700'),
('APPROVAL_STATUS', 'rejected', '반려', 3, 'bg-red-50 text-red-700'),
('LOG_ACTION', 'created', '등록', 1, 'bg-emerald-500'),
('LOG_ACTION', 'updated', '수정', 2, 'bg-blue-500'),
('LOG_ACTION', 'assigned', '배정', 3, 'bg-indigo-500'),
('LOG_ACTION', 'returned', '반납', 4, 'bg-amber-500'),
('LOG_ACTION', 'disposed', '폐기', 5, 'bg-red-500');
```

- [ ] **Step 2: schema.sql에도 동일 내용 추가 (문서 용도)**

`backend/config/schema.sql` 파일 맨 끝에 위 SQL 추가.

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add backend/config/schema.sql
git commit -m "feat: add common_codes table with initial data"
```

---

### Task 2: 백엔드 공통코드 API

**Files:**
- Create: `backend/routes/codes.js`
- Modify: `backend/app.js`

- [ ] **Step 1: codes.js 라우트 생성**

```javascript
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

// 전체 공통코드 조회 (그룹별)
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM common_codes ORDER BY group_code, sort_order, code'
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.group_code]) grouped[row.group_code] = [];
      grouped[row.group_code].push(row);
    }
    res.json(grouped);
  } catch (err) {
    console.error('Codes list error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 특정 그룹 코드 조회 (활성만)
router.get('/:groupCode', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM common_codes WHERE group_code = ? AND is_active = TRUE ORDER BY sort_order, code',
      [req.params.groupCode]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 코드 추가
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { group_code, code, name, sort_order, description } = req.body;
    if (!group_code || !code || !name) {
      return res.status(400).json({ error: '그룹코드, 코드, 이름은 필수입니다.' });
    }
    const [result] = await pool.query(
      'INSERT INTO common_codes (group_code, code, name, sort_order, description) VALUES (?, ?, ?, ?, ?)',
      [group_code, code, name, sort_order || 0, description || null]
    );
    res.status(201).json({ id: result.insertId, message: '코드가 추가되었습니다.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '이미 존재하는 코드입니다.' });
    }
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 코드 수정
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, sort_order, description } = req.body;
    await pool.query(
      'UPDATE common_codes SET name = ?, sort_order = ?, description = ? WHERE id = ?',
      [name, sort_order ?? 0, description || null, req.params.id]
    );
    res.json({ message: '코드가 수정되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 활성/비활성 토글
router.put('/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE common_codes SET is_active = NOT is_active WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: '상태가 변경되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: app.js에 라우트 등록**

`backend/app.js` 상단 require에 추가:

```javascript
const codeRoutes = require('./routes/codes');
```

API 라우트 섹션에 추가:

```javascript
app.use('/api/codes', codeRoutes);
```

- [ ] **Step 3: 문법 확인**

```bash
cd /home/neon/project/indgAsset/backend && node -e "require('./routes/codes')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /home/neon/project/indgAsset
git add backend/routes/codes.js backend/app.js
git commit -m "feat: add common codes CRUD API"
```

---

### Task 3: CodeContext 생성

**Files:**
- Create: `frontend/src/contexts/CodeContext.jsx`

- [ ] **Step 1: CodeContext.jsx 생성**

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const CodeContext = createContext(null);

export function CodeProvider({ children }) {
  const [codes, setCodes] = useState({});
  const [loaded, setLoaded] = useState(false);

  const fetchCodes = useCallback(() => {
    api.get('/codes')
      .then(res => setCodes(res.data))
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const getCodeName = useCallback((groupCode, code) => {
    const list = codes[groupCode];
    if (!list) return code;
    const found = list.find(c => c.code === code);
    return found ? found.name : code;
  }, [codes]);

  const getCodeColor = useCallback((groupCode, code) => {
    const list = codes[groupCode];
    if (!list) return '';
    const found = list.find(c => c.code === code);
    return found?.description || '';
  }, [codes]);

  const getCodeList = useCallback((groupCode, activeOnly = true) => {
    const list = codes[groupCode] || [];
    if (activeOnly) return list.filter(c => c.is_active);
    return list;
  }, [codes]);

  return (
    <CodeContext.Provider value={{ codes, loaded, getCodeName, getCodeColor, getCodeList, refreshCodes: fetchCodes }}>
      {children}
    </CodeContext.Provider>
  );
}

export function useCode() {
  const ctx = useContext(CodeContext);
  if (!ctx) {
    return {
      codes: {},
      loaded: false,
      getCodeName: (g, c) => c,
      getCodeColor: () => '',
      getCodeList: () => [],
      refreshCodes: () => {},
    };
  }
  return ctx;
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/contexts/CodeContext.jsx
git commit -m "feat: add CodeContext for global common code access"
```

---

### Task 4: App.jsx에 CodeProvider 래핑 및 라우트 추가

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: import 추가**

```jsx
import { CodeProvider } from './contexts/CodeContext';
import CodeManagement from './pages/CodeManagement';
```

- [ ] **Step 2: AuthProvider 안에 CodeProvider 래핑**

`<AuthProvider>` 바로 안에 `<CodeProvider>`를 추가:

```jsx
export default function App() {
  return (
    <AuthProvider>
      <CodeProvider>
        <BrowserRouter>
          ...
        </BrowserRouter>
      </CodeProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 3: 라우트 추가**

`users` 라우트 뒤에 추가:

```jsx
<Route path="system/codes" element={
  <PrivateRoute roles={['admin']}>
    <CodeManagement />
  </PrivateRoute>
} />
```

- [ ] **Step 4: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/App.jsx
git commit -m "feat: add CodeProvider and /system/codes route"
```

---

### Task 5: Layout.jsx에 시스템 설정 메뉴 추가

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: icons 객체에 settings 아이콘 추가**

icons 객체 안에 추가:

```jsx
settings: (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 13C11.6569 13 13 11.6569 13 10C13 8.34315 11.6569 7 10 7C8.34315 7 7 8.34315 7 10C7 11.6569 8.34315 13 10 13Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
),
```

- [ ] **Step 2: navItems에 시스템 설정 메뉴 추가**

navItems 배열 맨 끝에 추가:

```javascript
{ to: '/system/codes', label: '공통코드 관리', icon: icons.settings, roles: ['admin'] },
```

- [ ] **Step 3: ROLE_LABELS 하드코딩 제거 후 useCode 사용**

import에 추가:

```jsx
import { useCode } from '../contexts/CodeContext';
```

컴포넌트 안에 추가:

```jsx
const { getCodeName } = useCode();
```

기존 `ROLE_LABELS[user.role]` 을 `getCodeName('USER_ROLE', user.role)` 로 변경.

파일 상단의 `const ROLE_LABELS = ...` 상수 제거.

- [ ] **Step 4: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/components/Layout.jsx
git commit -m "feat: add system settings menu, replace hardcoded ROLE_LABELS"
```

---

### Task 6: CodeManagement.jsx 관리 페이지

**Files:**
- Create: `frontend/src/pages/CodeManagement.jsx`

- [ ] **Step 1: CodeManagement.jsx 생성**

```jsx
import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useCode } from '../contexts/CodeContext';

const GROUP_LABELS = {
  ASSET_STATUS: '자산 상태',
  USER_ROLE: '사용자 역할',
  ASSIGN_STATUS: '대여 상태',
  APPROVAL_STATUS: '승인 상태',
  LOG_ACTION: '이력 액션',
};

export default function CodeManagement() {
  const { refreshCodes } = useCode();
  const [codes, setCodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ group_code: '', code: '', name: '', sort_order: 0, description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCodes = () => {
    setLoading(true);
    api.get('/codes')
      .then(res => {
        setCodes(res.data);
        if (!activeGroup && Object.keys(res.data).length > 0) {
          setActiveGroup(Object.keys(res.data)[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCodes(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ group_code: activeGroup, code: '', name: '', sort_order: 0, description: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ group_code: item.group_code, code: item.code, name: item.name, sort_order: item.sort_order, description: item.description || '' });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/codes/${editItem.id}`, { name: form.name, sort_order: Number(form.sort_order), description: form.description });
      } else {
        await api.post('/codes', { ...form, sort_order: Number(form.sort_order) });
      }
      setShowModal(false);
      fetchCodes();
      refreshCodes();
    } catch (err) {
      setError(err.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item) => {
    try {
      await api.put(`/codes/${item.id}/toggle`);
      fetchCodes();
      refreshCodes();
    } catch (err) {
      console.error(err);
    }
  };

  const groups = Object.keys(codes);
  const currentCodes = codes[activeGroup] || [];

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5';

  if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">공통코드 관리</h1>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          + 코드 추가
        </button>
      </div>

      <div className="flex gap-6">
        {/* 왼쪽: 그룹 목록 */}
        <div className="w-52 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {groups.map(group => (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition ${
                  activeGroup === group
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {GROUP_LABELS[group] || group}
                <span className="ml-2 text-xs text-gray-400">({codes[group]?.length || 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 오른쪽: 코드 테이블 */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">코드</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">이름</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">순서</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">스타일</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">상태</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {currentCodes.map(item => (
                  <tr key={item.id} className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 text-sm font-mono text-gray-700">{item.code}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{item.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{item.sort_order}</td>
                    <td className="px-5 py-3.5">
                      {item.description && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.description}`}>
                          미리보기
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => handleToggle(item)}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.is_active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => openEdit(item)} className="text-indigo-600 hover:underline text-sm">수정</button>
                    </td>
                  </tr>
                ))}
                {currentCodes.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-8 text-gray-400">코드가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editItem ? '코드 수정' : '코드 추가'}</h2>
            {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>그룹</label>
                <input value={GROUP_LABELS[form.group_code] || form.group_code} className={`${inputClass} bg-gray-50 text-gray-500`} disabled />
              </div>
              <div>
                <label className={labelClass}>코드 *</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className={`${inputClass} ${editItem ? 'bg-gray-50 text-gray-500' : ''}`}
                  required
                  disabled={!!editItem}
                  placeholder="영문_소문자"
                />
              </div>
              <div>
                <label className={labelClass}>이름 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} required placeholder="표시될 이름" />
              </div>
              <div>
                <label className={labelClass}>순서</label>
                <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>스타일 (CSS 클래스)</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputClass} placeholder="bg-emerald-50 text-emerald-700" />
                {form.description && (
                  <div className="mt-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${form.description}`}>미리보기</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                  취소
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/CodeManagement.jsx
git commit -m "feat: add CodeManagement admin page"
```

---

### Task 7: 기존 페이지에 useCode() 적용 — AssetList.jsx

**Files:**
- Modify: `frontend/src/pages/AssetList.jsx`

- [ ] **Step 1: import 추가, 하드코딩 제거**

import에 추가:

```jsx
import { useCode } from '../contexts/CodeContext';
```

컴포넌트 안에 추가:

```jsx
const { getCodeName, getCodeColor, getCodeList } = useCode();
```

파일 상단의 `const STATUS_LABELS = { ... }` 와 `const STATUS_COLORS = { ... }` 상수 삭제.

- [ ] **Step 2: STATUS_LABELS 사용처 대체**

- 필터 드롭다운의 `Object.entries(STATUS_LABELS)` → `getCodeList('ASSET_STATUS').map(c => ({ code: c.code, name: c.name }))`
- 테이블 상태 배지의 `STATUS_LABELS[a.status]` → `getCodeName('ASSET_STATUS', a.status)`
- 테이블 상태 배지의 `STATUS_COLORS[a.status]` → `getCodeColor('ASSET_STATUS', a.status)`
- 정렬 비교의 `STATUS_LABELS[a.status]` → `getCodeName('ASSET_STATUS', a.status)`

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/AssetList.jsx
git commit -m "refactor: replace hardcoded STATUS_LABELS/COLORS with useCode in AssetList"
```

---

### Task 8: 기존 페이지에 useCode() 적용 — AssetDetail.jsx

**Files:**
- Modify: `frontend/src/pages/AssetDetail.jsx`

- [ ] **Step 1: import 추가, 하드코딩 제거**

import에 추가:

```jsx
import { useCode } from '../contexts/CodeContext';
```

컴포넌트 안에 추가:

```jsx
const { getCodeName, getCodeColor, getCodeList } = useCode();
```

파일 상단의 `const STATUS_LABELS`, `const STATUS_COLORS`, `const ACTION_COLORS` 상수 삭제.

- [ ] **Step 2: 사용처 대체**

- 상태 드롭다운의 `Object.entries(STATUS_LABELS)` → `getCodeList('ASSET_STATUS')`
- 상태 배지의 `STATUS_LABELS[asset.status]` → `getCodeName('ASSET_STATUS', asset.status)`
- 상태 배지의 `STATUS_COLORS[asset.status]` → `getCodeColor('ASSET_STATUS', asset.status)`
- 이력 로그의 `ACTION_COLORS[log.action]` → `getCodeColor('LOG_ACTION', log.action)`
- 이력 로그의 `log.action` 텍스트 → `getCodeName('LOG_ACTION', log.action)`

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/AssetDetail.jsx
git commit -m "refactor: replace hardcoded labels/colors with useCode in AssetDetail"
```

---

### Task 9: 기존 페이지에 useCode() 적용 — Dashboard.jsx

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: import 추가, 하드코딩 제거**

import에 추가:

```jsx
import { useCode } from '../contexts/CodeContext';
```

컴포넌트 안에 추가:

```jsx
const { getCodeName, getCodeColor } = useCode();
```

`const statusMap = { ... }` 상수 삭제.

- [ ] **Step 2: statusMap 사용처 대체**

Dashboard에서 statusMap은 label, textColor, dotColor를 제공함. description에 배지 CSS만 있으므로 Dashboard 전용으로 매핑:

```jsx
const getStatusStyle = (status) => {
  const color = getCodeColor('ASSET_STATUS', status);
  // 배지 색상에서 dot/text 색상 추출. fallback 제공
  const colorMap = {
    'bg-emerald-50 text-emerald-700': { textColor: 'text-emerald-600', dotColor: 'bg-emerald-500' },
    'bg-blue-50 text-blue-700': { textColor: 'text-indigo-600', dotColor: 'bg-indigo-500' },
    'bg-amber-50 text-amber-700': { textColor: 'text-amber-600', dotColor: 'bg-amber-500' },
    'bg-gray-100 text-gray-500': { textColor: 'text-gray-400', dotColor: 'bg-gray-400' },
  };
  return colorMap[color] || { textColor: 'text-gray-600', dotColor: 'bg-gray-400' };
};
```

기존 `statusMap[s.status]` → `{ label: getCodeName('ASSET_STATUS', s.status), ...getStatusStyle(s.status) }` 로 대체.

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/Dashboard.jsx
git commit -m "refactor: replace hardcoded statusMap with useCode in Dashboard"
```

---

### Task 10: 기존 페이지에 useCode() 적용 — UserList.jsx

**Files:**
- Modify: `frontend/src/pages/UserList.jsx`

- [ ] **Step 1: import 추가, 하드코딩 제거**

import에 추가:

```jsx
import { useCode } from '../contexts/CodeContext';
```

컴포넌트 안에 추가:

```jsx
const { getCodeName, getCodeColor } = useCode();
```

파일 상단의 `const ROLE_LABELS`, `const ROLE_COLORS` 상수 삭제.

- [ ] **Step 2: 사용처 대체**

- `ROLE_LABELS[u.role]` → `getCodeName('USER_ROLE', u.role)`
- `ROLE_COLORS[u.role]` → `getCodeColor('USER_ROLE', u.role)`
- 정렬 비교의 `ROLE_LABELS[a.role]` → `getCodeName('USER_ROLE', a.role)`

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/UserList.jsx
git commit -m "refactor: replace hardcoded ROLE_LABELS/COLORS with useCode in UserList"
```

---

### Task 11: 빌드 검증 및 배포

- [ ] **Step 1: 백엔드 문법 확인**

```bash
cd /home/neon/project/indgAsset/backend && node -e "require('./routes/codes')" && echo "OK"
```

- [ ] **Step 2: 프론트엔드 빌드**

```bash
cd /home/neon/project/indgAsset/frontend && REACT_APP_API_URL=https://asset.indg.co.kr/api npx react-scripts build
```

- [ ] **Step 3: EC2 배포**

```bash
# 프론트엔드
rsync -avz --delete -e "ssh -i /home/neon/project/indgAsset/aws-key.pem" \
  /home/neon/project/indgAsset/frontend/build/ ubuntu@3.142.135.156:/home/ubuntu/indgAsset/frontend/build/

# 백엔드
rsync -avz -e "ssh -i /home/neon/project/indgAsset/aws-key.pem" \
  /home/neon/project/indgAsset/backend/routes/codes.js ubuntu@3.142.135.156:/home/ubuntu/indgAsset/backend/routes/codes.js
rsync -avz -e "ssh -i /home/neon/project/indgAsset/aws-key.pem" \
  /home/neon/project/indgAsset/backend/app.js ubuntu@3.142.135.156:/home/ubuntu/indgAsset/backend/app.js

# PM2 재시작
ssh -i /home/neon/project/indgAsset/aws-key.pem ubuntu@3.142.135.156 "pm2 restart indg-backend"
```

- [ ] **Step 4: 브라우저 테스트**

1. admin 로그인 → 사이드바에 "공통코드 관리" 메뉴 표시 확인
2. 공통코드 관리 페이지에서 그룹 선택 → 코드 목록 표시 확인
3. 코드 수정 → 이름 변경 후 자산 목록에 반영 확인
4. 코드 추가/비활성화 동작 확인
5. 자산 목록/상세/대시보드/사용자 관리 페이지에서 표시명/색상 정상 표시 확인
