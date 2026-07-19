import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// ═══════════════════════════════════════════════════════════
// Reusable Components
// ═══════════════════════════════════════════════════════════

function SectionCard({ id, icon, title, description, badge, children }) {
  return (
    <section
      id={id}
      style={{
        background: 'var(--surf-2)',
        border: '1px solid var(--brd)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 24,
        overflow: 'hidden',
        scrollMarginTop: 140,
      }}
    >
      <div
        style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--brd)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 36, height: 36,
              background: 'var(--pri-lo)',
              border: '1px solid var(--pri-mid)',
              borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--pri-h)', fontSize: 15, flexShrink: 0,
            }}
          >
            <i className={`fas ${icon}`} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.01em' }}>
              {title}
            </div>
            {description && (
              <div style={{ fontSize: 12.5, color: 'var(--txt-m)', marginTop: 3, lineHeight: 1.5 }}>
                {description}
              </div>
            )}
          </div>
        </div>
        {badge}
      </div>
      <div style={{ padding: '24px' }}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, marginBottom: 4 }}>
      <label
        style={{
          display: 'block', fontSize: 12, fontWeight: 500,
          color: 'var(--txt-m)', marginBottom: 7, letterSpacing: '-0.005em',
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--txt-d)', marginTop: 6, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Message({ ok, msg, onDismiss }) {
  if (!msg) return null;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px', borderRadius: 'var(--radius)', fontSize: 13,
        background: ok ? 'var(--green-lo)' : 'var(--red-lo)',
        border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        color: ok ? 'var(--green)' : 'var(--red)',
        marginBottom: 18, fontWeight: 500,
      }}
    >
      <i className={`fas ${ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} style={{ fontSize: 14 }} />
      <span style={{ flex: 1 }}>{msg}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'transparent', border: 'none', color: 'inherit',
            cursor: 'pointer', opacity: 0.6, fontSize: 12, padding: 2,
          }}
        >
          <i className="fas fa-times" />
        </button>
      )}
    </div>
  );
}

function StatusBadge({ connected }) {
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: connected ? 'var(--green-lo)' : 'var(--surf-3)',
        border: `1px solid ${connected ? 'rgba(16,185,129,0.3)' : 'var(--brd)'}`,
        color: connected ? 'var(--green)' : 'var(--txt-d)',
        borderRadius: 99, padding: '4px 11px',
        fontSize: 11, fontWeight: 600, flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--txt-d)',
          boxShadow: connected ? '0 0 8px var(--green)' : 'none',
        }}
      />
      {connected ? 'Connected' : 'Not connected'}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Horizontal Tab Navigation
// ═══════════════════════════════════════════════════════════

function TabNav({ sections, activeId, onNavigate }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 'var(--header-h)',
        background: 'var(--bg)',
        zIndex: 50,
        borderBottom: '1px solid var(--brd)',
        marginBottom: 28,
        marginLeft: -24,
        marginRight: -24,
        marginTop: -8,
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
        className="profile-tabs"
      >
        {sections.map(s => {
          const isActive = activeId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 18px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: 500,
                color: isActive ? 'var(--txt)' : 'var(--txt-m)',
                borderBottom: `2px solid ${isActive ? 'var(--pri)' : 'transparent'}`,
                transition: 'all var(--trans)',
                whiteSpace: 'nowrap',
                marginBottom: -1,
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--txt)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--txt-m)';
              }}
            >
              <i
                className={`fas ${s.icon}`}
                style={{
                  fontSize: 12.5,
                  color: isActive ? 'var(--pri-h)' : 'inherit',
                }}
              />
              {s.label}
              {s.badge && (
                <span
                  style={{
                    background: 'var(--pri-lo)',
                    color: 'var(--pri-h)',
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 99,
                    marginLeft: 2,
                  }}
                >
                  {s.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Profile Component
// ═══════════════════════════════════════════════════════════

export default function Profile() {
  const { user, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [profileMsg, setProfileMsg] = useState({ ok: false, msg: '' });
  const [profileBusy, setProfileBusy] = useState(false);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState({ ok: false, msg: '' });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [botToken, setBotToken] = useState('');
  const [dbChannelId, setDbChannelId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [tgConnected, setTgConnected] = useState(false);
  const [tgMsg, setTgMsg] = useState({ ok: false, msg: '' });
  const [tgBusy, setTgBusy] = useState(false);
  const [tgConnBusy, setTgConnBusy] = useState(false);
  const [showTgSecrets, setShowTgSecrets] = useState(false);

  const [activeSection, setActiveSection] = useState('profile');
  const observerRef = useRef(null);

  const sections = [
    { id: 'profile',  label: 'Profile',       icon: 'fa-user' },
    { id: 'security', label: 'Security',      icon: 'fa-lock' },
    { id: 'telegram', label: 'Cloud Storage', icon: 'fa-cloud' },
  ];

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setAvatarPreview(user.avatarUrl || '');
    }
    fetchTgCreds();
  }, [user]);

  useEffect(() => {
    const options = { rootMargin: '-40% 0px -50% 0px', threshold: 0 };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveSection(entry.target.id);
      });
    }, options);

    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);

  const fetchTgCreds = async () => {
    try {
      const res = await fetch('/profile/get-telegram-creds', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setApiId(data.apiId || '');
        setApiHash(data.apiHash || '');
        setBotToken(data.botToken || '');
        setDbChannelId(data.dbChannelId || '');
        setOwnerId(data.ownerId || '');
        setTgConnected(data.connected || false);
      }
    } catch {}
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ ok: false, msg: 'Image too large (max 2 MB)' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileMsg({ ok: false, msg: '' });
    setProfileBusy(true);
    try {
      const res = await fetch('/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName, email, avatarBase64: avatarPreview }),
      });
      const data = await res.json();
      if (data.ok) {
        await refreshUser();
        setProfileMsg({ ok: true, msg: 'Profile updated successfully!' });
      } else {
        setProfileMsg({ ok: false, msg: data.error || 'Failed to update profile' });
      }
    } catch (e) {
      setProfileMsg({ ok: false, msg: e.message });
    }
    setProfileBusy(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwdMsg({ ok: false, msg: '' });
    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, msg: 'New passwords do not match' });
      return;
    }
    if (newPwd.length < 8) {
      setPwdMsg({ ok: false, msg: 'New password must be at least 8 characters' });
      return;
    }
    setPwdBusy(true);
    try {
      const res = await fetch('/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current: curPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (data.ok) {
        setCurPwd(''); setNewPwd(''); setConfirmPwd('');
        setPwdMsg({ ok: true, msg: 'Password changed successfully!' });
      } else {
        setPwdMsg({ ok: false, msg: data.error || 'Failed to change password' });
      }
    } catch (e) {
      setPwdMsg({ ok: false, msg: e.message });
    }
    setPwdBusy(false);
  };

  const handleTgSave = async (e) => {
    e.preventDefault();
    setTgMsg({ ok: false, msg: '' });
    setTgBusy(true);
    try {
      const res = await fetch('/profile/update-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiId, apiHash, botToken, dbChannelId, ownerId }),
      });
      const data = await res.json();
      if (data.ok) setTgMsg({ ok: true, msg: 'Credentials saved successfully!' });
      else setTgMsg({ ok: false, msg: data.error || 'Failed to save' });
    } catch (e) {
      setTgMsg({ ok: false, msg: e.message });
    }
    setTgBusy(false);
  };

  const handleTgConnect = async () => {
    setTgMsg({ ok: false, msg: '' });
    setTgConnBusy(true);
    try {
      const res = await fetch('/profile/connect-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        setTgConnected(true);
        setTgMsg({ ok: true, msg: 'Telegram connected successfully!' });
      } else {
        setTgMsg({ ok: false, msg: data.error || 'Failed to connect' });
      }
    } catch (e) {
      setTgMsg({ ok: false, msg: e.message });
    }
    setTgConnBusy(false);
  };

  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'A';

  return (
    <Layout activeNav="/profile">
      <style>{`
        .profile-tabs::-webkit-scrollbar { display: none; }
        .fi2-icon-wrap { position: relative; }
        .fi2-icon-wrap .fi2 { padding-right: 40px; }
        .fi2-toggle {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: transparent; border: none; color: var(--txt-m);
          cursor: pointer; padding: 6px; border-radius: 4px;
          transition: color var(--trans); font-size: 12px;
        }
        .fi2-toggle:hover { color: var(--pri-h); }
        @media (max-width: 640px) {
          .two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Page Header */}

      {/* Horizontal Tab Navigation */}
      <TabNav sections={sections} activeId={activeSection} onNavigate={scrollToSection} />

      {/* Content — Centered, max-width for readability */}
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* ── Profile Section ── */}
        <SectionCard
          id="profile"
          icon="fa-user"
          title="Public Profile"
          description="This information will be visible across your dashboard"
        >
          <form onSubmit={handleProfileSave}>
            <Message ok={profileMsg.ok} msg={profileMsg.msg} onDismiss={() => setProfileMsg({ ok: false, msg: '' })} />

            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                <label style={{ cursor: 'pointer', position: 'relative', display: 'block' }}>
                  <div
                    style={{
                      width: 88, height: 88, borderRadius: '50%',
                      background: avatarPreview ? 'transparent' : 'var(--pri-grad)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 30, fontWeight: 700,
                      boxShadow: '0 4px 16px rgba(139, 92, 246, 0.35)',
                      overflow: 'hidden',
                      border: '3px solid var(--surf)',
                    }}
                  >
                    {avatarPreview
                      ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials}
                  </div>
                  <div
                    style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 28, height: 28, background: 'var(--pri)', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: '#fff', border: '3px solid var(--surf-2)',
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fas fa-camera" />
                  </div>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                </label>
                <div style={{ fontSize: 11, color: 'var(--txt-d)', textAlign: 'center', marginTop: 10 }}>
                  Click to upload<br />JPG, PNG · Max 2MB
                </div>
              </div>

              {/* Name + Email */}
              <div style={{ flex: 1, minWidth: 240, display: 'grid', gap: 16 }}>
                <Field label="Display Name">
                  <input
                    className="fi2" type="text" value={displayName}
                    onChange={e => setDisplayName(e.target.value)} required
                    placeholder="Your name"
                  />
                </Field>
                <Field label="Email Address" hint="Used for signing in to your account">
                  <input
                    className="fi2" type="email" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    placeholder="you@example.com"
                  />
                </Field>
              </div>
            </div>

            <div
              style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                paddingTop: 18, borderTop: '1px solid var(--brd)',
              }}
            >
              <button type="submit" className="btn bp" disabled={profileBusy}>
                {profileBusy
                  ? <><i className="fas fa-spinner fa-spin" /> Saving…</>
                  : <><i className="fas fa-floppy-disk" /> Save changes</>}
              </button>
            </div>
          </form>
        </SectionCard>

        {/* ── Security Section ── */}
        <SectionCard
          id="security"
          icon="fa-shield-halved"
          title="Password"
          description="Update your password. Choose a strong one with at least 8 characters."
        >
          <form onSubmit={handlePasswordChange}>
            <Message ok={pwdMsg.ok} msg={pwdMsg.msg} onDismiss={() => setPwdMsg({ ok: false, msg: '' })} />

            <div style={{ display: 'grid', gap: 16 }}>
              <Field label="Current Password">
                <div className="fi2-icon-wrap">
                  <input
                    className="fi2" type={showPwd ? 'text' : 'password'} value={curPwd}
                    onChange={e => setCurPwd(e.target.value)} placeholder="Enter your current password" required
                  />
                  <button
                    type="button" className="fi2-toggle"
                    onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                  >
                    <i className={`fas ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </Field>

              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="New Password" hint="Minimum 8 characters">
                  <input
                    className="fi2" type={showPwd ? 'text' : 'password'} value={newPwd}
                    onChange={e => setNewPwd(e.target.value)} placeholder="New password" required
                  />
                </Field>
                <Field label="Confirm New Password">
                  <input
                    className="fi2" type={showPwd ? 'text' : 'password'} value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat new password" required
                  />
                </Field>
              </div>
            </div>

            <div
              style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--brd)',
              }}
            >
              <button type="submit" className="btn bp" disabled={pwdBusy}>
                {pwdBusy
                  ? <><i className="fas fa-spinner fa-spin" /> Updating…</>
                  : <><i className="fas fa-key" /> Update password</>}
              </button>
            </div>
          </form>
        </SectionCard>

        {/* ── Telegram Section ── */}
        <SectionCard
          id="telegram"
          icon="fa-cloud"
          title="Cloud Storage"
          description="Telegram credentials that power your cloud storage module"
          badge={<StatusBadge connected={tgConnected} />}
        >
          <form onSubmit={handleTgSave}>
            <Message ok={tgMsg.ok} msg={tgMsg.msg} onDismiss={() => setTgMsg({ ok: false, msg: '' })} />

            <div
              style={{
                display: 'flex', gap: 12, padding: '12px 14px',
                background: 'var(--pri-lo)', border: '1px solid var(--pri-mid)',
                borderRadius: 'var(--radius)', marginBottom: 20, fontSize: 12.5,
                color: 'var(--txt-m)', lineHeight: 1.55,
              }}
            >
              <i className="fas fa-circle-info" style={{ color: 'var(--pri-h)', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
              <div>
                Get your <strong style={{ color: 'var(--txt)' }}>API ID</strong> and{' '}
                <strong style={{ color: 'var(--txt)' }}>API Hash</strong> from{' '}
                <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer"
                   style={{ color: 'var(--pri-h)', fontWeight: 500 }}>
                  my.telegram.org
                </a>. Create a bot via{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                   style={{ color: 'var(--pri-h)', fontWeight: 500 }}>
                  @BotFather
                </a>{' '}for the Bot Token.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setShowTgSecrets(v => !v)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--txt-m)',
                  fontSize: 12, cursor: 'pointer', padding: '4px 8px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <i className={`fas ${showTgSecrets ? 'fa-eye-slash' : 'fa-eye'}`} />
                {showTgSecrets ? 'Hide' : 'Show'} sensitive values
              </button>
            </div>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="API ID">
                <input
                  className="fi2" type={showTgSecrets ? 'text' : 'password'} value={apiId}
                  onChange={e => setApiId(e.target.value)} placeholder="12345678"
                />
              </Field>
              <Field label="API Hash">
                <input
                  className="fi2" type={showTgSecrets ? 'text' : 'password'} value={apiHash}
                  onChange={e => setApiHash(e.target.value)} placeholder="abc123def456..."
                />
              </Field>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Field label="Bot Token" hint="From @BotFather — format: 123456:AAA...">
                <input
                  className="fi2" type={showTgSecrets ? 'text' : 'password'} value={botToken}
                  onChange={e => setBotToken(e.target.value)} placeholder="123456:ABC-DEF..."
                />
              </Field>
            </div>

            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
              <Field label="DB Channel ID" hint="Bot must be admin in this channel">
                <input
                  className="fi2" type="text" value={dbChannelId}
                  onChange={e => setDbChannelId(e.target.value)} placeholder="-100xxxxxxxxxx"
                />
              </Field>
              <Field label="Owner Telegram ID" hint="Your personal Telegram user ID">
                <input
                  className="fi2" type="text" value={ownerId}
                  onChange={e => setOwnerId(e.target.value)} placeholder="123456789"
                />
              </Field>
            </div>

            <div
              style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: 12,
                paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--brd)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--txt-d)' }}>
                {tgConnected
                  ? 'Cloud storage is active and streaming files'
                  : 'Save credentials, then click "Connect" to activate'}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn bs" disabled={tgBusy || tgConnBusy}>
                  {tgBusy
                    ? <><i className="fas fa-spinner fa-spin" /> Saving…</>
                    : <><i className="fas fa-floppy-disk" /> Save</>}
                </button>
                <button
                  type="button" className="btn bp" onClick={handleTgConnect}
                  disabled={tgBusy || tgConnBusy}
                >
                  {tgConnBusy
                    ? <><i className="fas fa-spinner fa-spin" /> Connecting…</>
                    : <><i className={`fas ${tgConnected ? 'fa-rotate' : 'fa-bolt'}`} />
                        {tgConnected ? 'Reconnect' : 'Connect'}</>}
                </button>
              </div>
            </div>
          </form>
        </SectionCard>

      </div>
    </Layout>
  );
}