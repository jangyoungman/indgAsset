import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useLookup } from '../hooks/useLookup';

const ROLE_LABELS = { admin: '관리자', manager: '부서장', user: '사용자' };
const ROLE_COLORS = {
  admin: 'bg-red-50 text-red-700',
  manager: 'bg-indigo-50 text-indigo-700',
  user: 'bg-gray-100 text-gray-600',
};

export default function UserList() {
  const { departments: lookupDepts, deptName } = useLookup();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const departments = lookupDepts;
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'user', department_id: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    api.get('/users').then(res => setUsers(res.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm({ email: '', password: '', name: '', role: 'user', department_id: '', phone: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    setForm({ email: u.email, password: '', name: u.name, role: u.role, department_id: u.department_id || '', phone: u.phone || '' });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editUser) {
        const payload = { name: form.name, role: form.role, department_id: form.department_id ? Number(form.department_id) : null, phone: form.phone, is_active: editUser.is_active };
        await api.put(`/users/${editUser.id}`, payload);
      } else {
        const payload = { ...form, department_id: form.department_id ? Number(form.department_id) : null };
        await api.post('/users', payload);
      }
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { name: u.name, role: u.role, department_id: u.department_id, phone: u.phone, is_active: !u.is_active });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const unlockUser = async (u) => {
    try {
      await api.put(`/users/${u.id}/unlock`);
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const [tempPwInfo, setTempPwInfo] = useState(null);

  const resetUserPw = async (u) => {
    if (!window.confirm(`${u.name}의 비밀번호를 초기화하시겠습니까?`)) return;
    try {
      const res = await api.put(`/users/${u.id}/reset-password`);
      setTempPwInfo({ name: u.name, password: res.data.tempPassword });
    } catch (err) {
      console.error(err);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">사용자 관리</h1>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          + 사용자 등록
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">이름</th>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">이메일</th>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">역할</th>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">부서</th>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">상태</th>
                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{deptName(u.department_id)}</td>
                  <td className="px-5 py-3.5">
                    {u.login_fail_count >= 5 ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">잠김</span>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? '활성' : '비활성'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 flex gap-2">
                    <button onClick={() => openEdit(u)} className="text-indigo-600 hover:underline text-sm">수정</button>
                    <button onClick={() => toggleActive(u)} className={`text-sm ${u.is_active ? 'text-red-500 hover:underline' : 'text-emerald-600 hover:underline'}`}>
                      {u.is_active ? '비활성화' : '활성화'}
                    </button>
                    {u.login_fail_count >= 5 && (
                      <button onClick={() => unlockUser(u)} className="text-amber-600 hover:underline text-sm">잠금해제</button>
                    )}
                    <button onClick={() => resetUserPw(u)} className="text-gray-500 hover:underline text-sm">PW초기화</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="6" className="text-center py-8 text-gray-400">사용자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editUser ? '사용자 수정' : '사용자 등록'}</h2>
            {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>이름 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>이메일 *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className={`${inputClass} ${editUser ? 'bg-gray-50 text-gray-500' : ''}`} required disabled={!!editUser} />
              </div>
              {!editUser && (
                <div>
                  <label className={labelClass}>비밀번호 *</label>
                  <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className={inputClass} required />
                </div>
              )}
              <div>
                <label className={labelClass}>역할</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputClass}>
                  <option value="user">사용자</option>
                  <option value="manager">부서장</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>부서</label>
                <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} className={inputClass}>
                  <option value="">선택하세요</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>연락처</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} />
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

      {/* 임시 비밀번호 알림 모달 */}
      {tempPwInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">비밀번호 초기화 완료</h2>
            <p className="text-sm text-gray-500 mb-4">{tempPwInfo.name}의 임시 비밀번호</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-xl font-mono font-bold text-indigo-600 select-all">{tempPwInfo.password}</p>
            </div>
            <p className="text-xs text-gray-400 mb-5">사용자에게 전달해주세요. 첫 로그인 시 비밀번호 변경이 필요합니다.</p>
            <button onClick={() => setTempPwInfo(null)}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
