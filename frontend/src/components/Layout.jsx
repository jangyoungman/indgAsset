import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCode } from '../contexts/CodeContext';
import { useLookup } from '../hooks/useLookup';
import api from '../utils/api';

// Inline SVG icons (20x20)
const icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="11" y="2" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="2" y="11" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="11" y="11" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  ),
  assets: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2L18 6V14L10 18L2 14V6L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M10 2L10 18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6L10 10L18 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  assignments: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7H17M17 7L13 3M17 7L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 13H3M3 13L7 9M3 13L7 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M2 17C2 13.686 4.686 11 8 11C9.38 11 10.657 11.464 11.674 12.243" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="15" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M15 12V14H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 2C10 2 6 4 6 9V14H14V9C14 4 10 2 10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M8 14V15C8 16.105 8.895 17 10 17C11.105 17 12 16.105 12 15V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="10" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13C11.6569 13 13 11.6569 13 10C13 8.34315 11.6569 7 10 7C8.34315 7 7 8.34315 7 10C7 11.6569 8.34315 13 10 13Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function Layout() {
  const { user, logout, isAdmin, isManagerOrAdmin } = useAuth();
  const { getCodeName } = useCode();
  const { deptName } = useLookup();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchNotifications = () => {
      api.get('/notifications/unread-count')
        .then(res => setUnreadCount(res.data.count))
        .catch(() => {});
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { to: '/', label: '대시보드', icon: icons.dashboard, roles: ['admin', 'manager'] },
    { to: '/assets', label: '자산 목록', icon: icons.assets, roles: ['admin', 'manager', 'user'] },
    { to: '/assignments', label: '대여/반납', icon: icons.assignments, roles: ['admin', 'manager', 'user'] },
    { to: '/users', label: '사용자 관리', icon: icons.users, roles: ['admin'] },
    { to: '/system/codes', label: '공통코드 관리', icon: icons.settings, roles: ['admin'] },
  ];

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const userInitial = user.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`bg-gray-900 flex flex-col flex-shrink-0 transition-all duration-200 ${sidebarOpen ? 'w-60' : 'w-16'}`}
        style={{ minHeight: '100vh' }}
      >
        {/* Top: App name + collapse toggle */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          {sidebarOpen && (
            <span className="text-indigo-400 font-bold text-base whitespace-nowrap">Asset Manager</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
            title={sidebarOpen ? '접기' : '펼치기'}
          >
            {sidebarOpen ? icons.chevronLeft : icons.chevronRight}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-2 px-2">
          {navItems
            .filter(item => item.roles.includes(user.role))
            .map(item => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                    active
                      ? 'bg-indigo-500/10 text-indigo-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {sidebarOpen && (
                    <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })
          }
        </nav>

        {/* Bottom: user info + logout */}
        <div className="border-t border-gray-800 px-3 py-4">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {userInitial}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{user.name}</div>
                <div className="text-xs text-gray-400 truncate">
                  {getCodeName('USER_ROLE', user.role)}{user.department_id ? ` · ${deptName(user.department_id)}` : ''}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-3">
              <div
                className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold"
                title={user.name}
              >
                {userInitial}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`w-full text-xs text-gray-400 hover:text-red-400 transition-colors ${
              sidebarOpen ? 'text-left px-1' : 'text-center'
            }`}
          >
            {sidebarOpen ? '로그아웃' : <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div />
          <div className="flex items-center gap-4">
            {/* Bell icon with unread badge */}
            <Link to="/notifications" className="relative text-gray-500 hover:text-gray-700 transition-colors">
              {icons.bell}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Avatar + user name */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                {userInitial}
              </div>
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
