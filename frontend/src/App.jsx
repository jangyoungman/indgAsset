import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CodeProvider } from './contexts/CodeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AssetList from './pages/AssetList';
import AssetForm from './pages/AssetForm';
import AssetDetail from './pages/AssetDetail';
import AssetBulkUpload from './pages/AssetBulkUpload';
import UserList from './pages/UserList';
import CodeManagement from './pages/CodeManagement';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">로딩 중...</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/assets" />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <CodeProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={
              <PrivateRoute roles={['admin', 'manager']}>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="assets" element={<AssetList />} />
            <Route path="assets/new" element={
              <PrivateRoute roles={['admin', 'manager']}>
                <AssetForm />
              </PrivateRoute>
            } />
            <Route path="assets/bulk-upload" element={<PrivateRoute roles={['admin']}><AssetBulkUpload /></PrivateRoute>} />
            <Route path="assets/:id" element={<AssetDetail />} />
            <Route path="assets/:id/edit" element={
              <PrivateRoute roles={['admin', 'manager']}>
                <AssetForm />
              </PrivateRoute>
            } />
            <Route path="users" element={
              <PrivateRoute roles={['admin']}>
                <UserList />
              </PrivateRoute>
            } />
            <Route path="system/codes" element={
              <PrivateRoute roles={['admin']}>
                <CodeManagement />
              </PrivateRoute>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </BrowserRouter>
      </CodeProvider>
    </AuthProvider>
  );
}
