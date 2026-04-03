# 자산 일괄 등록 (엑셀 업로드) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 엑셀 파일을 업로드하여 자산을 일괄 등록할 수 있는 기능 구현

**Architecture:** 프론트엔드에서 `xlsx` 라이브러리로 엑셀을 파싱하고 미리보기/1차 검증 후, 검증된 JSON 배열을 `POST /api/assets/bulk` 엔드포인트로 전송. 백엔드에서 2차 검증(DB 조회) 후 트랜잭션으로 일괄 등록.

**Tech Stack:** React 18 + Tailwind CSS, Express.js, MySQL (mysql2), xlsx (SheetJS)

---

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `frontend/src/pages/AssetBulkUpload.jsx` | 신규 | 엑셀 업로드, 파싱, 미리보기, 1차 검증, 등록 요청 |
| `frontend/src/App.jsx` | 수정 | `/assets/bulk-upload` 라우트 추가 |
| `frontend/src/pages/AssetList.jsx` | 수정 | "일괄 등록" 버튼 추가 (admin만) |
| `backend/routes/assets.js` | 수정 | `POST /bulk` 엔드포인트 추가 |

---

### Task 1: xlsx 패키지 설치

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: xlsx 패키지 설치**

```bash
cd /home/neon/project/indgAsset/frontend && npm install xlsx
```

- [ ] **Step 2: 설치 확인**

```bash
cd /home/neon/project/indgAsset/frontend && node -e "const XLSX = require('xlsx'); console.log('xlsx version:', XLSX.version)"
```

