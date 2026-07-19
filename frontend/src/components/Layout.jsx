import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children, activeNav }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  const navItems = [
    { id: 'home',    icon: 'fa-house',      label: 'Dashboard',    path: '/' },
    { id: 'cloud',   icon: 'fa-cloud',      label: 'TG Cloud',     path: '/cloud', dot: true },
  ];

  return (
    <>
      {/* Header */}
      <header className="hdr">
        <div className="ls">
          <button className="mt" style={{ display:'flex' }} onClick={() => setSidebarOpen(o => !o)}>
            <i className="fas fa-bars" />
          </button>
          <Link to="/" className="lt" style={{ gap: 10 }}>
            <img src="/logo.svg" alt="Vinnoflow" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
            Vinnoflow
          </Link>
        </div>
        <div className="ha">
          <button className="ib" title="Logout" onClick={handleLogout}>
            <i className="fas fa-right-from-bracket" />
          </button>
        </div>
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          style={{ position:'fixed', inset:0, zIndex:998, background:'rgba(0,0,0,0.5)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sb${sidebarOpen ? ' open' : ''}`}
        style={{ transform: sidebarOpen ? 'none' : undefined }}
      >
        {/* User profile block */}
        <Link to="/profile" className="up" style={{ textDecoration:'none' }}>
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt="avatar" className="up-av" style={{ objectFit:'cover' }} />
            : <div className="up-av">{initials}</div>
          }
          <div>
            <h3>{user?.displayName || 'Admin'}</h3>
            <p>{user?.email || ''}</p>
          </div>
        </Link>

        <div className="nt">Navigation</div>

        {navItems.map(item => (
          <Link
            key={item.id}
            to={item.path}
            className={`ni${(activeNav || location.pathname) === item.path || (item.id === 'cloud' && location.pathname.startsWith('/cloud')) ? ' ac' : ''}`}
            style={{ textDecoration:'none' }}
            onClick={() => setSidebarOpen(false)}
          >
            <i className={`fas ${item.icon}`} />
            {item.label}
            {item.dot && <span className="ni-dot" />}
          </Link>
        ))}
      </aside>

      {/* Main content */}
      <main className="mc">
        {children}
      </main>
    </>
  );
}
