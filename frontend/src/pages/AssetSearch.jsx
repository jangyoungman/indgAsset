import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

export default function AssetSearch() {
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { users, departments, userName, deptName } = useLookup();
  const { getCodeName, getCodeColor, getCodeList } = useCode();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/assets/categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [helpTab, setHelpTab] = useState('ai');

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

  const addChip = (text) => {
    setQuery(prev => (prev ? prev + ' ' + text : text));
  };

  const statusList = getCodeList('ASSET_STATUS');

  // Build filter tags from filters object
  const filterTags = [];
  if (filters.category_name) filterTags.push({ label: '카테고리', value: filters.category_name });
  if (filters.category_not_name) filterTags.push({ label: '카테고리 제외', value: filters.category_not_name, negative: true });
  if (filters.status_name) filterTags.push({ label: '상태', value: filters.status_name });
  if (filters.status_not_name) filterTags.push({ label: '상태 제외', value: filters.status_not_name, negative: true });
  if (filters.assigned_to_name) filterTags.push({ label: '사용자', value: filters.assigned_to_name });
  if (filters.assigned_to_not_name) filterTags.push({ label: '사용자 제외', value: filters.assigned_to_not_name, negative: true });
  if (filters.department_name) filterTags.push({ label: '부서', value: filters.department_name });
  if (filters.department_not_name) filterTags.push({ label: '부서 제외', value: filters.department_not_name, negative: true });
  if (filters.cost_min) filterTags.push({ label: '최소금액', value: `${Number(filters.cost_min).toLocaleString()}원` });
  if (filters.cost_max) filterTags.push({ label: '최대금액', value: `${Number(filters.cost_max).toLocaleString()}원` });
  if (filters.purchase_after) filterTags.push({ label: '구매일 이후', value: filters.purchase_after });
  if (filters.purchase_before) filterTags.push({ label: '구매일 이전', value: filters.purchase_before });
  if (filters.warranty_before) filterTags.push({ label: '보증만료 이전', value: filters.warranty_before });
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
      {/* 검색 도움말 탭 */}
      {!searched && (
        <div className="mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setHelpTab('ai')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${helpTab === 'ai' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              자연어 검색
            </button>
            <button
              onClick={() => setHelpTab('keyword')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${helpTab === 'keyword' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              키워드 검색
            </button>
          </div>

          {helpTab === 'ai' && (
            <div className="bg-white rounded-b-xl shadow-sm p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase">
                    <th className="pb-2 pr-4 font-medium">입력 예시</th>
                    <th className="pb-2 font-medium">검색 조건</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">노트북 폐기 외의 목록</td><td className="py-2">카테고리=노트북, 상태 <span className="text-red-500">제외</span>=폐기</td></tr>
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">IT팀 빼고 사용중인 노트북</td><td className="py-2">카테고리=노트북, 상태=사용 중, 부서 <span className="text-red-500">제외</span>=IT팀</td></tr>
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">올해 구매한 장비</td><td className="py-2">구매일 &ge; 2026-01-01</td></tr>
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">100만원 이상 노트북</td><td className="py-2">카테고리=노트북, 금액 &ge; 1,000,000원</td></tr>
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">보증 만료 임박한 장비</td><td className="py-2">보증만료일 조건</td></tr>
                  <tr className="border-t border-gray-50"><td className="py-2 pr-4 font-medium text-gray-900">개발팀 모니터 사용중</td><td className="py-2">카테고리=모니터, 상태=사용 중, 부서=개발팀</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">AI가 자연어를 분석하여 검색 조건을 자동 생성합니다. API 호출 실패 시 키워드 검색으로 자동 전환됩니다.</p>
            </div>
          )}

          {helpTab === 'keyword' && (
            <div className="bg-white rounded-b-xl shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-3">칩을 클릭하면 검색어에 추가됩니다. 조합 후 Enter로 검색하세요.</p>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-400 w-14 shrink-0">카테고리</span>
                  {categories.map(c => (
                    <button key={c.id} onClick={() => addChip(c.name)} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition">{c.name}</button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-400 w-14 shrink-0">상태</span>
                  {statusList.map(s => (
                    <button key={s.code} onClick={() => addChip(s.name)} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition">{s.name}</button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-400 w-14 shrink-0">부서</span>
                  {departments.map(d => (
                    <button key={d.id} onClick={() => addChip(d.name)} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition">{d.name}</button>
                  ))}
                </div>
                {users.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-gray-400 w-14 shrink-0">사용자</span>
                    {users.filter(u => u.is_active !== false).map(u => (
                      <button key={u.id} onClick={() => addChip(u.name)} className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition">{u.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3">키워드 검색은 정확한 이름 매칭으로 동작합니다. AI 검색과 달리 부정 조건, 금액, 날짜 범위는 지원하지 않습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 검색 후 결과 */}
      {searched && (
        <>
          {/* 필터 태그 + 결과 수 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {filterTags.map((tag, i) => (
              <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border ${tag.negative ? 'bg-red-50 text-red-700 border-red-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                <span className={tag.negative ? 'text-red-400' : 'text-indigo-400'}>{tag.label}</span>
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
                  <Link key={a.id} to={`/assets/${a.id}`} state={{ from: '/' }} className="block bg-white rounded-xl shadow-sm p-4 active:bg-gray-50 transition-colors">
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
                          <Link to={`/assets/${a.id}`} state={{ from: '/' }} className="text-indigo-600 hover:underline text-sm">상세</Link>
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