Expected: xlsx 버전 출력

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add xlsx dependency for bulk asset upload"
```

---

### Task 2: 백엔드 POST /api/assets/bulk 엔드포인트

**Files:**
- Modify: `backend/routes/assets.js` (line 176 부근, POST `/` 뒤에 추가)

- [ ] **Step 1: POST /bulk 엔드포인트 추가**

`backend/routes/assets.js`의 기존 `POST /` 라우트 (line 176) 뒤에 다음 코드를 추가한다:

```javascript
// 자산 일괄 등록 (관리자 전용)
router.post('/bulk', authenticate, authorize('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { assets } = req.body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ success: false, errors: [{ row: 0, field: 'assets', message: '등록할 자산 데이터가 없습니다.' }] });
    }

    // 카테고리, 부서, 사용자 목록 조회
    const [categories] = await conn.query('SELECT id, name FROM asset_categories');
    const categoryMap = new Map(categories.map(c => [c.name, c.id]));

    const [departments] = await conn.query('SELECT id, name FROM departments');
    const deptMap = new Map(departments.map(d => [d.name, d.id]));

    // Auth 서버에서 사용자 목록 가져오기
    const token = req.headers.authorization?.split(' ')[1];
    let userMap = new Map();
    try {
      const userRes = await fetch(`${AUTH_SERVER_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const users = await userRes.json();
      if (Array.isArray(users)) {
        userMap = new Map(users.map(u => [u.name, u.id]));
      }
    } catch (e) {
      // 사용자 목록 조회 실패 시 assigned_to 매핑 불가
    }

    // 기존 serial_number 목록 조회
    const [existingSerials] = await conn.query('SELECT serial_number FROM assets WHERE serial_number IS NOT NULL');
    const existingSerialSet = new Set(existingSerials.map(r => r.serial_number));

    // 2차 검증
    const errors = [];
    const newSerials = new Set();

    for (let i = 0; i < assets.length; i++) {
      const row = i + 1;
      const asset = assets[i];

      if (!asset.name || !asset.name.trim()) {
        errors.push({ row, field: 'name', message: '자산명은 필수입니다.' });
      }
      if (!asset.category || !categoryMap.has(asset.category)) {
        errors.push({ row, field: 'category', message: `존재하지 않는 카테고리: ${asset.category || '(비어있음)'}` });
      }
      if (asset.department && !deptMap.has(asset.department)) {
        errors.push({ row, field: 'department', message: `존재하지 않는 부서: ${asset.department}` });
      }
      if (asset.assigned_to && !userMap.has(asset.assigned_to)) {
        errors.push({ row, field: 'assigned_to', message: `존재하지 않는 사용자: ${asset.assigned_to}` });
      }
      if (asset.serial_number) {
        if (existingSerialSet.has(asset.serial_number)) {
          errors.push({ row, field: 'serial_number', message: `이미 등록된 시리얼넘버: ${asset.serial_number}` });
        }
        if (newSerials.has(asset.serial_number)) {
          errors.push({ row, field: 'serial_number', message: `엑셀 내 중복 시리얼넘버: ${asset.serial_number}` });
        }
        newSerials.add(asset.serial_number);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // 트랜잭션으로 일괄 등록
    await conn.beginTransaction();

    const results = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      // 자산 코드 생성
      const baseDate = asset.purchase_date ? new Date(asset.purchase_date) : new Date();
      const year = baseDate.getFullYear();
      const prefix = `AST-${year}-`;
      const [lastRow] = await conn.query(
        'SELECT asset_code FROM assets WHERE asset_code LIKE ? ORDER BY asset_code DESC LIMIT 1',
        [`${prefix}%`]
      );
      let seq = 1;
      if (lastRow.length > 0) {
        const lastSeq = parseInt(lastRow[0].asset_code.split('-')[2], 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
      }
      const asset_code = `${prefix}${String(seq).padStart(3, '0')}`;

      const category_id = categoryMap.get(asset.category) || null;
      const department_id = asset.department ? deptMap.get(asset.department) || null : null;
      const assigned_to = asset.assigned_to ? userMap.get(asset.assigned_to) || null : null;
      const status = assigned_to ? 'in_use' : 'available';

      const [result] = await conn.query(
        `INSERT INTO assets
         (asset_code, name, category_id, description, serial_number, mac_address, manufacturer, model,
          purchase_date, purchase_cost, warranty_expiry, location, department_id, assigned_to, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [asset_code, asset.name, category_id, asset.description || null,
         asset.serial_number || null, asset.mac_address || null,
         asset.manufacturer || null, asset.model || null,
         asset.purchase_date || null, asset.purchase_cost || null,
         asset.warranty_expiry || null, asset.location || null,
         department_id, assigned_to, status, asset.notes || null]
      );

      await conn.query(
        'INSERT INTO asset_logs (asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
        [result.insertId, req.user.id, 'created', JSON.stringify({ name: asset.name, asset_code, bulk_import: true })]
      );

      results.push({ row: i + 1, asset_code, name: asset.name });
    }

    await conn.commit();
    res.status(201).json({ success: true, created: results.length, results });
  } catch (err) {
    await conn.rollback();
    console.error('Bulk import error:', err);
    res.status(500).json({ success: false, errors: [{ row: 0, field: 'server', message: '서버 오류가 발생했습니다.' }] });
  } finally {
    conn.release();
  }
});
```

- [ ] **Step 2: 백엔드 서버 재시작하여 문법 오류 없는지 확인**

```bash
cd /home/neon/project/indgAsset/backend && node -e "require('./routes/assets')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add backend/routes/assets.js
git commit -m "feat: add POST /api/assets/bulk endpoint for bulk asset import"
```

---

### Task 3: AssetBulkUpload.jsx 페이지 생성

**Files:**
- Create: `frontend/src/pages/AssetBulkUpload.jsx`

- [ ] **Step 1: AssetBulkUpload.jsx 생성**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../utils/api';

// 시트별 필수/선택 컬럼 정의
const SHEET_CONFIGS = {
  'IT장비': {
    columns: ['name', 'category', 'serial_number', 'mac_address', 'manufacturer', 'model', 'purchase_date', 'purchase_cost', 'warranty_expiry', 'location', 'department', 'assigned_to', 'notes'],
    required: ['name', 'category'],
  },
  '사무용품': {
    columns: ['name', 'category', 'manufacturer', 'model', 'purchase_date', 'purchase_cost', 'location', 'department', 'notes'],
    required: ['name', 'category'],
  },
  '기타': {
    columns: ['name', 'category', 'serial_number', 'manufacturer', 'model', 'purchase_date', 'purchase_cost', 'warranty_expiry', 'location', 'department', 'notes'],
    required: ['name', 'category'],
  },
};

const COLUMN_LABELS = {
  name: '자산명', category: '카테고리', serial_number: '시리얼넘버', mac_address: 'MAC 주소',
  manufacturer: '제조사', model: '모델', purchase_date: '구매일', purchase_cost: '구매가',
  warranty_expiry: '보증만료일', location: '위치', department: '부서', assigned_to: '사용자', notes: '비고',
};

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export default function AssetBulkUpload() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [sheetData, setSheetData] = useState(null); // { sheetName: [rows] }
  const [errors, setErrors] = useState([]); // [{ sheet, row, field, message }]
  const [activeTab, setActiveTab] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    api.get('/assets/categories').then(res => setCategories(res.data)).catch(console.error);
  }, []);

  const validateRow = useCallback((row, sheetName, rowIndex, allRows) => {
    const config = SHEET_CONFIGS[sheetName];
    const rowErrors = [];

    if (!config) return rowErrors;

    for (const field of config.required) {
      if (!row[field] || !String(row[field]).trim()) {
        rowErrors.push({ sheet: sheetName, row: rowIndex + 1, field, message: `${COLUMN_LABELS[field]}은(는) 필수입니다.` });
      }
    }

    if (row.category && categories.length > 0 && !categories.find(c => c.name === row.category)) {
      rowErrors.push({ sheet: sheetName, row: rowIndex + 1, field: 'category', message: `존재하지 않는 카테고리: ${row.category}` });
    }

    if (row.mac_address && !MAC_REGEX.test(row.mac_address)) {
      rowErrors.push({ sheet: sheetName, row: rowIndex + 1, field: 'mac_address', message: `잘못된 MAC 주소 형식: ${row.mac_address}` });
    }

    if (row.purchase_cost && isNaN(Number(row.purchase_cost))) {
      rowErrors.push({ sheet: sheetName, row: rowIndex + 1, field: 'purchase_cost', message: '구매가는 숫자여야 합니다.' });
    }

    if (row.serial_number) {
      const dupes = allRows.filter(r => r.serial_number === row.serial_number);
      if (dupes.length > 1) {
        rowErrors.push({ sheet: sheetName, row: rowIndex + 1, field: 'serial_number', message: `엑셀 내 중복 시리얼넘버: ${row.serial_number}` });
      }
    }

    return rowErrors;
  }, [categories]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const parsed = {};
      const allErrors = [];
      const allRows = [];

      for (const sheetName of wb.SheetNames) {
        const config = SHEET_CONFIGS[sheetName];
        if (!config) continue;

        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        parsed[sheetName] = rows;
        allRows.push(...rows);
      }

      // 검증
      for (const [sheetName, rows] of Object.entries(parsed)) {
        rows.forEach((row, i) => {
          allErrors.push(...validateRow(row, sheetName, i, allRows));
        });
      }

      setSheetData(parsed);
      setErrors(allErrors);
      setActiveTab(Object.keys(parsed)[0] || '');
    };
    reader.readAsArrayBuffer(file);
  }, [validateRow]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSubmit = async () => {
    if (!sheetData || errors.length > 0) return;

    const allAssets = [];
    for (const rows of Object.values(sheetData)) {
      for (const row of rows) {
        allAssets.push({
          ...row,
          purchase_cost: row.purchase_cost ? Number(row.purchase_cost) : null,
        });
      }
    }

    setSubmitting(true);
    try {
      const res = await api.post('/assets/bulk', { assets: allAssets });
      setResult(res.data);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setErrors(data.errors.map(e => ({ sheet: '-', ...e })));
      } else {
        alert('등록 중 오류가 발생했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalRows = sheetData ? Object.values(sheetData).reduce((sum, rows) => sum + rows.length, 0) : 0;

  // 등록 완료 화면
  if (result?.success) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="text-emerald-500 text-5xl mb-4">&#10003;</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">일괄 등록 완료</h2>
          <p className="text-gray-600 mb-6">{result.created}건의 자산이 등록되었습니다.</p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-60 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1">자산 코드</th>
                  <th className="text-left py-1">자산명</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="py-1 font-mono text-indigo-600">{r.asset_code}</td>
                    <td className="py-1">{r.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => navigate('/assets')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            자산 목록으로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">자산 일괄 등록</h1>
        <button onClick={() => navigate('/assets')} className="text-gray-500 hover:text-gray-700 text-sm">
          ← 자산 목록
        </button>
      </div>

      {/* 파일 업로드 영역 */}
      {!sheetData && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="bg-white rounded-xl shadow-sm p-12 text-center border-2 border-dashed border-gray-300 hover:border-indigo-400 transition cursor-pointer"
          onClick={() => document.getElementById('file-input').click()}
        >
          <div className="text-gray-400 text-4xl mb-4">&#128196;</div>
          <p className="text-gray-600 mb-2">엑셀 파일을 드래그하거나 클릭하여 선택하세요</p>
          <p className="text-gray-400 text-sm">시트: IT장비, 사무용품, 기타</p>
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* 미리보기 */}
      {sheetData && (
        <>
          {/* 요약 */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                파일: <span className="font-medium">{fileName}</span>
              </span>
              {Object.entries(sheetData).map(([name, rows]) => (
                <span key={name} className="text-sm text-gray-500">{name} {rows.length}건</span>
              ))}
              <span className="text-sm font-medium">총 {totalRows}건</span>
              {errors.length > 0 && (
                <span className="text-sm text-red-600 font-medium">오류 {errors.length}건</span>
              )}
            </div>
            <button
              onClick={() => { setSheetData(null); setErrors([]); setFileName(''); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              다시 업로드
            </button>
          </div>

          {/* 시트 탭 */}
          <div className="flex gap-1 mb-2">
            {Object.keys(sheetData).map(name => {
              const sheetErrors = errors.filter(e => e.sheet === name);
              return (
                <button
                  key={name}
                  onClick={() => setActiveTab(name)}
                  className={`px-4 py-2 text-sm rounded-t-lg ${activeTab === name ? 'bg-white font-medium text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {name} ({sheetData[name].length})
                  {sheetErrors.length > 0 && <span className="ml-1 text-red-500">!</span>}
                </button>
              );
            })}
          </div>

          {/* 데이터 테이블 */}
          {activeTab && sheetData[activeTab] && (
            <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">#</th>
                    {(SHEET_CONFIGS[activeTab]?.columns || []).map(col => (
                      <th key={col} className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">
                        {COLUMN_LABELS[col]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetData[activeTab].map((row, i) => {
                    const rowErrors = errors.filter(e => e.sheet === activeTab && e.row === i + 1);
                    return (
                      <tr key={i} className={`border-t border-gray-100 ${rowErrors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        {(SHEET_CONFIGS[activeTab]?.columns || []).map(col => {
                          const fieldError = rowErrors.find(e => e.field === col);
                          return (
                            <td key={col} className={`px-3 py-2 whitespace-nowrap ${fieldError ? 'text-red-600' : 'text-gray-700'}`}
                                title={fieldError?.message || ''}>
                              {row[col] || '-'}
                              {fieldError && <span className="block text-xs text-red-500">{fieldError.message}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 등록 버튼 */}
          <div className="mt-6 flex justify-end gap-3">
            {errors.length > 0 && (
              <p className="text-sm text-red-600 self-center mr-auto">오류를 수정한 후 엑셀 파일을 다시 업로드하세요.</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={errors.length > 0 || submitting}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition ${
                errors.length > 0 || submitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {submitting ? '등록 중...' : `${totalRows}건 일괄 등록`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 파일 생성 확인**

```bash
ls -la /home/neon/project/indgAsset/frontend/src/pages/AssetBulkUpload.jsx
```

Expected: 파일 존재 확인

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/AssetBulkUpload.jsx
git commit -m "feat: add AssetBulkUpload page with excel parsing and preview"
```

---

### Task 4: App.jsx 라우트 추가

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: import 추가**

`App.jsx` 상단의 기존 import 들 사이에 추가:

```jsx
import AssetBulkUpload from './pages/AssetBulkUpload';
```

- [ ] **Step 2: 라우트 추가**

기존 라우트 정의에서 `/assets/new` 라우트 근처에 추가 (`:id` 라우트보다 위에 위치해야 함):

```jsx
<Route path="/assets/bulk-upload" element={<PrivateRoute roles={['admin']}><AssetBulkUpload /></PrivateRoute>} />
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /home/neon/project/indgAsset/frontend && npx react-scripts build 2>&1 | tail -5
```

Expected: `Compiled successfully.`

주의: CLAUDE.md에 따라 EC2에서는 빌드하지 않음. 로컬에서만 실행.

- [ ] **Step 4: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/App.jsx
git commit -m "feat: add /assets/bulk-upload route (admin only)"
```

---

### Task 5: AssetList.jsx에 일괄 등록 버튼 추가

**Files:**
- Modify: `frontend/src/pages/AssetList.jsx`

- [ ] **Step 1: useAuth에서 isAdmin 추가**

`AssetList.jsx` line 3의 기존 destructuring을 수정:

```jsx
// 변경 전:
const { isManagerOrAdmin } = useAuth();

// 변경 후:
const { isAdmin, isManagerOrAdmin } = useAuth();
```

- [ ] **Step 2: 일괄 등록 버튼 추가**

line 56 부근, 기존 `+ 자산 등록` 링크 바로 앞에 일괄 등록 버튼을 추가:

```jsx
{isAdmin && (
  <Link to="/assets/bulk-upload" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition mr-2">
    &#128196; 일괄 등록
  </Link>
)}
```

최종 결과 (버튼 영역):

```jsx
{isManagerOrAdmin && (
  <div className="flex gap-2">
    {isAdmin && (
      <Link to="/assets/bulk-upload" className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
        일괄 등록
      </Link>
    )}
    <Link to="/assets/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
      + 자산 등록
    </Link>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
cd /home/neon/project/indgAsset
git add frontend/src/pages/AssetList.jsx
git commit -m "feat: add bulk upload button to asset list (admin only)"
```

---

### Task 6: 통합 테스트 및 최종 확인

- [ ] **Step 1: 백엔드 문법 확인**

```bash
cd /home/neon/project/indgAsset/backend && node -e "require('./routes/assets')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 2: 프론트엔드 빌드 확인 (로컬)**

```bash
cd /home/neon/project/indgAsset/frontend && npx react-scripts build 2>&1 | tail -5
```

Expected: `Compiled successfully.`

- [ ] **Step 3: 테스트용 엑셀 파일이 정상 파싱되는지 수동 확인**

브라우저에서 `/assets/bulk-upload` 접속하여:
1. 엑셀 파일 업로드 → 시트별 탭 표시 확인
2. 미리보기 테이블에 데이터 표시 확인
3. 오류 있는 행에 빨간색 하이라이트 확인
4. 오류 없을 때 등록 버튼 활성화 확인
5. 등록 후 결과 화면 표시 확인

- [ ] **Step 4: 최종 Commit**

```bash
cd /home/neon/project/indgAsset
git add -A
git commit -m "feat: complete asset bulk upload feature with excel import"
```
