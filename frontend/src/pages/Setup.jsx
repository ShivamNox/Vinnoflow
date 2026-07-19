import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function StepIndicator({ step }) {
  const steps = ['Connect DB', 'Credentials', 'Profile'];
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:32 }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done   = num < step;
        return (
          <React.Fragment key={num}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:700,
                background: done ? 'var(--green)' : active ? 'var(--pri-grad)' : 'var(--surf-3)',
                color: done || active ? '#fff' : 'var(--txt-m)',
                border: active ? '2px solid var(--pri)' : '2px solid transparent',
                boxShadow: active ? 'var(--pri-glow)' : 'none',
              }}>
                {done ? <i className="fas fa-check" style={{ fontSize:12 }} /> : num}
              </div>
              <span style={{ fontSize:11, color: active ? 'var(--pri-h)' : 'var(--txt-d)', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width:48, height:2, background: done ? 'var(--green)' : 'var(--brd)', margin:'0 4px 22px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Setup() {
  const navigate = useNavigate();
  const { authenticated, loading, refreshUser } = useAuth();
  const [step, setStep]     = useState(1);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Step 1
  const [mongoUri, setMongoUri] = useState('');
  // Step 2
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  // Step 3
  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile]   = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  useEffect(() => {
    // If already authenticated and setup done, redirect home
    if (!loading && authenticated) navigate('/', { replace: true });
  }, [loading, authenticated, navigate]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleStep1 = async (e) => {
    e.preventDefault();
    if (!mongoUri.trim()) { setError('MongoDB URI required'); return; }
    clearMessages(); setBusy(true);
    try {
      const res  = await fetch('/setup/connect-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: mongoUri.trim() }),
      });
      const data = await res.json();
      if (data.ok && data.existingSetup) {
        await refreshUser();
        navigate('/', { replace: true });
        return;
      }
      if (data.ok) {
        setStep(2); setSuccess('');
      } else {
        setError(data.error || 'Connection failed');
      }
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const handleStep2 = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    clearMessages(); setBusy(true);
    try {
      const res  = await fetch('/setup/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) { setStep(3); }
      else { setError(data.error || 'Failed'); }
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) { setError('Display name required'); return; }
    clearMessages(); setBusy(true);
    try {
      const body = { displayName: displayName.trim(), avatarBase64: avatarPreview || '' };
      const res  = await fetch('/setup/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        await refreshUser();
        navigate('/', { replace: true });
      } else {
        setError(data.error || 'Failed');
      }
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  if (loading) {
    return (
      <div className="login-body">
        <i className="fas fa-spinner fa-spin" style={{ fontSize:28, color:'var(--pri)' }} />
      </div>
    );
  }

  return (
    <div className="login-body">
      <div className="login-card" style={{ maxWidth:460 }}>
        <div className="login-logo">
          <div className="login-logo-icon">
            <i className="fas fa-bolt" />
          </div>
          <div>
            <div className="login-logo-name">Vinno<span>flow</span> Setup</div>
            <div className="login-logo-sub">Configure your instance</div>
          </div>
        </div>

        <StepIndicator step={step} />

        {error && (
          <div className="login-err" style={{ marginBottom:16 }}>
            <i className="fas fa-circle-exclamation" /> {error}
          </div>
        )}

        {/* ── Step 1: Connect DB ── */}
        {step === 1 && (
          <form onSubmit={handleStep1}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:6 }}>
                <i className="fas fa-database" style={{ color:'var(--pri)', marginRight:8 }} />
                Connect MongoDB
              </div>
              <div style={{ fontSize:13, color:'var(--txt-m)', lineHeight:1.55 }}>
                Provide your MongoDB connection string. All settings will be stored in this database.
              </div>
            </div>
            <div className="login-group">
              <label className="login-label">MongoDB URI</label>
              <input
                type="text"
                className="login-input"
                placeholder="mongodb+srv://user:pass@cluster.mongodb.net/db"
                value={mongoUri}
                onChange={e => setMongoUri(e.target.value)}
                autoFocus required
              />
            </div>
            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Connecting…</> : 'Connect Database →'}
            </button>
          </form>
        )}

        {/* ── Step 2: Credentials ── */}
        {step === 2 && (
          <form onSubmit={handleStep2}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:6 }}>
                <i className="fas fa-lock" style={{ color:'var(--pri)', marginRight:8 }} />
                Admin Credentials
              </div>
              <div style={{ fontSize:13, color:'var(--txt-m)' }}>
                Set your login email and password.
              </div>
            </div>
            <div className="login-group">
              <label className="login-label">Admin Email</label>
              <input
                type="email" className="login-input" placeholder="admin@example.com"
                value={email} onChange={e => setEmail(e.target.value)} autoFocus required
              />
            </div>
            <div className="login-group">
              <label className="login-label">Password (min 8 characters)</label>
              <input
                type="password" className="login-input" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required
              />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className="btn bs" onClick={() => setStep(1)} style={{ flex:1 }}>
                ← Back
              </button>
              <button type="submit" className="login-btn" style={{ flex:2, margin:0 }} disabled={busy}>
                {busy ? <><i className="fas fa-spinner fa-spin" /> Saving…</> : 'Save Credentials →'}
              </button>
            </div>
          </form>
        )}

        {/* ── Step 3: Profile ── */}
        {step === 3 && (
          <form onSubmit={handleStep3}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:6 }}>
                <i className="fas fa-user-circle" style={{ color:'var(--pri)', marginRight:8 }} />
                Profile Setup
              </div>
              <div style={{ fontSize:13, color:'var(--txt-m)' }}>
                Choose a display name and optional avatar.
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
              <label style={{ cursor:'pointer', position:'relative' }}>
                <div className="up-av" style={{ width:72, height:72, fontSize:24 }}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                    : initials
                  }
                </div>
                <div style={{
                  position:'absolute', bottom:0, right:0,
                  width:22, height:22, background:'var(--pri)', borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, color:'#fff', border:'2px solid var(--bg)',
                }}>
                  <i className="fas fa-camera" />
                </div>
                <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display:'none' }} />
              </label>
            </div>
            <div className="login-group">
              <label className="login-label">Display Name</label>
              <input
                type="text" className="login-input" placeholder="Your Name"
                value={displayName} onChange={e => setDisplayName(e.target.value)} autoFocus required
              />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className="btn bs" onClick={() => setStep(2)} style={{ flex:1 }}>
                ← Back
              </button>
              <button type="submit" className="login-btn" style={{ flex:2, margin:0 }} disabled={busy}>
                {busy ? <><i className="fas fa-spinner fa-spin" /> Finishing…</> : 'Complete Setup 🎉'}
              </button>
            </div>
          </form>
        )}

        <div className="login-footer" style={{ marginTop:24 }}>
          Vinnoflow · Telegram-powered cloud storage
        </div>
      </div>
    </div>
  );
}
