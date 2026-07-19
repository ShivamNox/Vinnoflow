import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter email and password.'); return; }
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate('/');
    } else {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div className="login-body">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <i className="fas fa-bolt" />
          </div>
          <div>
            <div className="login-logo-name">Vinno<span>flow</span></div>
            <div className="login-logo-sub">Telegram Automation Hub</div>
          </div>
        </div>

        {error && (
          <div className="login-err">
            <i className="fas fa-circle-exclamation" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-group">
            <label className="login-label">Email address</label>
            <input
              type="email"
              className="login-input"
              placeholder="admin@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="login-group">
            <label className="login-label">Password</label>
            <input
              type="password"
              className="login-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <><i className="fas fa-spinner fa-spin" /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <div className="login-footer">
          Vinnoflow · Telegram-powered cloud storage
        </div>
      </div>
    </div>
  );
}
