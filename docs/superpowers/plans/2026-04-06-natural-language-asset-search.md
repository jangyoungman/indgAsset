# 자연어 자산 검색 메인 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 페이지를 대시보드에서 자연어 자산 검색 페이지로 변경. textarea에 자연어를 입력하면 키워드 기반으로 파싱하여 자산을 조회하고, AssetList와 동일한 목록(테이블/모바일 카드, 정렬, 페이지네이션)을 아래에 표시.

**Architecture:** 백엔드에 `POST /api/assets/search` 엔드포인트를 추가하여 자연어 텍스트를 받고, DB의 카테고리/상태(공통코드)/사용자/부서 이름과 매칭하여 구조화된 필터로 변환 후 자산을 조회. 프론트엔드에 AssetSearch 페이지를 추가하고 `/` 라우트에 매핑. 대시보드는 `/dashboard`로 이동.

**Tech Stack:** React 18, Express, MySQL, 기존 공통코드/Auth서버 프록시 활용

**매칭 우선순위:** 카테고리 → 상태(공통코드 ASSET_STATUS name) → 사용자 → 부서 → 나머지(일반 검색)

---

### Task 1: 백엔드 — POST /api/assets/search 엔드포인트

**Files:**
- Modify: `backend/routes/assets.js`

- [ ] **Step 1: assets.js에 search 엔드포인트 추가**

`router.get('/', ...)` 위에 다음 코드를 삽입:

