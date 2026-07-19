import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="mo open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="md">
        <div className="mdt">{title}</div>
        <button className="mdc" onClick={onClose}><i className="fas fa-times" /></button>
        {children}
      </div>
    </div>
  );
}

export default function Cloud() {
  const navigate = useNavigate();

  const [folders,    setFolders]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [tgStatus,   setTgStatus]   = useState({ configured: false, connected: false });

  // Modals
  const [showNew,    setShowNew]    = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSetup,  setShowSetup]  = useState(false);

  const [newName,    setNewName]    = useState('');
  const [newChanId,  setNewChanId]  = useState('');
  const [renameFld,  setRenameFld]  = useState(null);
  const [renameVal,  setRenameVal]  = useState('');
  const [deleteFld,  setDeleteFld]  = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [msg,        setMsg]        = useState('');

  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    fetchFolders();
    fetchTgStatus();
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const fetchFolders = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/cloud/folders', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load folders');
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const fetchTgStatus = async () => {
    try {
      const res = await fetch('/cloud/setup-status', { credentials: 'include' });
      const data = await res.json();
      setTgStatus(data);
    } catch {}
  };

  const api = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    const data = await api('/cloud/folder', { name: newName.trim(), channelId: newChanId.trim() });
    setBusy(false);
    if (data.ok) {
      setShowNew(false); setNewName(''); setNewChanId('');
      fetchFolders();
    } else {
      setMsg(data.error || 'Failed to create folder');
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!renameVal.trim()) return;
    setBusy(true);
    const data = await api('/cloud/folder/rename', { folderId: renameFld.folderId, newName: renameVal.trim() });
    setBusy(false);
    if (data.ok) {
      setShowRename(false);
      fetchFolders();
    } else {
      setMsg(data.error || 'Failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteFld) return;
    setBusy(true);
    await api(`/cloud/folder/${encodeURIComponent(deleteFld.name)}/delete`, {});
    setBusy(false);
    setShowDelete(false); setDeleteFld(null);
    fetchFolders();
  };

  const handleConnectTg = async () => {
    setBusy(true);
    const data = await api('/profile/connect-telegram', {});
    setBusy(false);
    if (data.ok) {
      fetchTgStatus();
      setShowSetup(false);
    } else {
      setMsg(data.error || 'Failed');
    }
  };

  const navToFolder = (folder) => {
    navigate(`/cloud/folder/${encodeURIComponent(folder.name)}`);
  };

  return (
    <Layout activeNav="/cloud">
      <div className="ph">
        <div>
          <div className="pt"><i className="fas fa-cloud" style={{ marginRight:10, color:'var(--pri)' }} />TG Cloud</div>
          <div className="ps">Manage files stored in your Telegram channels</div>
        </div>
        <div className="ba">
          <button className="btn bs" onClick={() => setShowSetup(true)}>
            <i className="fas fa-bolt" />
            {tgStatus.connected ? 'Connected' : 'Setup Telegram'}
          </button>
          <button className="btn bp" onClick={() => { setMsg(''); setShowNew(true); }}>
            <i className="fas fa-plus" /> New Folder
          </button>
        </div>
      </div>

      {!tgStatus.configured && !loading && (
        <div style={{
          background:'var(--amber-lo)', border:'1px solid rgba(245,158,11,0.3)',
          borderRadius:'var(--radius-lg)', padding:'14px 18px', marginBottom:20,
          display:'flex', alignItems:'center', gap:12, fontSize:13, color:'var(--amber)',
        }}>
          <i className="fas fa-triangle-exclamation" style={{ fontSize:18 }} />
          <div>
            <strong>Telegram not configured.</strong>{' '}
            Go to <a href="/profile" style={{ color:'var(--pri-h)', fontWeight:600 }}>Profile → Telegram</a> to set up your API credentials.
          </div>
        </div>
      )}

      {error && (
        <div className="login-err" style={{ marginBottom:16 }}>
          <i className="fas fa-circle-exclamation" /> {error}
        </div>
      )}

      {loading ? (
        <div className="es">
          <i className="fas fa-spinner fa-spin" style={{ opacity:1, color:'var(--pri)' }} />
          <div>Loading folders…</div>
        </div>
      ) : folders.length === 0 ? (
        <div className="nr">
          <i className="fas fa-folder-open" />
          <div style={{ fontSize:16, fontWeight:600, color:'var(--txt)', marginBottom:8 }}>No folders yet</div>
          <div style={{ fontSize:13, marginBottom:20 }}>Create a folder to start organising your Telegram files.</div>
          <button className="btn bp" onClick={() => setShowNew(true)}>
            <i className="fas fa-plus" /> Create First Folder
          </button>
        </div>
      ) : (
        <div className="fg" ref={menuRef}>
          {folders.map(folder => (
            <div
              key={folder.folderId}
              className="fc"
              onClick={() => navToFolder(folder)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navToFolder(folder)}
            >
              <div style={{ position:'absolute', top:10, right:10, zIndex:10 }}
                onClick={e => e.stopPropagation()}>
                <button
                  className="fmb"
                  onClick={() => setOpenMenu(openMenu === folder.folderId ? null : folder.folderId)}
                >
                  <i className="fas fa-ellipsis-v" />
                </button>
                <div className={`dm${openMenu === folder.folderId ? ' open' : ''}`}>
                  <button className="di" onClick={() => {
                    setRenameFld(folder); setRenameVal(folder.name); setOpenMenu(null); setShowRename(true);
                  }}>
                    <i className="fas fa-pencil" /> Rename
                  </button>
                  <button className="di dng" onClick={() => {
                    setDeleteFld(folder); setOpenMenu(null); setShowDelete(true);
                  }}>
                    <i className="fas fa-trash" /> Delete
                  </button>
                </div>
              </div>
              <div className="fi"><i className="fas fa-folder" /></div>
              <div className="fn">{folder.name}</div>
              {folder.channelId && (
                <div className="fch" title={folder.channelId}>
                  <i className="fab fa-telegram" style={{ marginRight:4 }} />
                  {folder.channelId}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Folder Modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setMsg(''); }} title="Create New Folder">
        <form onSubmit={handleCreate}>
          {msg && <div className="login-err" style={{ marginBottom:14 }}>{msg}</div>}
          <div className="fg2">
            <label className="fl2">Folder Name</label>
            <input
              className="fi2" type="text" placeholder="My Folder"
              value={newName} onChange={e => setNewName(e.target.value)} autoFocus required
            />
          </div>
          <div className="fg2">
            <label className="fl2">Telegram Channel ID <span style={{ color:'var(--txt-d)' }}>(optional)</span></label>
            <input
              className="fi2" type="text" placeholder="-100XXXXXXXXXX"
              value={newChanId} onChange={e => setNewChanId(e.target.value)}
            />
          </div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Creating…</> : 'Create Folder'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal open={showRename} onClose={() => setShowRename(false)} title="Rename Folder">
        <form onSubmit={handleRename}>
          {msg && <div className="login-err" style={{ marginBottom:14 }}>{msg}</div>}
          <div className="fg2">
            <label className="fl2">New Name</label>
            <input
              className="fi2" type="text"
              value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus required
            />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowRename(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Renaming…</> : 'Rename'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Folder?">
        <p style={{ fontSize:13, color:'var(--txt-m)', marginBottom:20, lineHeight:1.6 }}>
          Are you sure you want to delete <strong style={{ color:'var(--txt)' }}>{deleteFld?.name}</strong>? All files in this folder will be removed from the database.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn bs" style={{ flex:1 }} onClick={() => setShowDelete(false)}>Cancel</button>
          <button className="btn bd" style={{ flex:1 }} onClick={handleDelete} disabled={busy}>
            {busy ? <><i className="fas fa-spinner fa-spin" /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* Setup Telegram Modal */}
      <Modal open={showSetup} onClose={() => setShowSetup(false)} title="Telegram Connection">
        {msg && <div className="login-err" style={{ marginBottom:14 }}>{msg}</div>}
        <p style={{ fontSize:13, color:'var(--txt-m)', marginBottom:16, lineHeight:1.6 }}>
          {tgStatus.connected
            ? '✅ Telegram is connected and ready.'
            : 'Connect Telegram to enable file streaming and upload. Make sure your credentials are saved in Profile first.'}
        </p>
        {!tgStatus.connected && (
          <button className="btn bp" style={{ width:'100%' }} onClick={handleConnectTg} disabled={busy}>
            {busy ? <><i className="fas fa-spinner fa-spin" /> Connecting…</> : <><i className="fas fa-bolt" /> Connect Telegram</>}
          </button>
        )}
      </Modal>
    </Layout>
  );
}
