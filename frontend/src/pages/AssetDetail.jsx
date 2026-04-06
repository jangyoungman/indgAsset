import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';
import { useCode } from '../contexts/CodeContext';

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from || '/assets';
  const backLabel = backTo === '/' ? '← 자산 검색' : '← 자산 목록';
  const { isAdmin, isManagerOrAdmin } = useAuth();
  const { userName, deptName } = useLookup();
  const { getCodeName, getCodeColor, getCodeList } = useCode();
  const [asset, setAsset] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusChanging, setStatusChanging] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/assets/${id}`),
      api.get(`/assets/${id}/logs`),
    ])
      .then(([assetRes, logsRes]) => {
        setAsset(assetRes.data);
        setLogs(logsRes.data);
      })
      .catch(() => navigate('/assets'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleStatusChange = async (newStatus) => {
    if (newStatus === asset.status) return;
    setStatusChanging(true);
    try {
      await api.put(`/assets/${id}`, { status: newStatus });
      const [assetRes, logsRes] = await Promise.all([
        api.get(`/assets/${id}`),
        api.get(`/assets/${id}/logs`),
      ]);
      setAsset(assetRes.data);
      setLogs(logsRes.data);
    } catch (err) {
      alert(err.response?.data?.error || '상태 변경에 실패했습니다.');
    } finally {
      setStatusChanging(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
  if (!asset) return null;

  const info = [
    { label: '자산 코드', value: asset.asset_code, mono: true },
    { label: '카테고리', value: asset.category_name || '-' },
    { label: '부서', value: deptName(asset.department_id) },
    { label: '사용자', value: userName(asset.assigned_to) },
    { label: '시리얼 번호', value: asset.serial_number || '-' },
    { label: 'MAC Address', value: asset.mac_address || '-', mono: true },
    { label: '제조사', value: asset.manufacturer || '-' },
    { label: '모델명', value: asset.model || '-' },
    { label: '위치', value: asset.location || '-' },
    { label: '구매일', value: asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('ko-KR') : '-' },
    { label: '구매 금액', value: asset.purchase_cost ? `${Number(asset.purchase_cost).toLocaleString()}원` : '-' },
    { label: '보증 만료일', value: asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString('ko-KR') : '-' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate(backTo)}
            className="text-sm text-gray-500 hover:text-gray-700 transition mb-1">
            {backLabel}
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{asset.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <select
              value={asset.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusChanging}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500 outline-none ${getCodeColor('ASSET_STATUS', asset.status)} ${statusChanging ? 'opacity-50' : ''}`}
            >
              {getCodeList('ASSET_STATUS').map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          ) : (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCodeColor('ASSET_STATUS', asset.status)}`}>
              {getCodeName('ASSET_STATUS', asset.status)}
            </span>
          )}
          {isManagerOrAdmin && (
            <Link to={`/assets/${id}/edit`}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
              수정
            </Link>
          )}
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">기본 정보</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
          {info.map(item => (
            <div key={item.label}>
              <div className="text-xs text-gray-400 mb-0.5">{item.label}</div>
              <div className={`text-sm text-gray-900 ${item.mono ? 'font-mono' : ''}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Description / Notes */}
      {(asset.description || asset.notes) && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          {asset.description && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">설명</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{asset.description}</p>
            </div>
          )}
          {asset.notes && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">비고</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{asset.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">변경 이력</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">이력이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-100 last:border-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getCodeColor('LOG_ACTION', log.action) || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{getCodeName('LOG_ACTION', log.action)}</span>
                  {log.user_id && <span className="text-gray-500"> · {userName(log.user_id)}</span>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.created_at).toLocaleString('ko-KR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