```javascript
// 자연어 자산 검색
router.post('/search', authenticate, async (req, res) => {
  try {
    const { query: searchText, page = 1, limit = 20 } = req.body;

    if (!searchText || !searchText.trim()) {
      // 빈 검색어: 전체 목록 반환
      const offset = (page - 1) * limit;
      const [countResult] = await pool.query('SELECT COUNT(*) as total FROM assets');
      const total = countResult[0].total;
      const [assets] = await pool.query(
        `SELECT a.*, c.name as category_name
         FROM assets a LEFT JOIN asset_categories c ON a.category_id = c.id
         ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`,
        [Number(limit), Number(offset)]
      );
      return res.json({
        data: assets,
        filters: {},
        pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) },
      });
    }

    let remaining = searchText.trim();
    const filters = {};

    // 1. 카테고리 매칭
    const [categories] = await pool.query('SELECT id, name FROM asset_categories ORDER BY CHAR_LENGTH(name) DESC');
    for (const cat of categories) {
      if (remaining.includes(cat.name)) {
        filters.category_id = cat.id;
        filters.category_name = cat.name;
        remaining = remaining.replace(cat.name, '').trim();
        break;
      }
    }

    // 2. 상태 매칭 (공통코드 ASSET_STATUS의 name으로 매칭)
    const [statusCodes] = await pool.query(
      "SELECT code, name FROM common_codes WHERE group_code = 'ASSET_STATUS' AND is_active = TRUE ORDER BY CHAR_LENGTH(name) DESC"
    );
    for (const sc of statusCodes) {
      if (remaining.includes(sc.name)) {
        filters.status = sc.code;
        filters.status_name = sc.name;
        remaining = remaining.replace(sc.name, '').trim();
        break;
      }
    }

    // 3. 사용자 매칭 (Auth 서버)
    const token = req.headers.authorization?.split(' ')[1];
    let users = [];
    let departments = [];
    try {
      const [userRes, deptRes] = await Promise.all([
        fetch(`${AUTH_SERVER_URL}/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${AUTH_SERVER_URL}/api/departments`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (userRes.ok) users = await userRes.json();
      if (deptRes.ok) departments = await deptRes.json();
    } catch (e) { /* Auth 서버 연결 실패 시 무시 */ }

    if (Array.isArray(users)) {
      const sortedUsers = [...users].sort((a, b) => b.name.length - a.name.length);
      for (const u of sortedUsers) {
        if (remaining.includes(u.name)) {
          filters.assigned_to = u.id;
          filters.assigned_to_name = u.name;
          remaining = remaining.replace(u.name, '').trim();
          break;
        }
      }
    }

    // 4. 부서 매칭
    if (Array.isArray(departments)) {
      const sortedDepts = [...departments].sort((a, b) => b.name.length - a.name.length);
      for (const d of sortedDepts) {
        if (remaining.includes(d.name)) {
          filters.department_id = d.id;
          filters.department_name = d.name;
          remaining = remaining.replace(d.name, '').trim();
          break;
        }
      }
    }

    // 5. 나머지 → 일반 검색어
    remaining = remaining.replace(/\s+/g, ' ').trim();
    if (remaining) {
      filters.search = remaining;
    }

    // SQL 조건 조립
    let query = `
      SELECT a.*, c.name as category_name
      FROM assets a
      LEFT JOIN asset_categories c ON a.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.category_id) { query += ' AND a.category_id = ?'; params.push(filters.category_id); }
    if (filters.status) { query += ' AND a.status = ?'; params.push(filters.status); }
    if (filters.assigned_to) { query += ' AND a.assigned_to = ?'; params.push(filters.assigned_to); }
    if (filters.department_id) { query += ' AND a.department_id = ?'; params.push(filters.department_id); }
    if (filters.search) {
      query += ' AND (a.name LIKE ? OR a.asset_code LIKE ? OR a.serial_number LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    // 전체 개수
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // 페이지네이션
    const offset = (page - 1) * limit;
    query += ' ORDER BY a.updated_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [assets] = await pool.query(query, params);

    res.json({
      data: assets,
      filters,
      pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Asset search error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});
```

- [ ] **Step 2: 커밋**

```bash
git add backend/routes/assets.js
git commit -m "feat: add POST /api/assets/search endpoint with keyword-based NL parsing"
```

---

### Task 2: 프론트엔드 — AssetSearch 페이지

**Files:**
- Create: `frontend/src/pages/AssetSearch.jsx`

- [ ] **Step 1: AssetSearch.jsx 생성**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

export default function AssetSearch() {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { userName, deptName } = useLookup();
  const { getCodeName, getCodeColor } = useCode();
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const search = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.post('/assets/search', { query, page, limit: 20 });
      setAssets(res.data.data);
      setPagination(res.data.pagination);
      setFilters(res.data.filters);
      setSelected(new Set());
      setSearched(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      search();
    }
  };

  const handleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: '', dir: 'asc' };
    });
  };

  const sortedAssets = [...assets].sort((a, b) => {
    if (!sort.key) return 0;
    let va, vb;
    if (sort.key === 'department_id') {
      va = deptName(a.department_id); vb = deptName(b.department_id);
    } else if (sort.key === 'assigned_to') {
      va = userName(a.assigned_to); vb = userName(b.assigned_to);
    } else if (sort.key === 'status') {
      va = getCodeName('ASSET_STATUS', a.status) || ''; vb = getCodeName('ASSET_STATUS', b.status) || '';
    } else {
      va = a[sort.key] ?? ''; vb = b[sort.key] ?? '';
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === sortedAssets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedAssets.map(a => a.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}건의 자산을 폐기 처리하시겠습니까?`)) return;
    setDeleting(true);
    try {
      await api.delete('/assets/bulk', { data: { ids: [...selected] } });
      search(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const filterTags = [];
  if (filters.category_name) filterTags.push({ label: '카테고리', value: filters.category_name });
  if (filters.status_name) filterTags.push({ label: '상태', value: filters.status_name });
  if (filters.assigned_to_name) filterTags.push({ label: '사용자', value: filters.assigned_to_name });
  if (filters.department_name) filterTags.push({ label: '부서', value: filters.department_name });
  if (filters.search) filterTags.push({ label: '검색어', value: filters.search });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 검색 영역 */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-4">자산 검색</h1>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={"자산을 검색하세요.\n예: IT팀 노트북 사용중, 개발팀 홍길동, 모니터 수리중"}
              rows={3}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none"
            />
            <button
              onClick={() => search()}
              disabled={loading}
              className="self-end bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition whitespace-nowrap h-fit"
            >
              {loading ? '검색 중...' : '검색'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">카테고리, 상태, 사용자, 부서명을 조합하여 검색할 수 있습니다. Enter로 검색, Shift+Enter로 줄바꿈</p>
        </div>
      </div>

      {/* 필터 태그 + 관리 버튼 */}
      {searched && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {filterTags.length > 0 && filterTags.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                {tag.label}: {tag.value}
              </span>
            ))}
            <span className="text-sm text-gray-500">
              {pagination.total}건
            </span>
          </div>
          {isManagerOrAdmin && (
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <button
                  onClick={handleBulkDelete}
                  disabled={selected.size === 0 || deleting}
                  className="hidden lg:inline-flex bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {deleting ? '처리 중...' : `선택 삭제${selected.size > 0 ? ` (${selected.size})` : ''}`}
                </button>
              )}
              {isAdmin && (
                <Link to="/assets/bulk-upload" className="hidden lg:inline-flex bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
                  일괄 등록
                </Link>
              )}
              <Link to="/assets/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
                + 자산 등록
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 결과 목록 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">검색 중...</div>
      ) : searched ? (
        <>
          {/* 모바일 카드 리스트 */}
          <div className="lg:hidden flex flex-col gap-3">
            {sortedAssets.map(a => (
              <Link key={a.id} to={`/assets/${a.id}`} className="block bg-white rounded-xl shadow-sm p-4 active:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900 leading-tight">{a.name}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${getCodeColor('ASSET_STATUS', a.status)}`}>
                    {getCodeName('ASSET_STATUS', a.status)}
                  </span>
                </div>
                <div className="font-mono text-xs text-indigo-600 mb-2">{a.asset_code}</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                  <span>{a.category_name}</span>
                  <span className="text-gray-300">·</span>
                  <span>{deptName(a.department_id)}</span>
                  <span className="text-gray-300">·</span>
                  <span>{userName(a.assigned_to)}</span>
                </div>
              </Link>
            ))}
            {assets.length === 0 && (
              <div className="text-center py-8 text-gray-400">검색 결과가 없습니다.</div>
            )}
          </div>

          {/* PC 테이블 */}
          <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={sortedAssets.length > 0 && selected.size === sortedAssets.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  {[
                    { key: 'asset_code', label: '자산 코드' },
                    { key: 'name', label: '자산명' },
                    { key: 'category_name', label: '카테고리' },
                    { key: 'department_id', label: '부서' },
                    { key: 'assigned_to', label: '사용자' },
                    { key: 'status', label: '상태' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {col.label}
                      {sort.key === col.key && (
                        <span className="ml-1">{sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                      )}
                    </th>
                  ))}
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {sortedAssets.map(a => (
                  <tr key={a.id} className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${selected.has(a.id) ? 'bg-indigo-50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3.5 font-mono text-sm text-indigo-600">{a.asset_code}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{a.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{a.category_name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{deptName(a.department_id)}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{userName(a.assigned_to)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCodeColor('ASSET_STATUS', a.status)}`}>
                        {getCodeName('ASSET_STATUS', a.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link to={`/assets/${a.id}`} className="text-indigo-600 hover:underline text-sm">상세</Link>
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-gray-400">검색 결과가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => search(p)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${p === pagination.page ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          검색어를 입력하고 Enter 또는 검색 버튼을 눌러주세요.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/pages/AssetSearch.jsx
git commit -m "feat: add AssetSearch page with NL textarea and asset list"
```

---

### Task 3: 라우팅 변경 — 메인 페이지를 AssetSearch로 교체

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: App.jsx 라우팅 변경**

import 추가:
```jsx
import AssetSearch from './pages/AssetSearch';
```

index 라우트 변경 — 기존:
```jsx
<Route index element={
  <PrivateRoute roles={['admin', 'manager']}>
    <Dashboard />
  </PrivateRoute>
} />
```

변경 후:
```jsx
<Route index element={<AssetSearch />} />
<Route path="dashboard" element={
  <PrivateRoute roles={['admin', 'manager']}>
    <Dashboard />
  </PrivateRoute>
} />
```

- [ ] **Step 2: Layout.jsx 네비게이션 변경**

navItems 배열 수정 — 기존:
```javascript
{ to: '/', label: '대시보드', icon: icons.dashboard, roles: ['admin', 'manager'] },
{ to: '/assets', label: '자산 목록', icon: icons.assets, roles: ['admin', 'manager', 'user'] },
```

변경 후:
```javascript
{ to: '/', label: '자산 검색', icon: icons.assets, roles: ['admin', 'manager', 'user'] },
{ to: '/dashboard', label: '대시보드', icon: icons.dashboard, roles: ['admin', 'manager'] },
{ to: '/assets', label: '자산 목록', icon: icons.assets, roles: ['admin', 'manager', 'user'] },
```

isActive 함수 수정 — 기존:
```javascript
const isActive = (to) => {
  if (to === '/') return location.pathname === '/';
  return location.pathname.startsWith(to);
};
```

변경 후 (`/assets`가 `/assets/xxx` 하위경로에 의해 `/` 검색 탭과 혼동되지 않도록):
```javascript
const isActive = (to) => {
  if (to === '/') return location.pathname === '/';
  return location.pathname.startsWith(to);
};
```

(isActive는 동일하게 유지 — `/`는 exact match이므로 문제 없음)

자산 검색 아이콘을 검색 아이콘으로 변경하기 위해 icons 객체에 search 아이콘 추가:
```javascript
search: (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
),
```

navItems에서 자산 검색 항목의 아이콘을 `icons.search`로 교체:
```javascript
{ to: '/', label: '자산 검색', icon: icons.search, roles: ['admin', 'manager', 'user'] },
```

- [ ] **Step 3: PrivateRoute에서 역할 없는 user도 / 접근 가능한지 확인**

App.jsx의 `<Route index element={<AssetSearch />} />`는 PrivateRoute로 감싸지 않으므로, 부모의 PrivateRoute(인증만 체크)에 의해 보호됨. 역할 제한 없음. 정상.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat: replace main page with AssetSearch, move Dashboard to /dashboard"
```
