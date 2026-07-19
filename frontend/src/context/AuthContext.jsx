import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    authenticated: false,
    user: null,
    setupComplete: true, // optimistic; corrected after fetch
  });

  const fetchMe = useCallback(async () => {
    try {
      // Fetch both auth status and setup status in parallel
      const [meRes, setupRes] = await Promise.all([
        fetch('/api/me', { credentials: 'include' }),
        fetch('/api/setup/status', { credentials: 'include' }),
      ]);
      const [meData, setupData] = await Promise.all([meRes.json(), setupRes.json()]);
      setState({
        loading: false,
        authenticated: meData.authenticated || false,
        user: meData.user || null,
        setupComplete: setupData.setupComplete || false,
      });
    } catch {
      setState({ loading: false, authenticated: false, user: null, setupComplete: false });
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const login = async (email, password) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.ok) {
      await fetchMe();
      return { ok: true };
    }
    return { ok: false, error: data.error || 'Login failed' };
  };

  const logout = async () => {
    await fetch('/logout', { credentials: 'include' });
    // Setup is a one-time flow — logging out must only clear the session,
    // never send the user back through /setup.
    setState(prev => ({ ...prev, loading: false, authenticated: false, user: null, setupComplete: true }));
  };

  const refreshUser = fetchMe;

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
