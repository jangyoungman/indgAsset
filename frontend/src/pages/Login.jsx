import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

export default function Login() {
  const savedEmail = localStorage.getItem('savedEmail') || '';
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(!!savedEmail);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // 아이디 찾기 상태
  const [showFindId, setShowFindId] = useState(false);
  const [findName, setFindName] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [findResult, setFindResult] = useState('');
  const [findError, setFindError] = useState('');
  const [findLoading, setFindLoading] = useState(false);

  // 비밀번호 찾기 상태
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetName, setResetName] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetNewPw, setResetNewPw] = useState('');
  const [resetConfirmPw, setResetConfirmPw] = useState('');
  const [resetVerified, setResetVerified] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // 비밀번호 변경 강제 모달
  const [showChangePw, setShowChangePw] = useState(false);
  const [changeCurrent, setChangeCurrent] = useState('');
  const [changeNew, setChangeNew] = useState('');
  const [changeConfirm, setChangeConfirm] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (rememberEmail) {
        localStorage.setItem('savedEmail', email);
      } else {
        localStorage.removeItem('savedEmail');
      }
      const data = await login(email, password);
      if (data.user.must_change_password) {
        setShowChangePw(true);
        setChangeCurrent(password);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 아이디 찾기
  const handleFindId = async (e) => {
    e.preventDefault();
    setFindError('');
    setFindResult('');
    setFindLoading(true);
    try {
      const res = await api.post('/auth/find-id', { name: findName, phone: findPhone });
      setFindResult(res.data.email);
    } catch (err) {
      setFindError(err.response?.data?.error || '아이디를 찾을 수 없습니다.');
    } finally {
      setFindLoading(false);
    }
  };

  const openFindId = () => {
    setFindName(''); setFindPhone(''); setFindResult(''); setFindError('');
    setShowFindId(true);
  };

  // 비밀번호 찾기 - 본인 인증
  const handleResetVerify = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      await api.post('/auth/find-id', { name: resetName, phone: resetPhone });
      setResetVerified(true);
    } catch (err) {
      setResetError(err.response?.data?.error || '일치하는 사용자를 찾을 수 없습니다.');
    } finally {
      setResetLoading(false);
    }
  };

  // 비밀번호 찾기 - 새 비밀번호 설정
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    if (resetNewPw !== resetConfirmPw) {
      setResetError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (resetNewPw.length < 6) {
      setResetError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setResetLoading(true);
    try {
      await api.post('/auth/reset-password', { name: resetName, phone: resetPhone, newPassword: resetNewPw });
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.response?.data?.error || '비밀번호 변경에 실패했습니다.');
    } finally {
      setResetLoading(false);
    }
  };

  const openResetPw = () => {
    setResetName(''); setResetPhone(''); setResetNewPw(''); setResetConfirmPw('');
    setResetVerified(false); setResetError(''); setResetSuccess(false);
    setShowResetPw(true);
  };

  // 비밀번호 변경 강제
  const handleChangePw = async (e) => {
    e.preventDefault();
    setChangeError('');
    if (changeNew !== changeConfirm) {
      setChangeError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (changeNew.length < 6) {
      setChangeError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setChangeLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: changeCurrent, newPassword: changeNew });
      setShowChangePw(false);
      navigate('/');
    } catch (err) {
      setChangeError(err.response?.data?.error || '비밀번호 변경에 실패했습니다.');
    } finally {
      setChangeLoading(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">Asset Manager</h1>
          <p className="text-gray-400 mt-2 text-sm">자산관리 시스템에 로그인하세요</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className={labelClass}>아이디</label>
            <input type="text" placeholder="아이디를 입력하세요" className={inputClass}
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={rememberEmail} onChange={e => setRememberEmail(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-gray-500">아이디 저장</span>
          </label>
          <div className="mb-6">
            <label className={labelClass}>비밀번호</label>
            <input type="password" className={inputClass}
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="flex justify-center gap-4 mt-4">
          <button onClick={openFindId} className="text-sm text-gray-400 hover:text-indigo-600 transition">
            아이디 찾기
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={openResetPw} className="text-sm text-gray-400 hover:text-indigo-600 transition">
            비밀번호 찾기
          </button>
        </div>
      </div>

      {/* 아이디 찾기 모달 */}
      {showFindId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">아이디 찾기</h2>
            <p className="text-sm text-gray-400 mb-5">등록된 이름과 연락처를 입력하세요.</p>
            {findError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{findError}</div>}
            {findResult ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">찾은 아이디</p>
                <p className="text-lg font-semibold text-indigo-600">{findResult}</p>
                <button onClick={() => setShowFindId(false)}
                  className="mt-5 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition">
                  로그인 화면으로
                </button>
              </div>
            ) : (
              <form onSubmit={handleFindId} className="space-y-4">
                <div>
                  <label className={labelClass}>이름</label>
                  <input value={findName} onChange={e => setFindName(e.target.value)}
                    placeholder="이름을 입력하세요" className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>연락처</label>
                  <input value={findPhone} onChange={e => setFindPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="숫자만 입력하세요" inputMode="numeric" className={inputClass} required />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowFindId(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                  <button type="submit" disabled={findLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {findLoading ? '찾는 중...' : '아이디 찾기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 비밀번호 찾기 모달 */}
      {showResetPw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">비밀번호 찾기</h2>
            <p className="text-sm text-gray-400 mb-5">
              {resetSuccess ? '비밀번호가 변경되었습니다.' : resetVerified ? '새 비밀번호를 설정하세요.' : '본인 인증을 진행하세요.'}
            </p>
            {resetError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{resetError}</div>}

            {resetSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 mb-4">새 비밀번호로 로그인해주세요.</p>
                <button onClick={() => setShowResetPw(false)}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition">
                  로그인 화면으로
                </button>
              </div>
            ) : !resetVerified ? (
              <form onSubmit={handleResetVerify} className="space-y-4">
                <div>
                  <label className={labelClass}>이름</label>
                  <input value={resetName} onChange={e => setResetName(e.target.value)}
                    placeholder="이름을 입력하세요" className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>연락처</label>
                  <input value={resetPhone} onChange={e => setResetPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="숫자만 입력하세요" inputMode="numeric" className={inputClass} required />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowResetPw(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                  <button type="submit" disabled={resetLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {resetLoading ? '확인 중...' : '본인 인증'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className={labelClass}>새 비밀번호</label>
                  <input type="password" value={resetNewPw} onChange={e => setResetNewPw(e.target.value)}
                    placeholder="6자 이상 입력하세요" className={inputClass} required />
                </div>
                <div>
                  <label className={labelClass}>새 비밀번호 확인</label>
                  <input type="password" value={resetConfirmPw} onChange={e => setResetConfirmPw(e.target.value)}
                    placeholder="비밀번호를 다시 입력하세요" className={inputClass} required />
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowResetPw(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">취소</button>
                  <button type="submit" disabled={resetLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                    {resetLoading ? '변경 중...' : '비밀번호 변경'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 비밀번호 변경 강제 모달 */}
      {showChangePw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">비밀번호 변경 필요</h2>
            <p className="text-sm text-gray-400 mb-5">보안을 위해 비밀번호를 변경해주세요.</p>
            {changeError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">{changeError}</div>}
            <form onSubmit={handleChangePw} className="space-y-4">
              <div>
                <label className={labelClass}>새 비밀번호</label>
                <input type="password" value={changeNew} onChange={e => setChangeNew(e.target.value)}
                  placeholder="6자 이상 입력하세요" className={inputClass} required />
              </div>
              <div>
                <label className={labelClass}>새 비밀번호 확인</label>
                <input type="password" value={changeConfirm} onChange={e => setChangeConfirm(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요" className={inputClass} required />
              </div>
              <button type="submit" disabled={changeLoading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
                {changeLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
