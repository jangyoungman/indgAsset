import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

const STATUS_STYLE = {
  requested: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  checked_out: 'bg-indigo-50 text-indigo-700',
  returned: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
};
const STATUS_LABEL = {
  requested: '요청중',
  approved: '승인',
  checked_out: '사용중',
  returned: '반납완료',
  rejected: '거절',
};

export default function AssignmentList() {
  const { user, isAdmin, isManagerOrAdmin } = useAuth();
  const { userName, deptName } = useLookup();
  const { getCodeName } = useCode();
  const [tab, setTab] = useState('my');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  // 대여 요청 탭 상태
  const [availableAssets, setAvailableAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [requestModal, setRequestModal] = useState(null);
  const [requestForm, setRequestForm] = useState({ expected_return: '', request_note: '' });
  const [submitting, setSubmitting] = useState(false);

  // 승인/거절 모달
  const [approveModal, setApproveModal] = useState(null);
  const [responseNote, setResponseNote] = useState('');

  // 반납 모달
  const [returnModal, setReturnModal] = useState(null);
  const [returnNote, setReturnNote] = useState('');

  const fetchAssignments = (filter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('status', filter);
    api.get(`/assignments?${params}`)
      .then(res => setAssignments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchAvailableAssets = () => {
    setAssetsLoading(true);
    api.get('/assets?status=available&limit=200')
      .then(res => setAvailableAssets(res.data.data || []))
      .catch(console.error)
      .finally(() => setAssetsLoading(false));
  };

  useEffect(() => {
    if (tab === 'my' || tab === 'pending') fetchAssignments(tab === 'pending' ? 'requested' : statusFilter);
    if (tab === 'request') fetchAvailableAssets();
  }, [tab, statusFilter]);

  const handleRequest = async () => {
    if (!requestModal || !requestForm.expected_return) return;
    setSubmitting(true);
    try {
      await api.post('/assignments/request', {
        asset_id: requestModal.id,
        expected_return: requestForm.expected_return,
        request_note: requestForm.request_note,
      });
      setRequestModal(null);
      setRequestForm({ expected_return: '', request_note: '' });
      setTab('my');
      fetchAssignments('');
    } catch (err) {
      alert(err.response?.data?.error || '요청에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (status) => {
    if (!approveModal) return;
    setSubmitting(true);
    try {
      await api.put(`/assignments/${approveModal.id}/approve`, { status, response_note: responseNote });
      setApproveModal(null);
      setResponseNote('');
      fetchAssignments('requested');
    } catch (err) {
      alert(err.response?.data?.error || '처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!returnModal) return;
    setSubmitting(true);
    try {
      await api.put(`/assignments/${returnModal.id}/return`, { return_note: returnNote });
      setReturnModal(null);
      setReturnNote('');
      fetchAssignments(statusFilter);
    } catch (err) {
      alert(err.response?.data?.error || '반납에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAssets = availableAssets.filter(a =>
    !assetSearch || a.name.includes(assetSearch) || a.asset_code.includes(assetSearch) || (a.category_name || '').includes(assetSearch)
  );

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('ko-KR') : '-';

  const tabs = [
    { key: 'my', label: '내 대여 현황' },
    { key: 'request', label: '대여 요청' },
  ];
  if (isManagerOrAdmin) tabs.push({ key: 'pending', label: '승인 대기' });

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">대여 / 반납</h1>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setStatusFilter(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ====== 내 대여 현황 ====== */}
      {tab === 'my' && (
        <>
          <div className="mb-4">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">전체 상태</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">로딩 중...</div>
          ) : (
            <>
              {/* 모바일 카드 */}
              <div className="lg:hidden flex flex-col gap-3">
                {assignments.map(a => (
                  <div key={a.id} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{a.asset_name}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-indigo-600 mb-2">{a.asset_code}</div>
                    <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                      <div>요청일: {formatDate(a.request_date)}</div>
                      <div>반납예정: {formatDate(a.expected_return)}</div>
                      {a.request_note && <div>메모: {a.request_note}</div>}
                    </div>
                    {a.status === 'checked_out' && (
                      <button onClick={() => { setReturnModal(a); setReturnNote(''); }} className="text-indigo-600 text-xs font-medium">반납</button>
                    )}
                  </div>
                ))}
                {assignments.length === 0 && <div className="text-center py-8 text-gray-400">대여 내역이 없습니다.</div>}
              </div>

              {/* PC 테이블 */}
              <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산코드</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">상태</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">요청일</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">반납예정</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">메모</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{a.asset_name}</td>
                        <td className="px-5 py-3.5 font-mono text-sm text-indigo-600">{a.asset_code}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(a.request_date)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(a.expected_return)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[200px] truncate">{a.request_note || '-'}</td>
                        <td className="px-5 py-3.5">
                          {a.status === 'checked_out' && (
                            <button onClick={() => { setReturnModal(a); setReturnNote(''); }} className="text-indigo-600 hover:underline text-sm">반납</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {assignments.length === 0 && (
                      <tr><td colSpan="7" className="text-center py-8 text-gray-400">대여 내역이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ====== 대여 요청 ====== */}
      {tab === 'request' && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <input
              type="text"
              placeholder="자산명, 코드, 카테고리 검색..."
              value={assetSearch}
              onChange={e => setAssetSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            />
          </div>

          {assetsLoading ? (
            <div className="text-center py-16 text-gray-400">로딩 중...</div>
          ) : (
            <>
              {/* 모바일 카드 */}
              <div className="lg:hidden flex flex-col gap-3">
                {filteredAssets.map(a => (
                  <div key={a.id} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span className="text-sm font-semibold text-gray-900">{a.name}</span>
                        <div className="font-mono text-xs text-indigo-600 mt-0.5">{a.asset_code}</div>
                      </div>
                      <button
                        onClick={() => { setRequestModal(a); setRequestForm({ expected_return: '', request_note: '' }); }}
                        className="shrink-0 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
                      >
                        대여 요청
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">{a.category_name}</div>
                  </div>
                ))}
                {filteredAssets.length === 0 && <div className="text-center py-8 text-gray-400">대여 가능한 자산이 없습니다.</div>}
              </div>

              {/* PC 테이블 */}
              <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산코드</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산명</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">카테고리</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">위치</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(a => (
                      <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-sm text-indigo-600">{a.asset_code}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{a.name}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{a.category_name}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{a.location || '-'}</td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => { setRequestModal(a); setRequestForm({ expected_return: '', request_note: '' }); }}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
                          >
                            대여 요청
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAssets.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-8 text-gray-400">대여 가능한 자산이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ====== 승인 대기 ====== */}
      {tab === 'pending' && isManagerOrAdmin && (
        <>
          {loading ? (
            <div className="text-center py-16 text-gray-400">로딩 중...</div>
          ) : (
            <>
              {/* 모바일 카드 */}
              <div className="lg:hidden flex flex-col gap-3">
                {assignments.map(a => (
                  <div key={a.id} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{a.asset_name}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-indigo-600 mb-1">{a.asset_code}</div>
                    <div className="text-xs text-gray-500 mb-2">
                      <div>요청자: {userName(a.user_id)}</div>
                      <div>요청일: {formatDate(a.request_date)}</div>
                      <div>반납예정: {formatDate(a.expected_return)}</div>
                      {a.request_note && <div>메모: {a.request_note}</div>}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setApproveModal(a); setResponseNote(''); }} className="text-emerald-600 text-xs font-medium">승인</button>
                      <button onClick={() => { setApproveModal({ ...a, _reject: true }); setResponseNote(''); }} className="text-red-500 text-xs font-medium">거절</button>
                    </div>
                  </div>
                ))}
                {assignments.length === 0 && <div className="text-center py-8 text-gray-400">대기중인 요청이 없습니다.</div>}
              </div>

              {/* PC 테이블 */}
              <div className="hidden lg:block bg-white rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">자산코드</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">요청자</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">요청일</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">반납예정</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">메모</th>
                      <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500 font-medium">조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-sm font-medium text-gray-900">{a.asset_name}</td>
                        <td className="px-5 py-3.5 font-mono text-sm text-indigo-600">{a.asset_code}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{userName(a.user_id)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(a.request_date)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(a.expected_return)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 max-w-[200px] truncate">{a.request_note || '-'}</td>
                        <td className="px-5 py-3.5 flex gap-2">
                          <button onClick={() => { setApproveModal(a); setResponseNote(''); }} className="text-emerald-600 hover:underline text-sm">승인</button>
                          <button onClick={() => { setApproveModal({ ...a, _reject: true }); setResponseNote(''); }} className="text-red-500 hover:underline text-sm">거절</button>
                        </td>
                      </tr>
                    ))}
                    {assignments.length === 0 && (
                      <tr><td colSpan="7" className="text-center py-8 text-gray-400">대기중인 요청이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ====== 대여 요청 모달 ====== */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">대여 요청</h2>
            <p className="text-sm text-gray-500 mb-4">{requestModal.name} ({requestModal.asset_code})</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">반납 예정일 *</label>
                <input
                  type="date"
                  value={requestForm.expected_return}
                  onChange={e => setRequestForm(f => ({ ...f, expected_return: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">요청 메모</label>
                <textarea
                  value={requestForm.request_note}
                  onChange={e => setRequestForm(f => ({ ...f, request_note: e.target.value }))}
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="사용 목적 등"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setRequestModal(null)} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                <button
                  onClick={handleRequest}
                  disabled={submitting || !requestForm.expected_return}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {submitting ? '요청 중...' : '대여 요청'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 승인/거절 모달 ====== */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {approveModal._reject ? '대여 거절' : '대여 승인'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {approveModal.asset_name} — 요청자: {userName(approveModal.user_id)}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">응답 메모</label>
                <textarea
                  value={responseNote}
                  onChange={e => setResponseNote(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder={approveModal._reject ? '거절 사유' : '승인 메모 (선택)'}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setApproveModal(null)} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                <button
                  onClick={() => handleApprove(approveModal._reject ? 'rejected' : 'approved')}
                  disabled={submitting}
                  className={`px-5 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition ${approveModal._reject ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {submitting ? '처리 중...' : approveModal._reject ? '거절' : '승인'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== 반납 모달 ====== */}
      {returnModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">반납 처리</h2>
            <p className="text-sm text-gray-500 mb-4">{returnModal.asset_name} ({returnModal.asset_code})</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">반납 메모</label>
                <textarea
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="반납 상태, 비고 등"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setReturnModal(null)} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                <button
                  onClick={handleReturn}
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {submitting ? '처리 중...' : '반납'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
