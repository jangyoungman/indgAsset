# 자산 스티커 출력 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산 목록/상세에서 선택한 자산의 스티커를 A4 라벨지(3x7, 21매/장)에 인쇄하는 기능 구현

**Architecture:** 프론트엔드 전용 기능. AssetLabelPrint 페이지에서 자산 정보를 API로 조회하고, JsBarcode로 바코드를 생성한 뒤 CSS @media print로 A4 라벨지 레이아웃에 맞춰 브라우저 인쇄. admin 전용.

**Tech Stack:** React, JsBarcode, CSS @media print

**스펙:** `docs/superpowers/specs/2026-04-10-asset-label-print-design.md`

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `frontend/src/pages/AssetLabelPrint.jsx` | 신규 — 라벨 출력 페이지 (미리보기 + 인쇄) |
| `frontend/src/App.jsx` | 수정 — 라우트 추가 |
| `frontend/src/pages/AssetList.jsx` | 수정 — 스티커 출력 버튼 추가 (admin) |
| `frontend/src/pages/AssetDetail.jsx` | 수정 — 스티커 출력 버튼 추가 (admin) |

---

### Task 1: JsBarcode 설치

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 패키지 설치**

```bash
cd /home/neon/project/indgAsset/frontend && npm install jsbarcode
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "require('jsbarcode'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add jsbarcode dependency for asset label printing"
```

---

### Task 2: AssetLabelPrint 페이지 생성

**Files:**
- Create: `frontend/src/pages/AssetLabelPrint.jsx`

- [ ] **Step 1: AssetLabelPrint.jsx 생성**

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import api from '../utils/api';
import { useLookup } from '../hooks/useLookup';

function BarcodeCanvas({ value, width = 1.2, height = 30 }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (svgRef.current && value) {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue: false,
        margin: 0,
      });
    }
  }, [value, width, height]);
  return <svg ref={svgRef} />;
}

