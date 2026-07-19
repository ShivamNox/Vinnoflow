import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Cloud from './pages/Cloud.jsx';
import CloudFolder from './pages/CloudFolder.jsx';
import Scrapers from './pages/Scrapers';
import HDHub4u from './pages/HDHub4u';

function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize:'28px', color:'var(--pri)' }} />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { loading, authenticated, setupComplete } = useAuth();
  if (loading) return <Spinner />;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { loading, authenticated, setupComplete } = useAuth();
  if (loading) return <Spinner />;
  if (!setupComplete) return <Navigate to="/setup" replace />;
  if (authenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/cloud" element={<ProtectedRoute><Cloud /></ProtectedRoute>} />
          <Route path="/cloud/folder/*" element={<ProtectedRoute><CloudFolder /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/scrapers" element={<ProtectedRoute><Scrapers /></ProtectedRoute>} />
          <Route path="/scrapers/hdhub4u" element={<ProtectedRoute><HDHub4u /></ProtectedRoute>} />
          <Route path="/scrapers/hdhub4u/:id" element={<ProtectedRoute><HDHub4u /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
