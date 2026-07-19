import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const modules = [
  {
    id: 'cloud',
    icon: 'fa-cloud',
    iconClass: '',
    title: 'TG Cloud',
    desc: 'Manage, stream, and organise files stored in your Telegram channels.',
    tag: { label: 'Active', cls: 'active' },
    path: '/cloud',
  },
  {
    id: 'scrapers',
    icon: 'fa-spider',
    iconClass: 'amber',
    title: 'Scrapers',
    desc: 'Automated content scraping from various sources like HDHub4u.',
    tag: { label: 'Active', cls: 'active' },
    path: '/scrapers',
  },
  {
    id: 'bot',
    icon: 'fa-robot',
    iconClass: 'amber',
    title: 'Bot Manager',
    desc: 'Configure autoresponders, forwarding rules, and bot workflows.',
    tag: { label: 'Coming Soon', cls: 'soon' },
    path: null,
  },
  {
    id: 'scheduler',
    icon: 'fa-clock',
    iconClass: '',
    title: 'Scheduler',
    desc: 'Schedule messages and media to any chat or channel at any time.',
    tag: { label: 'Coming Soon', cls: 'soon' },
    path: null,
  },
  {
    id: 'analytics',
    icon: 'fa-chart-line',
    iconClass: 'amber',
    title: 'Analytics',
    desc: 'Deep insights into your channels: views, reach, and engagement.',
    tag: { label: 'Coming Soon', cls: 'soon' },
    path: null,
  },
  {
    id: 'backup',
    icon: 'fa-hard-drive',
    iconClass: '',
    title: 'Auto Backup',
    desc: 'Automatically back up chats and media to your storage.',
    tag: { label: 'Beta', cls: 'blue' },
    path: null,
  },
  {
    id: 'forwarder',
    icon: 'fa-forward',
    iconClass: 'amber',
    title: 'Auto Forwarder',
    desc: 'Forward messages between chats and channels with smart filters.',
    tag: { label: 'Coming Soon', cls: 'soon' },
    path: null,
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Layout activeNav="/">
      <div className="page-header">
        <h1>{greeting}, {user?.displayName || 'Admin'} 👋</h1>
        <p>Welcome to your Vinnoflow automation hub. Choose a module to get started.</p>
      </div>

      <div className="cards-grid">
        {modules.map(mod => (
          <div
            key={mod.id}
            className={`card${mod.path ? '' : ' soon'}`}
            onClick={() => mod.path && navigate(mod.path)}
            role={mod.path ? 'button' : undefined}
            tabIndex={mod.path ? 0 : undefined}
            onKeyDown={e => mod.path && e.key === 'Enter' && navigate(mod.path)}
          >
            <div className={`card-icon${mod.iconClass ? ' ' + mod.iconClass : ''}`}>
              <i className={`fas ${mod.icon}`} />
            </div>
            <div>
              <div className="card-title">{mod.title}</div>
              <div className="card-desc">{mod.desc}</div>
            </div>
            <div className={`card-tag ${mod.tag.cls}`}>
              {mod.tag.label}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}