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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">공통코드 관리</h1>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          + 코드 추가
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* 왼쪽: 그룹 목록 */}
        <div className="w-full lg:w-52 lg:flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden flex lg:flex-col overflow-x-auto lg:overflow-x-visible">
            {groups.map(group => (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`whitespace-nowrap lg:w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-0 transition ${
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
          {/* 모바일 카드 리스트 */}
          <div className="lg:hidden flex flex-col gap-3">
            {currentCodes.map(item => (
              <div key={item.id} className={`bg-white rounded-xl shadow-sm p-4 ${!item.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                    <span className="text-xs font-mono text-gray-400 ml-2">{item.code}</span>
                  </div>
                  <button
                    onClick={() => handleToggle(item)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {item.is_active ? '활성' : '비활성'}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span>순서: {item.sort_order}</span>
                  {item.description && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.description}`}>미리보기</span>
                    </>
                  )}
                </div>
                <button onClick={() => openEdit(item)} className="text-indigo-600 text-xs font-medium">수정</button>
              </div>
            ))}
            {currentCodes.length === 0 && (
              <div className="text-center py-8 text-gray-400">코드가 없습니다.</div>
            )}
          </div>

          <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-hidden">
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
