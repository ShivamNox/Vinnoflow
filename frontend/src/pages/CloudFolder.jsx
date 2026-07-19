import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
function ext(name) { return (name || '').toLowerCase().split('.').pop(); }
function fileIcon(name) {
  const e = ext(name);
  if (['mp4','mkv','mov','avi','webm'].includes(e)) return { icon: 'fa-film', cls: '' };
  if (['mp3','m4a','ogg','wav','aac'].includes(e))  return { icon: 'fa-music', cls: '' };
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(e)) return { icon: 'fa-image', cls: '' };
  if (['pdf'].includes(e))   return { icon: 'fa-file-pdf', cls: '' };
  if (['zip','tar','gz','rar','7z'].includes(e)) return { icon: 'fa-file-zipper', cls: '' };
  return { icon: 'fa-file', cls: '' };
}
function isVideo(name) { return ['mp4','mkv','mov','avi','webm'].includes(ext(name)); }
function isAudio(name) { return ['mp3','m4a','ogg','wav','aac'].includes(ext(name)); }
function isImage(name) { return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext(name)); }
function isPdf(name)   { return ext(name) === 'pdf'; }

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="mo open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="md" style={ wide ? { maxWidth:900, width:'95vw', maxHeight:'90vh' } : {}}>
        {title && <div className="mdt">{title}</div>}
        <button className="mdc" onClick={onClose}><i className="fas fa-times" /></button>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CloudFolder() {
  const params   = useParams();
  const navigate = useNavigate();
  const folderPath = params['*'] || '';      // "FolderA/SubB"
  const pathSegs   = folderPath.split('/').filter(Boolean);

  const [data,    setData]    = useState(null);   // { folder, subfolders, files, breadcrumb, allFolders }
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState(false);

  // Modals
  const [showUpload,       setShowUpload]       = useState(false);
  const [showNewSub,       setShowNewSub]       = useState(false);
  const [showRenameFolder, setShowRenameFolder] = useState(false);
  const [showDeleteFolder, setShowDeleteFolder] = useState(false);
  const [showRenameFile,   setShowRenameFile]   = useState(false);
  const [showMoveFile,     setShowMoveFile]     = useState(false);
  const [showDeleteFile,   setShowDeleteFile]   = useState(false);
  const [showVideo,        setShowVideo]        = useState(false);
  const [showImage,        setShowImage]        = useState(false);
  const [showAudio,        setShowAudio]        = useState(false);
  const [showPdf,          setShowPdf]          = useState(false);

  // Selected items
  const [selFolder, setSelFolder] = useState(null);
  const [selFile,   setSelFile]   = useState(null);
  const [mediaUrl,  setMediaUrl]  = useState('');
  const [mediaName, setMediaName] = useState('');
  const [openMenu,  setOpenMenu]  = useState(null);

  // New subfolder
  const [subName,   setSubName]   = useState('');
  const [subChan,   setSubChan]   = useState('');
  const [renameVal, setRenameVal] = useState('');
  const [moveFolder, setMoveFolder] = useState('');
  const [modalMsg,  setModalMsg]  = useState('');

  // Upload — dual-phase progress, now across a batch of files
  const [uploadActive,   setUploadActive]   = useState(false);
  const [uploadDone,     setUploadDone]     = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [srvPct,         setSrvPct]         = useState(0);   // browser → server % (whole batch)
  const [srvDone,        setSrvDone]        = useState(false);
  const [tgPct,          setTgPct]          = useState(0);   // server → Telegram % (current file)
  const [tgLabel,        setTgLabel]        = useState('');  // "X MB / Y MB"
  const [tgStarted,      setTgStarted]      = useState(false);
  const [batchFiles,     setBatchFiles]     = useState([]);  // [{ name, status: 'pending'|'active'|'done'|'error' }]
  const [batchIndex,     setBatchIndex]     = useState(0);
  const [batchTotal,     setBatchTotal]     = useState(0);
  const fileInput = useRef(null);

  const menuRef  = useRef(null);
  const fabTimer = useRef(null);

  const fetchFolder = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/cloud/folder-data/${folderPath}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load folder');
      setData(json);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [folderPath]);

  useEffect(() => { fetchFolder(); }, [fetchFolder]);

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Auto-dismiss FAB 3 s after upload finishes or errors
  useEffect(() => {
    if ((uploadDone || uploadError) && !showUpload) {
      clearTimeout(fabTimer.current);
      fabTimer.current = setTimeout(() => setUploadActive(false), 3000);
    }
    return () => clearTimeout(fabTimer.current);
  }, [uploadDone, uploadError, showUpload]);

  // ── API helpers ──────────────────────────────────────────────────────────────
  const post = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return res.json();
  };

  // ── Folder ops ───────────────────────────────────────────────────────────────
  const handleCreateSubfolder = async (e) => {
    e.preventDefault();
    if (!subName.trim()) return;
    setModalMsg(''); setBusy(true);
    const res = await post('/cloud/folder', {
      name: subName.trim(),
      parentId: data?.folder?.folderId,
      channelId: subChan.trim(),
    });
    setBusy(false);
    if (res.ok) { setShowNewSub(false); setSubName(''); setSubChan(''); fetchFolder(); }
    else { setModalMsg(res.error || 'Failed'); }
  };

  const handleRenameFolder = async (e) => {
    e.preventDefault();
    if (!renameVal.trim()) return;
    setModalMsg(''); setBusy(true);
    const res = await post('/cloud/folder/rename', { folderId: selFolder?.folderId, newName: renameVal.trim() });
    setBusy(false);
    if (res.ok) { setShowRenameFolder(false); fetchFolder(); }
    else { setModalMsg(res.error || 'Failed'); }
  };

  const handleDeleteFolder = async () => {
    if (!selFolder) return;
    setBusy(true);
    await post('/cloud/folder/delete', { folderId: selFolder.folderId });
    setBusy(false);
    setShowDeleteFolder(false);
    fetchFolder();
  };

  // ── File ops ─────────────────────────────────────────────────────────────────
  const handleRenameFile = async (e) => {
    e.preventDefault();
    if (!renameVal.trim()) return;
    setModalMsg(''); setBusy(true);
    // Use uniqueId — fileId may be empty for bot/upload-saved files
    const res = await post('/cloud/file/rename', { uniqueId: selFile?.uniqueId, newFilename: renameVal.trim() });
    setBusy(false);
    if (res.ok) { setShowRenameFile(false); fetchFolder(); }
    else { setModalMsg(res.error || 'Failed'); }
  };

  const handleMoveFile = async (e) => {
    e.preventDefault();
    if (!moveFolder) return;
    setModalMsg(''); setBusy(true);
    const res = await post('/cloud/file/move', { uniqueId: selFile?.uniqueId, newFolderId: moveFolder });
    setBusy(false);
    if (res.ok) { setShowMoveFile(false); fetchFolder(); }
    else { setModalMsg(res.error || 'Failed'); }
  };

  const handleDeleteFile = async () => {
    if (!selFile) return;
    setBusy(true);
    await post('/cloud/file/delete', { uniqueId: selFile.uniqueId });
    setBusy(false);
    setShowDeleteFile(false);
    fetchFolder();
  };

  const handleShare = async (file) => {
    try {
      const res  = await fetch('/cloud/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uniqueId: file.uniqueId }),
      });
      const data = await res.json();
      if (data.url) {
        const shareUrl = `${window.location.origin}${data.url}`;
        await navigator.clipboard.writeText(shareUrl);
        alert(`Share link copied!\n${shareUrl}`);
      }
    } catch (e) { alert('Failed to create share link: ' + e.message); }
  };

  // ── Upload — dual-phase real progress, multi-file batch ─────────────────────
  const handleUpload = (e) => {
    e.preventDefault();
    const files = Array.from(fileInput.current?.files || []);
    if (!files.length || !data?.folder) return;

    // Reset all state
    setUploadActive(true); setUploadDone(false); setUploadError('');
    setUploadFileName(files.length === 1 ? files[0].name : `${files.length} files`);
    setSrvPct(0); setSrvDone(false);
    setTgPct(0); setTgLabel(''); setTgStarted(false);
    setBatchFiles(files.map(f => ({ name: f.name, status: 'pending' })));
    setBatchIndex(0); setBatchTotal(files.length);

    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    formData.append('folderId', data.folder.folderId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/cloud/upload');
    xhr.withCredentials = true;

    // ── Phase 1: browser → server (real upload % across the whole batch) ───
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setSrvPct(pct);
      if (pct >= 100) setSrvDone(true);
    };

    // ── Phase 2: SSE stream from server (per-file Telegram %) ──────────────
    // Persistent buffer — handles JSON payloads split across progress callbacks
    let sseOffset = 0;
    let sseBuf = '';
    let gotComplete = false;
    let gotError = false;

    const setFileStatus = (index, status) => {
      setBatchFiles(prev => prev.map((f, i) => (i === index ? { ...f, status } : f)));
    };

    const processSSEBuffer = () => {
      // SSE events are separated by double-newline
      const events = sseBuf.split('\n\n');
      // Keep the last (possibly incomplete) fragment for next callback
      sseBuf = events.pop() ?? '';
      for (const block of events) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'server_done') {
              setSrvPct(100); setSrvDone(true);
              setTgStarted(true); setTgPct(0); setTgLabel('');
              if (typeof ev.fileIndex === 'number') {
                setBatchIndex(ev.fileIndex);
                setUploadFileName(ev.fileName || '');
                setFileStatus(ev.fileIndex, 'active');
              }
            } else if (ev.phase === 'telegram_progress') {
              setTgStarted(true);
              setTgPct(ev.percent || 0);
              if (ev.uploaded && ev.total) setTgLabel(`${ev.uploaded} / ${ev.total}`);
              if (typeof ev.fileIndex === 'number') {
                setBatchIndex(ev.fileIndex);
                setUploadFileName(ev.fileName || '');
              }
            } else if (ev.phase === 'file_complete') {
              if (typeof ev.fileIndex === 'number') setFileStatus(ev.fileIndex, 'done');
            } else if (ev.phase === 'file_error') {
              if (typeof ev.fileIndex === 'number') setFileStatus(ev.fileIndex, 'error');
            } else if (ev.phase === 'complete') {
              gotComplete = true;
              setSrvPct(100); setSrvDone(true);
              setTgPct(100); setUploadDone(true);
              if (ev.failedCount) {
                setUploadError(`${ev.failedCount} of ${ev.totalFiles} file(s) failed: ${(ev.failures || []).join(', ')}`);
              }
              fetchFolder();
            } else if (ev.phase === 'error') {
              gotError = true;
              setUploadError(ev.message || 'Upload failed');
            }
          } catch {}
        }
      }
    };

    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(sseOffset);
      sseOffset = xhr.responseText.length;
      if (!newChunk) return;
      sseBuf += newChunk;
      processSSEBuffer();
    };

    xhr.onload = () => {
      // Flush any remaining buffered data
      if (sseBuf.trim()) {
        sseBuf += '\n\n'; // force flush of last event
        processSSEBuffer();
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        // Only force bars to 100% on genuine success — never after an error phase
        if (!gotError) {
          setSrvPct(100); setSrvDone(true);
          if (!gotComplete) {
            // No explicit complete event but request succeeded — treat as done
            setTgPct(100); setUploadDone(true);
            fetchFolder();
          }
        }
      } else if (!gotError) {
        // Non-2xx with no SSE error phase — e.g. a middleware-level failure
        // (too many files, oversized file) returned as plain JSON.
        let message = `Upload failed (${xhr.status})`;
        try { message = JSON.parse(xhr.responseText)?.message || message; } catch {}
        setUploadError(message);
      }
    };

    xhr.onerror = () => setUploadError('Network error during upload');

    xhr.send(formData);
  };

  // ── Media open ───────────────────────────────────────────────────────────────
  const openFile = (file) => {
    const url = `/stream/${file.uniqueId}`;
    if (isVideo(file.filename)) {
      setMediaUrl(url); setMediaName(file.filename); setShowVideo(true);
    } else if (isAudio(file.filename)) {
      setMediaUrl(url); setMediaName(file.filename); setShowAudio(true);
    } else if (isImage(file.filename)) {
      setMediaUrl(url); setMediaName(file.filename); setShowImage(true);
    } else if (isPdf(file.filename)) {
      setMediaUrl(url); setMediaName(file.filename); setShowPdf(true);
    } else {
      window.open(`/download/${encodeURIComponent(file.filename)}?uniqueId=${file.uniqueId}`, '_blank');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const { folder, subfolders = [], files = [], breadcrumb = [], allFolders = [] } = data || {};

  const videos = files.filter(f => isVideo(f.filename));
  const others = files.filter(f => !isVideo(f.filename));

  return (
    <Layout activeNav="/cloud">
      {/* Breadcrumb */}
      {!loading && !error && (
        <div className="bc">
          <Link to="/cloud">Cloud</Link>
          {breadcrumb.slice(1).map((crumb, i) => (
            <React.Fragment key={i}>
              <span className="bcs"><i className="fas fa-chevron-right" style={{ fontSize:10 }} /></span>
              {crumb.last
                ? <span className="bcc">{crumb.label}</span>
                : <Link to={crumb.url}>{crumb.label}</Link>
              }
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Page header */}
      {!loading && !error && folder && (
        <div className="ph">
          <div>
            <div className="pt"><i className="fas fa-folder-open" style={{ marginRight:10, color:'var(--pri)' }} />{folder.name}</div>
            <div className="ps">{subfolders.length} subfolder{subfolders.length !== 1 ? 's' : ''} · {files.length} file{files.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="ba">
            <button className="btn bs" onClick={() => { setModalMsg(''); setShowNewSub(true); }}>
              <i className="fas fa-folder-plus" /> New Subfolder
            </button>
            <button className="btn bp" onClick={() => { setUploadActive(false); setUploadDone(false); setUploadError(''); setSrvPct(0); setSrvDone(false); setTgPct(0); setTgLabel(''); setTgStarted(false); setUploadFileName(''); setBatchFiles([]); setBatchIndex(0); setBatchTotal(0); setShowUpload(true); }}>
              <i className="fas fa-upload" /> Upload Files
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="es"><i className="fas fa-spinner fa-spin" style={{ opacity:1, color:'var(--pri)' }} /><div>Loading…</div></div>
      )}
      {error && (
        <div className="login-err"><i className="fas fa-circle-exclamation" /> {error}</div>
      )}

      {!loading && !error && (
        <div ref={menuRef}>
          {/* Subfolders */}
          {subfolders.length > 0 && (
            <>
              <div className="st">Subfolders</div>
              <div className="fg">
                {subfolders.map(sf => (
                  <div
                    key={sf.folderId}
                    className="fc"
                    onClick={() => navigate(`/cloud/folder/${folderPath}/${encodeURIComponent(sf.name)}`)}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && navigate(`/cloud/folder/${folderPath}/${encodeURIComponent(sf.name)}`)}
                  >
                    <div style={{ position:'absolute', top:10, right:10, zIndex:10 }} onClick={e => e.stopPropagation()}>
                      <button className="fmb" onClick={() => setOpenMenu(openMenu === sf.folderId ? null : sf.folderId)}>
                        <i className="fas fa-ellipsis-v" />
                      </button>
                      <div className={`dm${openMenu === sf.folderId ? ' open' : ''}`}>
                        <button className="di" onClick={() => { setSelFolder(sf); setRenameVal(sf.name); setOpenMenu(null); setShowRenameFolder(true); }}>
                          <i className="fas fa-pencil" /> Rename
                        </button>
                        <button className="di dng" onClick={() => { setSelFolder(sf); setOpenMenu(null); setShowDeleteFolder(true); }}>
                          <i className="fas fa-trash" /> Delete
                        </button>
                      </div>
                    </div>
                    <div className="fi"><i className="fas fa-folder" /></div>
                    <div className="fn">{sf.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <>
              <div className="st">Videos</div>
              <div className="vg">
                {videos.map(file => (
                  <div key={file.uniqueId} className="vc">
                    <div className="vt" onClick={() => openFile(file)}>
                      {file.thumbId
                        ? <ThumbImg thumbId={file.thumbId} />
                        : <div style={{ fontSize:36, color:'var(--pri)' }}><i className="fas fa-film" /></div>
                      }
                      <div className="po"><i className="fas fa-circle-play" /></div>
                      {file.size && <div className="vs">{fmtSize(file.size)}</div>}
                    </div>
                    <div className="vi">
                      <div className="vn" onClick={() => openFile(file)}>{file.filename}</div>
                      <div className="vm">
                        <span className="stb"><i className="fas fa-film" /> Video</span>
                        {file.size && <span>{fmtSize(file.size)}</span>}
                        <div style={{ marginLeft:'auto', display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
                          <button className="fmb" onClick={() => setOpenMenu(openMenu === file.uniqueId ? null : file.uniqueId)}>
                            <i className="fas fa-ellipsis-v" />
                          </button>
                          <div className={`dm${openMenu === file.uniqueId ? ' open' : ''}`}>
                            <button className="di" onClick={() => { openFile(file); setOpenMenu(null); }}>
                              <i className="fas fa-play" /> Play
                            </button>
                            <button className="di" onClick={() => { window.open(`/download/${encodeURIComponent(file.filename)}?uniqueId=${file.uniqueId}`, '_blank'); setOpenMenu(null); }}>
                              <i className="fas fa-download" /> Download
                            </button>
                            <button className="di" onClick={() => { handleShare(file); setOpenMenu(null); }}>
                              <i className="fas fa-share-nodes" /> Share
                            </button>
                            <button className="di" onClick={() => { setSelFile(file); setRenameVal(file.filename); setOpenMenu(null); setShowRenameFile(true); }}>
                              <i className="fas fa-pencil" /> Rename
                            </button>
                            <button className="di" onClick={() => { setSelFile(file); setMoveFolder(data.folder.folderId); setOpenMenu(null); setShowMoveFile(true); }}>
                              <i className="fas fa-folder-open" /> Move
                            </button>
                            <button className="di dng" onClick={() => { setSelFile(file); setOpenMenu(null); setShowDeleteFile(true); }}>
                              <i className="fas fa-trash" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Other files */}
          {others.length > 0 && (
            <>
              <div className="st">Files</div>
              <div className="fl">
                {others.map(file => {
                  const fi = fileIcon(file.filename);
                  return (
                    <div key={file.uniqueId} className="fit">
                      <span className="fic"><i className={`fas ${fi.icon}`} /></span>
                      <span className="fnm" onClick={() => openFile(file)}>{file.filename}</span>
                      {file.size && <span className="fsz">{fmtSize(file.size)}</span>}
                      <div style={{ position:'relative', flexShrink:0 }} onClick={e => e.stopPropagation()}>
                        <button className="fmb" onClick={() => setOpenMenu(openMenu === file.uniqueId ? null : file.uniqueId)}>
                          <i className="fas fa-ellipsis-v" />
                        </button>
                        <div className={`dm${openMenu === file.uniqueId ? ' open' : ''}`} style={{ right:0 }}>
                          {(isImage(file.filename) || isPdf(file.filename) || isAudio(file.filename)) && (
                            <button className="di" onClick={() => { openFile(file); setOpenMenu(null); }}>
                              <i className="fas fa-eye" /> Preview
                            </button>
                          )}
                          <button className="di" onClick={() => { window.open(`/download/${encodeURIComponent(file.filename)}?uniqueId=${file.uniqueId}`, '_blank'); setOpenMenu(null); }}>
                            <i className="fas fa-download" /> Download
                          </button>
                          <button className="di" onClick={() => { handleShare(file); setOpenMenu(null); }}>
                            <i className="fas fa-share-nodes" /> Share
                          </button>
                          <button className="di" onClick={() => { setSelFile(file); setRenameVal(file.filename); setOpenMenu(null); setShowRenameFile(true); }}>
                            <i className="fas fa-pencil" /> Rename
                          </button>
                          <button className="di" onClick={() => { setSelFile(file); setMoveFolder(data.folder.folderId); setOpenMenu(null); setShowMoveFile(true); }}>
                            <i className="fas fa-folder-open" /> Move
                          </button>
                          <button className="di dng" onClick={() => { setSelFile(file); setOpenMenu(null); setShowDeleteFile(true); }}>
                            <i className="fas fa-trash" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {subfolders.length === 0 && files.length === 0 && (
            <div className="nr">
              <i className="fas fa-folder-open" />
              <div style={{ fontSize:16, fontWeight:600, color:'var(--txt)', marginBottom:8 }}>Folder is empty</div>
              <div style={{ fontSize:13, marginBottom:20 }}>Upload files or create subfolders to get started.</div>
              <button className="btn bp" onClick={() => { setUploadActive(false); setUploadDone(false); setUploadError(''); setSrvPct(0); setSrvDone(false); setTgPct(0); setTgLabel(''); setTgStarted(false); setUploadFileName(''); setBatchFiles([]); setBatchIndex(0); setBatchTotal(0); setShowUpload(true); }}>
                <i className="fas fa-upload" /> Upload Files
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Upload Modal ── */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Files">
        <form onSubmit={handleUpload}>
          <div className="fg2">
            <label className="fl2">Select File(s)</label>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="fi2"
              style={{ padding:'6px 10px', cursor:'pointer' }}
              required
            />
          </div>

          {/* Dual-phase progress — only shown while/after active */}
          {uploadActive && (
            <div style={{
              marginTop: 16,
              background: 'var(--surf-3)',
              border: '1px solid var(--brd)',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              {/* Batch file list */}
              {batchFiles.length > 1 && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  maxHeight: 140, overflowY: 'auto',
                  paddingBottom: 8, borderBottom: '1px solid var(--brd)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--txt-m)', marginBottom: 2 }}>
                    File {Math.min(batchIndex + 1, batchTotal)} of {batchTotal}
                  </div>
                  {batchFiles.map((f, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                      <i className={`fas ${
                        f.status === 'done' ? 'fa-circle-check' :
                        f.status === 'error' ? 'fa-circle-exclamation' :
                        f.status === 'active' ? 'fa-spinner fa-spin' : 'fa-clock'
                      }`} style={{
                        color: f.status === 'done' ? 'var(--green)' :
                               f.status === 'error' ? 'var(--red)' :
                               f.status === 'active' ? 'var(--pri)' : 'var(--txt-d)',
                        width: 14, flexShrink: 0,
                      }} />
                      <span style={{
                        wordBreak: 'break-all',
                        color: f.status === 'active' ? 'var(--txt)' : 'var(--txt-m)',
                        flex: 1,
                      }}>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Current file name */}
              <div style={{ fontSize: 12, color: 'var(--txt-m)', display:'flex', alignItems:'center', gap:6 }}>
                <i className="fas fa-file" style={{ color:'var(--pri)' }} />
                <span style={{ wordBreak:'break-all', color:'var(--txt)' }}>{uploadFileName}</span>
              </div>

              {/* Phase 1 — Browser → Server */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <span style={{ fontSize:11, color: srvDone ? 'var(--green)' : 'var(--txt-m)', display:'flex', alignItems:'center', gap:5 }}>
                    {srvDone
                      ? <><i className="fas fa-circle-check" style={{ color:'var(--green)' }} /> Server received</>
                      : <><i className="fas fa-upload" style={{ color:'var(--pri)' }} /> Uploading to server…</>
                    }
                  </span>
                  <span style={{ fontSize:11, fontWeight:600, color: srvDone ? 'var(--green)' : 'var(--txt)' }}>{srvPct}%</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:'var(--surf-4)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:3,
                    background: srvDone ? 'var(--green)' : 'var(--pri-grad)',
                    width: srvPct + '%',
                    transition: 'width 0.15s ease',
                  }} />
                </div>
              </div>

              {/* Phase 2 — Server → Telegram (shown once TG phase begins) */}
              <div style={{ opacity: tgStarted ? 1 : 0.35, transition:'opacity 0.3s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <span style={{ fontSize:11, color: tgPct >= 100 ? 'var(--green)' : tgStarted ? '#29a7e1' : 'var(--txt-d)', display:'flex', alignItems:'center', gap:5 }}>
                    {tgPct >= 100
                      ? <><i className="fas fa-circle-check" style={{ color:'var(--green)' }} /> Telegram upload complete</>
                      : tgStarted
                        ? <><i className="fas fa-paper-plane" style={{ color:'#29a7e1' }} /> Sending to Telegram…{tgLabel ? ` ${tgLabel}` : ''}</>
                        : <><i className="fas fa-clock" /> Waiting for Telegram…</>
                    }
                  </span>
                  <span style={{ fontSize:11, fontWeight:600, color: tgPct >= 100 ? 'var(--green)' : tgStarted ? 'var(--txt)' : 'var(--txt-d)' }}>{tgPct}%</span>
                </div>
                <div style={{ height:6, borderRadius:3, background:'var(--surf-4)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:3,
                    background: tgPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg,#29a7e1,#1d8ab5)',
                    width: tgPct + '%',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
              </div>

              {/* Done / Error */}
              {uploadDone && (
                <div style={{ display:'flex', alignItems:'center', gap:6, color:'var(--green)', fontSize:12, fontWeight:600 }}>
                  <i className="fas fa-circle-check" /> Upload complete!
                </div>
              )}
              {uploadError && (
                <div className="login-err" style={{ marginTop:0, fontSize:12 }}>
                  <i className="fas fa-circle-exclamation" /> {uploadError}
                </div>
              )}
            </div>
          )}

          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowUpload(false)}>Close</button>
            <button type="submit" className="btn bp" style={{ flex:2 }}
              disabled={uploadActive && !uploadDone && !uploadError}>
              <i className="fas fa-upload" /> Upload
            </button>
          </div>
        </form>
      </Modal>

      {/* ── New Subfolder Modal ── */}
      <Modal open={showNewSub} onClose={() => setShowNewSub(false)} title="Create Subfolder">
        <form onSubmit={handleCreateSubfolder}>
          {modalMsg && <div className="login-err" style={{ marginBottom:14 }}>{modalMsg}</div>}
          <div className="fg2">
            <label className="fl2">Folder Name</label>
            <input className="fi2" type="text" placeholder="Subfolder Name" value={subName} onChange={e => setSubName(e.target.value)} autoFocus required />
          </div>
          <div className="fg2">
            <label className="fl2">Channel ID <span style={{ color:'var(--txt-d)' }}>(optional)</span></label>
            <input className="fi2" type="text" placeholder="-100XXXXXXXXXX" value={subChan} onChange={e => setSubChan(e.target.value)} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowNewSub(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Creating…</> : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Rename Folder Modal ── */}
      <Modal open={showRenameFolder} onClose={() => setShowRenameFolder(false)} title="Rename Folder">
        <form onSubmit={handleRenameFolder}>
          {modalMsg && <div className="login-err" style={{ marginBottom:14 }}>{modalMsg}</div>}
          <div className="fg2">
            <label className="fl2">New Name</label>
            <input className="fi2" type="text" value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus required />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowRenameFolder(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Renaming…</> : 'Rename'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Folder Modal ── */}
      <Modal open={showDeleteFolder} onClose={() => setShowDeleteFolder(false)} title="Delete Folder?">
        <p style={{ fontSize:13, color:'var(--txt-m)', marginBottom:20, lineHeight:1.6 }}>
          Delete <strong style={{ color:'var(--txt)' }}>{selFolder?.name}</strong> and all its files?
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn bs" style={{ flex:1 }} onClick={() => setShowDeleteFolder(false)}>Cancel</button>
          <button className="btn bd" style={{ flex:1 }} onClick={handleDeleteFolder} disabled={busy}>
            {busy ? <><i className="fas fa-spinner fa-spin" /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* ── Rename File Modal ── */}
      <Modal open={showRenameFile} onClose={() => setShowRenameFile(false)} title="Rename File">
        <form onSubmit={handleRenameFile}>
          {modalMsg && <div className="login-err" style={{ marginBottom:14 }}>{modalMsg}</div>}
          <div className="fg2">
            <label className="fl2">New Filename</label>
            <input className="fi2" type="text" value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus required />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowRenameFile(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Renaming…</> : 'Rename'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Move File Modal ── */}
      <Modal open={showMoveFile} onClose={() => setShowMoveFile(false)} title="Move File">
        <form onSubmit={handleMoveFile}>
          {modalMsg && <div className="login-err" style={{ marginBottom:14 }}>{modalMsg}</div>}
          <div className="fg2">
            <label className="fl2">Move to Folder</label>
            <select className="fi2" value={moveFolder} onChange={e => setMoveFolder(e.target.value)} required>
              <option value="">Select folder…</option>
              {allFolders.map(f => (
                <option key={f.folderId} value={f.folderId}>{f.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" className="btn bs" style={{ flex:1 }} onClick={() => setShowMoveFile(false)}>Cancel</button>
            <button type="submit" className="btn bp" style={{ flex:2 }} disabled={busy}>
              {busy ? <><i className="fas fa-spinner fa-spin" /> Moving…</> : 'Move File'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete File Modal ── */}
      <Modal open={showDeleteFile} onClose={() => setShowDeleteFile(false)} title="Delete File?">
        <p style={{ fontSize:13, color:'var(--txt-m)', marginBottom:20, lineHeight:1.6 }}>
          Delete <strong style={{ color:'var(--txt)' }}>{selFile?.filename}</strong> from the database? The Telegram message is not deleted.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn bs" style={{ flex:1 }} onClick={() => setShowDeleteFile(false)}>Cancel</button>
          <button className="btn bd" style={{ flex:1 }} onClick={handleDeleteFile} disabled={busy}>
            {busy ? <><i className="fas fa-spinner fa-spin" /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* ── Video Player Modal ── */}
      <Modal open={showVideo} onClose={() => { setShowVideo(false); setMediaUrl(''); }} title={null} wide>
        <div style={{ padding:'0 0 0 0' }}>
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'0 36px 14px 0', marginBottom:10,
          }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', wordBreak:'break-all' }}>{mediaName}</div>
          </div>
          {mediaUrl && (
            <video
              src={mediaUrl}
              controls autoPlay
              style={{ width:'100%', maxHeight:'70vh', borderRadius:'var(--radius)', background:'#000' }}
            />
          )}
        </div>
      </Modal>

      {/* ── Image Viewer Modal ── */}
      <Modal open={showImage} onClose={() => { setShowImage(false); setMediaUrl(''); }} title={mediaName} wide>
        <div style={{ textAlign:'center' }}>
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt={mediaName}
              style={{ maxWidth:'100%', maxHeight:'70vh', borderRadius:'var(--radius)', border:'1px solid var(--brd)' }}
            />
          )}
        </div>
      </Modal>

      {/* ── Audio Player Modal ── */}
      <Modal open={showAudio} onClose={() => { setShowAudio(false); setMediaUrl(''); }} title={mediaName}>
        <div style={{ textAlign:'center', padding:'20px 0' }}>
          <i className="fas fa-music" style={{ fontSize:56, color:'var(--pri)', marginBottom:20, display:'block', opacity:0.8 }} />
          {mediaUrl && (
            <audio src={mediaUrl} controls autoPlay style={{ width:'100%', maxWidth:380 }} />
          )}
        </div>
      </Modal>

      {/* ── PDF Viewer Modal ── */}
      <Modal open={showPdf} onClose={() => { setShowPdf(false); setMediaUrl(''); }} title={null} wide>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, paddingRight:36 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', wordBreak:'break-all' }}>{mediaName}</div>
        </div>
        {mediaUrl && (
          <iframe
            src={mediaUrl}
            title={mediaName}
            style={{ width:'100%', height:'72vh', border:'none', borderRadius:'var(--radius)' }}
          />
        )}
      </Modal>

      {/* ── Floating upload indicator — visible when modal is closed but upload is running ── */}
      {uploadActive && !showUpload && (
        <UploadFAB
          srvPct={srvPct}
          srvDone={srvDone}
          tgPct={tgPct}
          tgStarted={tgStarted}
          uploadDone={uploadDone}
          uploadError={uploadError}
          uploadFileName={uploadFileName}
          onClick={() => setShowUpload(true)}
        />
      )}

      <style>{`
        @keyframes fabIn {
          0%   { opacity:0; transform: scale(0.6) translateY(20px); }
          100% { opacity:1; transform: scale(1)   translateY(0);    }
        }
      `}</style>
    </Layout>
  );
}

// ── Floating upload progress FAB ──────────────────────────────────────────────
function UploadFAB({ srvPct, srvDone, tgPct, tgStarted, uploadDone, uploadError, uploadFileName, onClick }) {
  // Map two phases into a single 0-100 overall: server = first 50%, telegram = last 50%
  const overall = uploadDone
    ? 100
    : uploadError
    ? srvDone ? Math.round(50 + tgPct * 0.5) : Math.round(srvPct * 0.5)
    : srvDone
    ? Math.round(50 + tgPct * 0.5)
    : Math.round(srvPct * 0.5);

  const R  = 26;
  const C  = 2 * Math.PI * R;            // circumference
  const offset = C * (1 - overall / 100); // dashoffset → 0 = full ring

  const ringColor = uploadError ? 'var(--red)' : uploadDone ? 'var(--green)' : tgStarted ? '#29a7e1' : 'var(--pri)';
  const icon      = uploadError ? 'fa-circle-exclamation' : uploadDone ? 'fa-circle-check' : tgStarted ? 'fa-paper-plane' : 'fa-cloud-arrow-up';

  // Tooltip label
  const phase = uploadError ? 'Error' : uploadDone ? 'Done' : tgStarted ? 'Uploading to Telegram' : 'Uploading to server';
  const shortName = uploadFileName ? (uploadFileName.length > 22 ? uploadFileName.slice(0, 20) + '…' : uploadFileName) : '';

  return (
    <button
      onClick={onClick}
      title={`${phase}${shortName ? ` — ${shortName}` : ''}\nClick to open`}
      aria-label="Upload progress — click to view"
      style={{
        position:     'fixed',
        bottom:       24,
        right:        24,
        zIndex:       9999,
        width:        64,
        height:       64,
        borderRadius: '50%',
        background:   'var(--surf-2)',
        border:       '1px solid var(--brd-hi)',
        boxShadow:    '0 4px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.15)',
        cursor:       'pointer',
        padding:      0,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        animation:    'fabIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        outline:      'none',
        transition:   'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 28px rgba(0,0,0,0.7), 0 0 0 2px ${ringColor}`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(139,92,246,0.15)'; }}
    >
      {/* Circular SVG progress ring */}
      <svg width="64" height="64" style={{ position:'absolute', top:0, left:0, pointerEvents:'none' }}>
        {/* Track */}
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surf-4)" strokeWidth="3.5" />
        {/* Progress arc */}
        <circle
          cx="32" cy="32" r={R}
          fill="none"
          stroke={ringColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset 0.35s ease, stroke 0.3s' }}
        />
      </svg>

      {/* Center icon + percentage */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1, position:'relative', zIndex:1 }}>
        <i className={`fas ${icon}`} style={{ fontSize:16, color:ringColor, transition:'color 0.3s' }} />
        <span style={{ fontSize:10, fontWeight:700, color:'var(--txt)', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
          {overall}%
        </span>
      </div>
    </button>
  );
}

// ── Thumbnail component with lazy-load ────────────────────────────────────────
function ThumbImg({ thumbId }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/thumb-url?thumbId=${thumbId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.url) setUrl(d.url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [thumbId]);
  if (!url) return <div style={{ fontSize:36, color:'var(--pri)' }}><i className="fas fa-film" /></div>;
  return <img src={url} alt="thumb" style={{ width:'100%', height:'100%', objectFit:'cover' }} />;
}
