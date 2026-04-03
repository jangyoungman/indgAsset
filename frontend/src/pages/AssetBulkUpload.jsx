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

// 한글 헤더 → 영문 키 역매핑
const LABEL_TO_KEY = Object.fromEntries(Object.entries(COLUMN_LABELS).map(([k, v]) => [v, k]));

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

const SAMPLE_DATA = {
  'IT장비': [
    ['개발용 노트북', '노트북', 'SN-IT-001', 'AA:BB:CC:DD:EE:01', 'Dell', 'XPS 15 9530', '2024-03-15', 1800000, '2027-03-15', '본사 3층', '개발팀', '', '개발용'],
    ['업무용 모니터', '모니터', 'SN-IT-002', '', 'LG', '27UK850', '2024-01-10', 450000, '2027-01-10', '본사 3층', '개발팀', '', '27인치'],
  ],
  '사무용품': [
    ['높이조절 책상', '사무가구', 'IKEA', 'BEKANT', '2024-02-01', 350000, '본사 3층', '개발팀', '높이조절형'],
    ['사무용 의자', '사무가구', 'Herman Miller', 'Aeron', '2024-02-01', 1200000, '본사 2층', '디자인팀', ''],
  ],
  '기타': [
    ['법인차량', '차량', 'VIN-001', '현대', '아반떼 CN7', '2024-06-01', 25000000, '2027-06-01', '본사 주차장', '총무팀', '업무용'],
  ],
};

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  for (const [sheetName, config] of Object.entries(SHEET_CONFIGS)) {
    const headers = config.columns.map(col => COLUMN_LABELS[col]);
    const rows = [headers, ...(SAMPLE_DATA[sheetName] || [])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, '자산_일괄등록_템플릿.xlsx');
}

export default function AssetBulkUpload() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [sheetData, setSheetData] = useState(null);
  const [errors, setErrors] = useState([]);
  const [activeTab, setActiveTab] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    api.get('/assets/categories').then(res => setCategories(res.data)).catch(console.error);
  }, []);

  const validateRow = useCallback((row, sheetName, rowIndex) => {
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

    return rowErrors;
  }, [categories]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const parsed = {};
      const allErrors = [];

      for (const sheetName of wb.SheetNames) {
        const config = SHEET_CONFIGS[sheetName];
        if (!config) continue;

        const sheet = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        // 한글 헤더 → 영문 키 변환 + 날짜 정규화
        const rows = rawRows.map(raw => {
          const row = {};
          for (const [key, val] of Object.entries(raw)) {
            const mappedKey = LABEL_TO_KEY[key] || key;
            row[mappedKey] = val;
          }
          if (row.purchase_date) row.purchase_date = formatDate(row.purchase_date);
          if (row.warranty_expiry) row.warranty_expiry = formatDate(row.warranty_expiry);
          return row;
        });
        parsed[sheetName] = rows;
      }

      for (const [sheetName, rows] of Object.entries(parsed)) {
        rows.forEach((row, i) => {
          allErrors.push(...validateRow(row, sheetName, i));
        });
      }

      // Serial number duplicate check (O(n))
      const seenSerials = new Map(); // serial -> first occurrence {sheet, row}
      for (const [sheetName, rows] of Object.entries(parsed)) {
        rows.forEach((row, i) => {
          if (row.serial_number) {
            const key = String(row.serial_number);
            if (seenSerials.has(key)) {
              allErrors.push({ sheet: sheetName, row: i + 1, field: 'serial_number', message: `엑셀 내 중복 시리얼넘버: ${row.serial_number}` });
            } else {
              seenSerials.set(key, { sheet: sheetName, row: i + 1 });
            }
          }
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
        // 백엔드 row 번호를 시트별 행으로 매핑
        const sheetNames = Object.keys(sheetData);
        const sheetOffsets = [];
        let offset = 0;
        for (const name of sheetNames) {
          sheetOffsets.push({ name, start: offset, count: sheetData[name].length });
          offset += sheetData[name].length;
        }
        const mappedErrors = data.errors.map(e => {
          const globalRow = e.row;
          const match = sheetOffsets.find(s => globalRow > s.start && globalRow <= s.start + s.count);
          if (match) {
            return { ...e, sheet: match.name, row: globalRow - match.start };
          }
          return { ...e, sheet: '-' };
        });
        setErrors(mappedErrors);
      } else {
        alert('등록 중 오류가 발생했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalRows = sheetData ? Object.values(sheetData).reduce((sum, rows) => sum + rows.length, 0) : 0;

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
          &#8592; 자산 목록
        </button>
      </div>

      {!sheetData && (
        <div className="space-y-4">
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
          <div className="text-center">
            <button
              onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:underline"
            >
              &#8681; 템플릿 다운로드
            </button>
          </div>
        </div>
      )}

      {sheetData && (
        <>
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

          {/* 서버 검증 오류 상세 목록 */}
          {errors.length > 0 && errors.some(e => e.sheet === '-' || !Object.keys(SHEET_CONFIGS).includes(e.sheet)) && (
            <div className="bg-red-50 rounded-xl p-4 mt-4 max-h-48 overflow-y-auto">
              <p className="text-sm font-medium text-red-700 mb-2">서버 검증 오류:</p>
              <ul className="text-sm text-red-600 space-y-1">
                {errors.filter(e => e.sheet === '-').map((e, i) => (
                  <li key={i}>행 {e.row}: [{e.field}] {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 오류 상세 목록 (시트에 매핑된 오류) */}
          {errors.length > 0 && errors.some(e => e.sheet !== '-') && (
            <div className="bg-amber-50 rounded-xl p-4 mt-4 max-h-48 overflow-y-auto">
              <p className="text-sm font-medium text-amber-700 mb-2">검증 오류 상세:</p>
              <ul className="text-sm text-amber-600 space-y-1">
                {errors.filter(e => e.sheet !== '-').map((e, i) => (
                  <li key={i}>[{e.sheet}] 행 {e.row}: [{e.field}] {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-3">
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
