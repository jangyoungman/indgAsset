import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const INITIAL = {
  name: '',
  assigned_to: '',
  category_id: '',
  description: '',
  serial_number: '',
  mac_address: '',
  manufacturer: '',
  model: '',
  purchase_date: '',
  purchase_cost: '',
  warranty_expiry: '',
  location: '',
  department_id: '',
  notes: '',
};

function formatDate(val) {
  if (!val) return '';
  return new Date(val).toISOString().split('T')[0];
}

export default function AssetForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(INITIAL);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/assets/categories').then(res => setCategories(res.data)).catch(() => {});
    api.get('/assets/departments').then(res => setDepartments(res.data)).catch(() => {});
    api.get('/assets/users').then(res => setUsers(res.data)).catch(() => {});

    if (isEdit) {
      api.get(`/assets/${id}`)
        .then(res => {
          const a = res.data;
          setForm({
            name: a.name || '',
            assigned_to: a.assigned_to || '',
            category_id: a.category_id || '',
            description: a.description || '',
            serial_number: a.serial_number || '',
            mac_address: a.mac_address || '',
            manufacturer: a.manufacturer || '',
            model: a.model || '',
            purchase_date: formatDate(a.purchase_date),
            purchase_cost: a.purchase_cost || '',
            warranty_expiry: formatDate(a.warranty_expiry),
            location: a.location || '',
            department_id: a.department_id || '',
            notes: a.notes || '',
          });
        })
        .catch(() => navigate('/assets'))
        .finally(() => setFetching(false));
    }
  }, [id, isEdit, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.category_id) payload.category_id = Number(payload.category_id);
      if (payload.department_id) payload.department_id = Number(payload.department_id);
      if (payload.purchase_cost) payload.purchase_cost = Number(payload.purchase_cost);
      if (payload.assigned_to) payload.assigned_to = Number(payload.assigned_to);
      if (!payload.category_id) delete payload.category_id;
      if (!payload.department_id) delete payload.department_id;
      if (!payload.purchase_cost) delete payload.purchase_cost;
      if (!payload.assigned_to) payload.assigned_to = null;

      if (isEdit) {
        await api.put(`/assets/${id}`, payload);
        navigate(`/assets/${id}`);
      } else {
        await api.post('/assets', payload);
        navigate('/assets');
      }
    } catch (err) {
      setError(err.response?.data?.error || (isEdit ? '자산 수정에 실패했습니다.' : '자산 등록에 실패했습니다.'));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

  const inputClass = 'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition';
  const labelClass = 'block text-sm font-medium text-gray-600 mb-1.5';

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? '자산 수정' : '자산 등록'}</h1>
        <button onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}
          className="text-sm text-gray-500 hover:text-gray-700 transition">
          ← 돌아가기
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-6 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <label className={labelClass}>자산명 *</label>
          <input name="name" value={form.name} onChange={handleChange}
            placeholder="예: MacBook Pro 16" className={inputClass} required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>카테고리</label>
            <select name="category_id" value={form.category_id} onChange={handleChange} className={inputClass}>
              <option value="">선택하세요</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>부서</label>
            <select name="department_id" value={form.department_id} onChange={handleChange} className={inputClass}>
              <option value="">선택하세요</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>사용자</label>
          <select name="assigned_to" value={form.assigned_to} onChange={handleChange} className={inputClass}>
            <option value="">없음</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>시리얼 번호</label>
            <input name="serial_number" value={form.serial_number} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>MAC Address</label>
            <input name="mac_address" value={form.mac_address} onChange={handleChange}
              placeholder="예: AA:BB:CC:DD:EE:FF" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>제조사</label>
            <input name="manufacturer" value={form.manufacturer} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>모델명</label>
            <input name="model" value={form.model} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className={labelClass}>구매일</label>
            <input type="date" name="purchase_date" value={form.purchase_date} onChange={handleChange} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>구매 금액 (원)</label>
            <input type="number" name="purchase_cost" value={form.purchase_cost} onChange={handleChange}
              placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>보증 만료일</label>
            <input type="date" name="warranty_expiry" value={form.warranty_expiry} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>위치</label>
          <input name="location" value={form.location} onChange={handleChange}
            placeholder="예: 본사 3층 IT룸" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>설명</label>
          <textarea name="description" value={form.description} onChange={handleChange}
            rows={3} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>비고</label>
          <textarea name="notes" value={form.notes} onChange={handleChange}
            rows={2} className={inputClass} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
            취소
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {loading ? (isEdit ? '수정 중...' : '등록 중...') : (isEdit ? '자산 수정' : '자산 등록')}
          </button>
        </div>
      </form>
    </div>
  );
}
