import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', code: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDepartments = () => {
    setLoading(true);
    api.get('/assets/departments')
      .then(res => setDepartments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDepartments(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ name: '', code: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name, code: item.code });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/users/departments/${editItem.id}`, form);
      } else {
        await api.post('/users/departments', form);
      }
      setShowModal(false);
      fetchDepartments();
    } catch (err) {
      setError(err.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5';

  if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">부서 관리</h1>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          + 부서 추가
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">부서코드</th>
              <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">부서명</th>
              <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 text-sm font-mono text-gray-700">{d.code}</td>
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{d.name}</td>
                <td className="px-5 py-3.5">
                  <button onClick={() => openEdit(d)} className="text-indigo-600 hover:underline text-sm">수정</button>
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr><td colSpan="3" className="text-center py-8 text-gray-400">부서가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editItem ? '부서 수정' : '부서 추가'}</h2>
            {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>부서코드 *</label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className={inputClass}
                  required
                  placeholder="DEV, DESIGN, HR 등"
                />
              </div>
              <div>
                <label className={labelClass}>부서명 *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  required
                  placeholder="개발팀, 디자인팀 등"
                />
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
