import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

export default function AssetList() {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { userName, deptName } = useLookup();
  const { getCodeName, getCodeColor, getCodeList } = useCode();
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState({});
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    params.set('page', filters.page);

    api.get(`/assets?${params}`)
      .then(res => {
        setAssets(res.data.data);
        setPagination(res.data.pagination);
        setSelected(new Set());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

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
      setFilters(f => ({ ...f })); // 목록 새로고침
    } catch (err) {
      alert(err.response?.data?.error || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters(f => ({ ...f, search: searchInput, page: 1 }));
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-900">자산 목록</h1>
        {isManagerOrAdmin && (
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            {isAdmin && (
              <button
                onClick={handleBulkDelete}
                disabled={selected.size === 0 || deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {deleting ? '처리 중...' : `선택 삭제${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            )}
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
      </div>

      {/* 필터/검색 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            placeholder="자산명, 코드, 시리얼번호 검색..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition whitespace-nowrap">검색</button>
        </form>
        <select
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
        >
          <option value="">전체 상태</option>
          {getCodeList('ASSET_STATUS').map(c => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
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
                  <tr><td colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-gray-400">자산이 없습니다.</td></tr>
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
                  onClick={() => setFilters(f => ({ ...f, page: p }))}
                  className={`px-3 py-1.5 text-sm rounded-lg ${p === pagination.page ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
