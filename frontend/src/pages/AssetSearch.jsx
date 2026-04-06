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
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/assets/search', { query, page, limit: 20 });
      setAssets(res.data.data);
      setPagination(res.data.pagination);
      setFilters(res.data.filters || {});
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
      search(pagination.page || 1);
    } catch (err) {
      alert(err.response?.data?.error || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  // Build filter tags from filters object
  const filterTags = [];
  if (filters.category_name) filterTags.push({ label: '카테고리', value: filters.category_name });
  if (filters.status_name) filterTags.push({ label: '상태', value: filters.status_name });
  if (filters.assigned_to_name) filterTags.push({ label: '사용자', value: filters.assigned_to_name });
  if (filters.department_name) filterTags.push({ label: '부서', value: filters.department_name });
  if (filters.search) filterTags.push({ label: '검색어', value: filters.search });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-900">자산 검색</h1>
        {isManagerOrAdmin && searched && (
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
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

      {/* 검색 영역 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <textarea
          rows={3}
          placeholder="예: 영업팀 노트북, 폐기 예정인 모니터, 김철수가 사용 중인 장비..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-none"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => search()}
            disabled={loading || !query.trim()}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        카테고리, 상태, 사용자, 부서명을 조합하여 검색할 수 있습니다. Enter로 검색, Shift+Enter로 줄바꿈
      </p>

      {/* 검색 전 안내 */}
      {!searched && !loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          검색어를 입력하고 Enter 또는 검색 버튼을 눌러주세요.
        </div>
      )}

      {/* 검색 후 결과 */}
      {searched && (
        <>
          {/* 필터 태그 + 결과 수 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {filterTags.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full border border-indigo-200">
                <span className="text-indigo-400">{tag.label}</span>
                <span>{tag.value}</span>
              </span>
            ))}
            {pagination.total !== undefined && (
              <span className="text-sm text-gray-500 ml-auto">
                총 <span className="font-semibold text-gray-900">{pagination.total}</span>건
              </span>
            )}
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">로딩 중...</div>
          ) : (
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
                            <span className="ml-1">{sort.dir === 'asc' ? '▲' : '▼'}</span>
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
          )}
        </>
      )}
    </div>
  );
}