export default function AssetLabelPrint() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userName } = useLookup();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) { navigate('/assets'); return; }
    const ids = idsParam.split(',').map(Number).filter(Boolean);
    if (ids.length === 0) { navigate('/assets'); return; }

    Promise.all(ids.map(id => api.get(`/assets/${id}`).then(r => r.data)))
      .then(setAssets)
      .catch(() => alert('자산 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [searchParams, navigate]);

  const handlePrint = useCallback(() => window.print(), []);

  if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

  return (
    <div>
      {/* 화면용 컨트롤 (인쇄 시 숨김) */}
      <div className="print:hidden p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 transition mb-1">
              ← 뒤로가기
            </button>
            <h1 className="text-xl font-semibold text-gray-900">스티커 출력 미리보기</h1>
            <p className="text-sm text-gray-500 mt-1">{assets.length}건의 라벨 · A4 라벨지 3×7 (21매/장)</p>
          </div>
          <button
            onClick={handlePrint}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            인쇄
          </button>
        </div>

        {/* 화면 미리보기: A4 프레임 */}
        <div className="bg-gray-100 p-6 rounded-xl flex justify-center">
          <div className="bg-white shadow-lg" style={{ width: '210mm', padding: '15.1mm 7.2mm 0 7.2mm' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 63.5mm)', gridTemplateRows: `repeat(${Math.min(7, assets.length <= 7 ? assets.length : 7)}, 38.1mm)`, gap: '0' }}>
              {assets.slice(0, 21).map(asset => (
                <LabelCell key={asset.id} asset={asset} userName={userName} />
              ))}
            </div>
          </div>
        </div>

        {assets.length > 21 && (
          <p className="text-sm text-amber-600 mt-3 text-center">
            총 {assets.length}건 중 첫 21건만 미리보기에 표시됩니다. 인쇄 시 전체가 출력됩니다.
          </p>
        )}
      </div>

      {/* 인쇄용 라벨 그리드 (화면에서는 숨김) */}
      <div className="hidden print:block print-labels">
        {chunkArray(assets, 21).map((page, pageIdx) => (
          <div key={pageIdx} className="label-page">
            {page.map(asset => (
              <LabelCell key={asset.id} asset={asset} userName={userName} />
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body * { visibility: hidden; }
          .print-labels, .print-labels * { visibility: visible; }
          .print-labels { position: absolute; top: 0; left: 0; }
          .label-page {
            width: 210mm;
            height: 297mm;
            padding: 15.1mm 7.2mm 0 7.2mm;
            display: grid;
            grid-template-columns: repeat(3, 63.5mm);
            grid-template-rows: repeat(7, 38.1mm);
            page-break-after: always;
          }
          .label-page:last-child {
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function LabelCell({ asset, userName }) {
  const assignedName = userName(asset.assigned_to);
  return (
    <div style={{
      width: '63.5mm', height: '38.1mm', border: '0.5px solid #ddd',
      fontFamily: "'Malgun Gothic', sans-serif", boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 상단: 회사명 + 담당자 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3mm 3mm 1.5mm 3mm', borderBottom: '0.5px solid #ddd',
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '10pt', letterSpacing: '1.5px', color: '#1e3a5f' }}>INNODIGM</span>
        <span style={{ fontSize: '7.5pt', color: '#555' }}>담당자: <strong style={{ color: '#222' }}>{assignedName !== '-' ? assignedName : ''}</strong></span>
      </div>
      {/* 하단: 바코드 + 자산코드 */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: '2mm', padding: '1.5mm 3mm',
      }}>
        <BarcodeCanvas value={asset.asset_code} width={1} height={25} />
        <span style={{ fontSize: '10pt', fontWeight: 'bold', letterSpacing: '1px', whiteSpace: 'nowrap' }}>{asset.asset_code}</span>
      </div>
    </div>
  );
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AssetLabelPrint.jsx
git commit -m "feat: add AssetLabelPrint page with barcode generation and A4 label layout"
```

---

### Task 3: App.jsx에 라우트 추가

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: import 추가**

`AssetSearch` import 아래에 추가:

```jsx
import AssetLabelPrint from './pages/AssetLabelPrint';
```

- [ ] **Step 2: 라우트 추가**

`<Route path="assets/bulk-upload" .../>` 아래에 추가:

```jsx
<Route path="assets/label-print" element={<PrivateRoute roles={['admin']}><AssetLabelPrint /></PrivateRoute>} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add /assets/label-print route (admin only)"
```

---

### Task 4: AssetList.jsx에 스티커 출력 버튼 추가

**Files:**
- Modify: `frontend/src/pages/AssetList.jsx`

- [ ] **Step 1: Link import 확인**

이미 `import { Link } from 'react-router-dom';`이 있으므로 추가 불필요.
`useNavigate`를 추가한다:

```jsx
import { Link, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: navigate 선언 추가**

`const [deleting, setDeleting] = useState(false);` 아래에:

```jsx
const navigate = useNavigate();
```

- [ ] **Step 3: 스티커 출력 핸들러 추가**

`handleSearch` 함수 위에 추가:

```jsx
  const handleLabelPrint = () => {
    if (selected.size === 0) return;
    navigate(`/assets/label-print?ids=${[...selected].join(',')}`);
  };
```

- [ ] **Step 4: 버튼 추가**

`선택 삭제` 버튼 앞에 "스티커 출력" 버튼 추가. 기존 코드:

```jsx
            {isAdmin && (
              <button
                onClick={handleBulkDelete}
```

이 블록 앞에 추가:

```jsx
            {isAdmin && (
              <button
                onClick={handleLabelPrint}
                disabled={selected.size === 0}
                className="hidden lg:inline-flex bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                스티커 출력{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AssetList.jsx
git commit -m "feat: add label print button to AssetList (admin only)"
```

---

### Task 5: AssetDetail.jsx에 스티커 출력 버튼 추가

**Files:**
- Modify: `frontend/src/pages/AssetDetail.jsx`

- [ ] **Step 1: 버튼 추가**

`수정` 링크 바로 앞에 스티커 출력 버튼 추가. 기존 코드:

```jsx
          {isManagerOrAdmin && (
            <Link to={`/assets/${id}/edit`}
```

이 블록 앞에 추가:

```jsx
          {isAdmin && (
            <Link to={`/assets/label-print?ids=${id}`}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition">
              스티커 출력
            </Link>
          )}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AssetDetail.jsx
git commit -m "feat: add label print button to AssetDetail (admin only)"
```

---

### Task 6: 빌드 및 배포

- [ ] **Step 1: 로컬 빌드**

```bash
cd /home/neon/project/indgAsset/frontend
REACT_APP_API_URL=https://asset.indg.co.kr/api npx react-scripts build
```

- [ ] **Step 2: EC2 업로드**

```bash
cd /home/neon/project/indgAsset
rsync -avz --delete -e "ssh -i aws-key.pem" frontend/build/ ubuntu@3.130.223.104:/home/ubuntu/indgAsset/frontend/build/
```

- [ ] **Step 3: 동작 확인**

https://asset.indg.co.kr 에서:
1. admin으로 로그인
2. 자산 목록 → 체크박스 선택 → "스티커 출력" 버튼 클릭
3. 라벨 미리보기 확인
4. "인쇄" 버튼 → 브라우저 인쇄 대화상자에서 라벨 레이아웃 확인

- [ ] **Step 4: 최종 커밋 및 push**

```bash
git add -A
git commit -m "feat: asset label sticker printing with barcode (A4 3x7 layout)"
git push origin dev
```

---

### Task 7: changelog 업데이트

- [ ] **Step 1: docs/changelog.md 상단에 추가**

```markdown
## 2026-04-10

### 자산 스티커 출력 기능

자산 목록/상세에서 선택한 자산의 스티커를 A4 라벨지(3x7, 21매/장)에 인쇄하는 기능.

**스티커 레이아웃:**
- 상단: 회사명(INNODIGM) + 담당자
- 하단: 바코드(Code 128) + 자산코드
- 크기: 63.5mm x 38.1mm (Avery L7160 호환)

**변경 파일:**

| 파일 | 변경 내용 |
|------|-----------|
| frontend/src/pages/AssetLabelPrint.jsx | 신규 — 라벨 출력 페이지 (바코드, A4 레이아웃, 인쇄) |
| frontend/src/App.jsx | /assets/label-print 라우트 추가 (admin 전용) |
| frontend/src/pages/AssetList.jsx | 선택 자산 "스티커 출력" 버튼 추가 (admin) |
| frontend/src/pages/AssetDetail.jsx | 개별 자산 "스티커 출력" 버튼 추가 (admin) |
| frontend/package.json | jsbarcode 패키지 추가 |

**권한:** admin 전용
```

- [ ] **Step 2: Commit**

```bash
git add docs/changelog.md
git commit -m "docs: add asset label print feature to changelog"
git push origin dev
```
