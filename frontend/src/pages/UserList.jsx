import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

export default function UserList() {
  const { departments: lookupDepts, deptName } = useLookup();
  const { getCodeName, getCodeColor } = useCode();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const departments = lookupDepts;
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'user', department_id: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState({ key: '', dir: 'asc' });

  const handleSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    );
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (!sort.key) return 0;
    let va, vb;
    if (sort.key === 'role') {
      va = getCodeName('USER_ROLE', a.role) || ''; vb = getCodeName('USER_ROLE', b.role) || '';
    } else if (sort.key === 'department_id') {
      va = deptName(a.department_id); vb = deptName(b.department_id);
    } else if (sort.key === 'status') {
      const statusVal = u => u.login_fail_count >= 5 ? '잠김' : u.is_active ? '활성' : '비활성';
      va = statusVal(a); vb = statusVal(b);
    } else {
      va = a[sort.key] ?? ''; vb = b[sort.key] ?? '';
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

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
    setForm({ email: u.email, password: '', name: u.name, role: u.role, department_id: u.department_id || '', phone: u.phone || '',
      is_homepage_admin: u.is_homepage_admin === 'T', receive_inquiry_email: u.receive_inquiry_email === 'T', receive_asset_email: u.receive_asset_email === 'T' });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editUser) {
        const payload = { name: form.name, role: form.role, department_id: form.department_id ? Number(form.department_id) : null, phone: form.phone, is_active: editUser.is_active,
          is_homepage_admin: form.is_homepage_admin ? 'T' : 'F', receive_inquiry_email: form.receive_inquiry_email ? 'T' : 'F', receive_asset_email: form.receive_asset_email ? 'T' : 'F' };
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
  const [vpnModal, setVpnModal] = useState(null); // { config, ipAddress, publicKey, userName } or { generating: true }
  const [vpnList, setVpnList] = useState(new Set());

  useEffect(() => {
    api.get('/vpn').then(res => setVpnList(new Set(res.data.map(v => v.user_id)))).catch(() => {});
  }, []);

  const handleVpn = async (u) => {
    if (vpnList.has(u.id)) {
      // 이미 있으면 config 조회
      try {
        const res = await api.get(`/vpn/config/${u.id}`);
        setVpnModal({ ...res.data, userName: u.name, userEmail: u.email, userId: u.id });
      } catch (err) {
        alert(err.response?.data?.error || 'VPN 정보를 불러올 수 없습니다.');
      }
    } else {
      // 없으면 생성
      if (!window.confirm(`${u.name}의 VPN 인증서를 생성하시겠습니까?`)) return;
      try {
        const genRes = await api.post('/vpn/generate', { user_id: u.id, user_name: u.name, user_email: u.email });
        setVpnList(prev => new Set([...prev, u.id]));
        // 생성 후 config 조회
        const cfgRes = await api.get(`/vpn/config/${u.id}`);
        setVpnModal({
          ...cfgRes.data,
          userName: u.name,
          userEmail: u.email,
          userId: u.id,
          serverCommand: genRes.data.serverCommand,
          serverConfig: genRes.data.serverConfig,
          justCreated: true,
        });
      } catch (err) {
        alert(err.response?.data?.error || 'VPN 인증서 생성에 실패했습니다.');
      }
    }
  };

  const handleVpnDelete = async (userId) => {
    try {
      const [vpnInfo] = (await api.get('/vpn')).data.filter(v => v.user_id === userId);
      if (!vpnInfo) return;
      if (!window.confirm('VPN 인증서를 삭제하시겠습니까?')) return;
      const res = await api.delete(`/vpn/${vpnInfo.id}`);
      setVpnList(prev => { const n = new Set(prev); n.delete(userId); return n; });
      setVpnModal(null);
      alert(`삭제 완료.\n\nXPS 서버에서 실행:\n${res.data.serverCommand}`);
    } catch (err) {
      alert('삭제 실패');
    }
  };

  const downloadConfig = (config, name) => {
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wg_${name}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
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
        <>
        {/* 모바일 카드 리스트 */}
        <div className="lg:hidden flex flex-col gap-3">
          {sortedUsers.map(u => (
            <div key={u.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-sm font-semibold text-gray-900">{u.name}</span>
                  <div className="text-xs text-gray-400 mt-0.5">{u.email}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCodeColor('USER_ROLE', u.role)}`}>
                    {getCodeName('USER_ROLE', u.role)}
                  </span>
                  {u.login_fail_count >= 5 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">잠김</span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? '활성' : '비활성'}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-3">{deptName(u.department_id)}{u.phone ? ` · ${u.phone}` : ''}</div>
              <div className="flex gap-3 text-xs">
                <button onClick={() => openEdit(u)} className="text-indigo-600 font-medium">수정</button>
                <button onClick={() => toggleActive(u)} className={u.is_active ? 'text-red-500 font-medium' : 'text-emerald-600 font-medium'}>
                  {u.is_active ? '비활성화' : '활성화'}
                </button>
                {u.login_fail_count >= 5 && (
                  <button onClick={() => unlockUser(u)} className="text-amber-600 font-medium">잠금해제</button>
                )}
                <button onClick={() => resetUserPw(u)} className="text-gray-500 font-medium">PW초기화</button>
                <button onClick={() => handleVpn(u)} className={`font-medium ${vpnList.has(u.id) ? 'text-emerald-600' : 'text-indigo-600'}`}>
                  {vpnList.has(u.id) ? 'VPN🔑' : 'VPN+'}
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-center py-8 text-gray-400">사용자가 없습니다.</div>
          )}
        </div>

        <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: 'name', label: '이름' },
                  { key: 'email', label: '이메일' },
                  { key: 'role', label: '역할' },
                  { key: 'department_id', label: '부서' },
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
              {sortedUsers.map(u => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCodeColor('USER_ROLE', u.role)}`}>
                      {getCodeName('USER_ROLE', u.role)}
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
                    <button onClick={() => handleVpn(u)} className={`hover:underline text-sm ${vpnList.has(u.id) ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      {vpnList.has(u.id) ? 'VPN🔑' : 'VPN+'}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="6" className="text-center py-8 text-gray-400">사용자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
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
              {editUser && (
                <div>
                  <label className={labelClass}>이메일 수신 설정</label>
                  <div className="space-y-2 mt-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.is_homepage_admin || false} onChange={e => setForm(f => ({ ...f, is_homepage_admin: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      홈페이지 관리자
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.receive_inquiry_email || false} onChange={e => setForm(f => ({ ...f, receive_inquiry_email: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      홈페이지 문의 이메일 수신
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form.receive_asset_email || false} onChange={e => setForm(f => ({ ...f, receive_asset_email: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      자산 대여 요청 이메일 수신
                    </label>
                  </div>
                </div>
              )}
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

      {/* VPN 모달 */}
      {vpnModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">VPN 인증서</h2>
            <p className="text-sm text-gray-500 mb-4">{vpnModal.userName}</p>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">IP 주소</span>
                <span className="font-mono text-gray-900">{vpnModal.ipAddress}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Public Key</span>
                <span className="font-mono text-xs text-gray-900 break-all">{vpnModal.publicKey}</span>
              </div>
            </div>

            {/* 설정 파일 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap select-all">{vpnModal.config}</pre>
            </div>

            {/* 서버 명령어 (생성 직후에만 표시) */}
            {vpnModal.justCreated && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-amber-700 mb-2">XPS 서버에서 실행하세요:</p>
                <pre className="text-xs font-mono text-amber-900 whitespace-pre-wrap select-all">{vpnModal.serverCommand}</pre>
                <p className="text-xs font-medium text-amber-700 mt-3 mb-2">wg0.conf에 추가:</p>
                <pre className="text-xs font-mono text-amber-900 whitespace-pre-wrap select-all">{vpnModal.serverConfig}</pre>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => downloadConfig(vpnModal.config, vpnModal.userName)}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                설정파일 다운로드
              </button>
              <button
                onClick={() => handleVpnDelete(vpnModal.userId)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition"
              >
                삭제
              </button>
              <button
                onClick={() => setVpnModal(null)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
