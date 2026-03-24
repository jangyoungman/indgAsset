import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const STATUS_LABELS = {
  available: '사용 가능',
  in_use: '사용 중',
  maintenance: '정비 중',
  disposed: '폐기',
};

const STATUS_COLORS = {
  available: 'bg-emerald-50 text-emerald-700',
  in_use: 'bg-blue-50 text-blue-700',
  maintenance: 'bg-amber-50 text-amber-700',
  disposed: 'bg-gray-100 text-gray-500',
};

export default function AssetList() {
  const { isManagerOrAdmin } = useAuth();
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState({});
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 });
  const [loading, setLoading] = useState(true);

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
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters(f => ({ ...f, search: searchInput, page: 1 }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">자산 목록</h1>
        {isManagerOrAdmin && (
          <Link to="/assets/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            + 자산 등록
          </Link>
        )}
      </div>

      {/* 필터/검색 */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <input
            type="text"
            placeholder="자산명, 코드, 시리얼번호 검색..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">검색</button>
        </form>
        <select
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
        >
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산 코드</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산명</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">카테고리</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">부서</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">사용자</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">상태</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-sm text-indigo-600">{a.asset_code}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{a.name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{a.category_name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{a.department_name}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{a.assigned_to_name || '-'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[a.status]}`}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link to={`/assets/${a.id}`} className="text-indigo-600 hover:underline text-sm">상세</Link>
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan="7" className="text-center py-8 text-gray-400">자산이 없습니다.</td></tr>
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
