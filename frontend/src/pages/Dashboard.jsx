import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLookup } from '../hooks/useLookup';

export default function Dashboard() {
  const { user } = useAuth();
  const { userName, deptName } = useLookup();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
  if (!stats) return <div className="p-8 text-center text-gray-400">데이터를 불러올 수 없습니다.</div>;

  const statusMap = {
    available: { label: '사용 가능', textColor: 'text-emerald-600', dotColor: 'bg-emerald-500' },
    in_use: { label: '사용 중', textColor: 'text-indigo-600', dotColor: 'bg-indigo-500' },
    maintenance: { label: '정비 중', textColor: 'text-amber-600', dotColor: 'bg-amber-500' },
    disposed: { label: '폐기', textColor: 'text-gray-400', dotColor: 'bg-gray-400' },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500 mt-1">안녕하세요, {user.name}님!</p>
      </div>

      {/* 상태별 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {stats.statusCounts.map(s => {
          const meta = statusMap[s.status] || { label: s.status, textColor: 'text-gray-600', dotColor: 'bg-gray-400' };
          return (
            <div key={s.status} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-block w-2 h-2 rounded-full ${meta.dotColor}`} />
                <span className="text-sm text-gray-500 font-medium">{meta.label}</span>
              </div>
              <div className={`text-2xl font-bold ${meta.textColor}`}>{s.count}</div>
            </div>
          );
        })}
      </div>

      {/* 총 자산 가치 & 대기 중 승인 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="text-sm text-gray-500 font-medium mb-3">총 자산 가치</div>
          <div className="text-2xl font-bold text-indigo-600">
            {Number(stats.totalValue).toLocaleString()}원
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="text-sm text-gray-500 font-medium mb-3">대기 중 승인</div>
          <div className="text-2xl font-bold text-orange-600">{stats.pendingApprovals}건</div>
        </div>
      </div>

      {/* 카테고리별 / 부서별 자산 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">카테고리별 자산</h2>
          <div className="space-y-1">
            {stats.categoryCounts.map(c => (
              <div key={c.category} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{c.category}</span>
                <span className="text-sm font-medium text-gray-900">{c.count}개</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">부서별 자산</h2>
          <div className="space-y-1">
            {stats.departmentCounts.map(d => (
              <div key={d.department_id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{deptName(d.department_id)}</span>
                <span className="text-sm font-medium text-gray-900">{d.count}개</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 경고 섹션 */}
      {stats.overdueAssignments.length > 0 && (
        <div className="bg-white border-l-4 border-red-400 rounded-xl shadow-sm p-5 mb-4">
          <h3 className="text-sm font-semibold text-red-600 mb-3">
            연체된 대여 ({stats.overdueAssignments.length}건)
          </h3>
          <div className="space-y-1">
            {stats.overdueAssignments.map(a => (
              <div key={a.id} className="text-sm text-gray-600">
                {a.asset_name} — {userName(a.user_id)} (반납 예정: {a.expected_return})
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.expiringWarranties.length > 0 && (
        <div className="bg-white border-l-4 border-amber-400 rounded-xl shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-amber-600 mb-3">
            보증 만료 임박 ({stats.expiringWarranties.length}건)
          </h3>
          <div className="space-y-1">
            {stats.expiringWarranties.map(w => (
              <div key={w.id} className="text-sm text-gray-600">
                {w.name} ({w.asset_code}) — 만료일: {w.warranty_expiry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 활동 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">최근 활동</h2>
        <div className="space-y-1">
          {stats.recentLogs.map(log => (
            <div key={log.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-medium">{log.action}</span>
              <span className="text-sm text-gray-700">{log.asset_name} ({log.asset_code})</span>
              <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
