import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

export default function HDHub4u() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [view, setView] = useState(id ? 'details' : 'list');
    const [content, setContent] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    // Video player state
    const [playingVideo, setPlayingVideo] = useState(null);
    // null | { title, loading: true } | { title, url, server, type, loading: false }

    const searchTimeout = useRef(null);

    useEffect(() => {
        if (id) {
            fetchItemDetails(id);
        } else {
            fetchContent();
            setView('list');
        }
        fetchSettings();
    }, [id]);

    useEffect(() => {
        if (!id) fetchContent();
    }, [page, typeFilter]);

    // Debounced search
    useEffect(() => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setPage(1);
            if (!id) fetchContent();
        }, 400);
    }, [searchQuery]);

    const fetchContent = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page,
                limit: 24,
                ...(typeFilter && { type: typeFilter }),
                ...(searchQuery && { search: searchQuery })
            });
            const res = await fetch(`/api/scrapers/hdhub4u/content?${params}`, { credentials: 'include' });
            const data = await res.json();
            setContent(data.content || []);
            setTotalPages(data.totalPages || 1);
            setTotal(data.total || 0);
        } catch (error) {
            console.error('Failed to fetch content:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchItemDetails = async (itemId) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/scrapers/hdhub4u/content/${itemId}`, { credentials: 'include' });
            const data = await res.json();
            setSelectedItem(data.content);
            setView('details');
        } catch (error) {
            console.error('Failed to fetch item:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/scrapers/hdhub4u/settings', { credentials: 'include' });
            const data = await res.json();
            setSettings(data.settings);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const updateSettings = async (newSettings) => {
        try {
            const res = await fetch('/api/scrapers/hdhub4u/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newSettings)
            });
            const data = await res.json();
            setSettings(data.settings);
            alert(data.message || 'Settings updated');
            setView('list');
        } catch (error) {
            alert('Failed to update settings');
        }
    };

    const deleteItem = async (itemId) => {
        if (!confirm('Delete this item?')) return;
        try {
            await fetch(`/api/scrapers/hdhub4u/content/${itemId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            navigate('/scrapers/hdhub4u');
            setView('list');
            fetchContent();
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    // ====== VIDEO PLAYER with BYPASS ======
    const playVideo = async (link, title) => {
        // Show loading state immediately
        setPlayingVideo({ title, loading: true, link: null });

        try {
            const res = await fetch('/api/scrapers/bypass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ url: link })
            });

            const data = await res.json();

            if (data.success) {
                if (data.type === 'gdrive') {
                    // GDrive — open in new tab (can't embed due to CORS)
                    setPlayingVideo(null);
                    window.open(data.directUrl, '_blank');
                } else {
                    // Direct video URL — play in modal
                    setPlayingVideo({
                        title,
                        loading: false,
                        url: data.directUrl,
                        server: data.server,
                        type: data.type
                    });
                }
            } else {
                setPlayingVideo(null);
                alert(`Failed to bypass link: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            setPlayingVideo(null);
            alert('Network error while loading video');
        }
    };

    const closeVideo = () => setPlayingVideo(null);

    // ====== OPEN DIRECT LINK (bypass + open in new tab, no inline player) ======
    const openDirectLink = async (link) => {
        try {
            const res = await fetch('/api/scrapers/bypass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ url: link })
            });

            const data = await res.json();

            if (data.success) {
                window.open(data.directUrl, '_blank');
            } else {
                alert(`Failed to bypass link: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            alert('Network error while loading link');
        }
    };

    // ====== HOST DISPLAY HELPER ======
    const getHostBadge = (host) => {
        const map = {
            hubcloud: { label: 'HubCloud', color: 'var(--pri)' },
            hubdrive: { label: 'HubDrive', color: 'var(--acc)' },
            gdrive: { label: 'GDrive', color: '#4285f4' },
            direct: { label: 'Direct', color: 'var(--green)' },
        };
        return map[host] || { label: host || 'Link', color: 'var(--txt-d)' };
    };

    // ====== SETTINGS VIEW ======
    if (view === 'settings') {
        return (
            <Layout>
                <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
                    <div className="ph">
                        <div>
                            <h1 className="pt">HDHub4u Settings</h1>
                            <p className="ps">Configure scraper interval and start page</p>
                        </div>
                        <button onClick={() => setView('list')} className="btn bs">
                            <i className="fas fa-arrow-left"></i> Back
                        </button>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const fd = new FormData(e.target);
                            updateSettings({
                                enabled: fd.get('enabled') === 'on',
                                interval: parseInt(fd.get('interval')),
                                intervalUnit: fd.get('intervalUnit'),
                                startPage: parseInt(fd.get('startPage'))
                            });
                        }}
                        style={{
                            background: 'var(--surf-2)',
                            border: '1px solid var(--brd)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '24px'
                        }}
                    >
                        {/* Enable Toggle */}
                        <div className="fg2">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    name="enabled"
                                    defaultChecked={settings?.enabled}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--pri)' }}
                                />
                                <span style={{ fontSize: '14px', color: 'var(--txt)', fontWeight: '500' }}>
                                    Enable Scraper
                                </span>
                            </label>
                        </div>

                        {/* Interval */}
                        <div className="fg2">
                            <label className="fl2">Scrape Interval</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                    type="number"
                                    name="interval"
                                    defaultValue={settings?.interval || 10}
                                    min="1"
                                    required
                                    className="fi2"
                                    style={{ flex: 1 }}
                                />
                                <select
                                    name="intervalUnit"
                                    defaultValue={settings?.intervalUnit || 'minutes'}
                                    className="fi2"
                                    style={{ width: '130px' }}
                                >
                                    <option value="seconds">Seconds</option>
                                    <option value="minutes">Minutes</option>
                                </select>
                            </div>
                            <small style={{ color: 'var(--txt-d)', marginTop: '6px', display: 'block' }}>
                                How often to fetch a new page of releases
                            </small>
                        </div>

                        {/* Start Page */}
                        <div className="fg2">
                            <label className="fl2">Start From Page</label>
                            <input
                                type="number"
                                name="startPage"
                                defaultValue={settings?.startPage || 1}
                                min="1"
                                required
                                className="fi2"
                            />
                            <small style={{ color: 'var(--txt-d)', marginTop: '6px', display: 'block' }}>
                                {settings?.caughtUp
                                    ? `Caught up — now monitoring the latest 5 pages each run`
                                    : `Catching up: page ${settings?.lastScrapedPage || settings?.startPage || 1} (sweeping down to page 1)`}
                            </small>
                        </div>

                        {settings?.lastRunAt && (
                            <div style={{
                                padding: '10px 14px',
                                background: 'var(--surf-3)',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--brd)',
                                marginBottom: '16px'
                            }}>
                                <small style={{ color: 'var(--txt-m)' }}>
                                    <i className="fas fa-clock" style={{ marginRight: '6px' }}></i>
                                    Last run: {new Date(settings.lastRunAt).toLocaleString()}
                                </small>
                            </div>
                        )}

                        <button type="submit" className="btn bp" style={{ width: '100%' }}>
                            <i className="fas fa-save"></i> Save Settings
                        </button>
                    </form>
                </div>
            </Layout>
        );
    }

    // ====== DETAILS VIEW ======
    if (view === 'details' && selectedItem) {
        return (
            <Layout>
                <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                    {/* Header */}
                    <div className="ph">
                        <button
                            onClick={() => {
                                navigate('/scrapers/hdhub4u');
                                setView('list');
                                setSelectedItem(null);
                            }}
                            className="btn bs"
                        >
                            <i className="fas fa-arrow-left"></i> Back
                        </button>
                        <button onClick={() => deleteItem(selectedItem._id)} className="btn bd">
                            <i className="fas fa-trash"></i> Delete
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                        {/* Poster */}
                        <div style={{ flexShrink: 0 }}>
                            <img
                                src={selectedItem.thumbnail}
                                alt={selectedItem.title}
                                style={{
                                    width: '240px',
                                    height: '360px',
                                    objectFit: 'cover',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid var(--brd)',
                                    display: 'block'
                                }}
                                onError={e => {
                                    e.target.style.background = 'var(--surf-3)';
                                    e.target.src = '';
                                }}
                            />
                        </div>

                        {/* Info + Links */}
                        <div style={{ flex: 1, minWidth: '280px' }}>
                            <h1 style={{ color: 'var(--txt)', marginBottom: '10px', fontSize: '20px', lineHeight: 1.4 }}>
                                {selectedItem.title}
                            </h1>

                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <span className={`card-tag ${selectedItem.type === 'movie' ? 'blue' : 'active'}`}>
                                    <i className={`fas ${selectedItem.type === 'movie' ? 'fa-film' : 'fa-tv'}`}></i>
                                    {selectedItem.type.toUpperCase()}
                                </span>
                                <span className="card-tag soon">
                                    {new Date(selectedItem.createdAt).toLocaleDateString()}
                                </span>
                            </div>

                            {/* MOVIE: quality list */}
                            {selectedItem.type === 'movie' && (
                                <div>
                                    <div className="st">Download Links</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {selectedItem.qualities?.length > 0 ? (
                                            selectedItem.qualities.map((q, idx) => {
                                                const hostInfo = getHostBadge(q.host);
                                                return (
                                                    <div key={idx} className="fit">
                                                        {/* Quality label */}
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{
                                                                fontSize: '13px',
                                                                fontWeight: '600',
                                                                color: 'var(--txt)'
                                                            }}>
                                                                {q.quality || q.label || 'Download'}
                                                            </span>
                                                            {/* Host badge */}
                                                            <span style={{
                                                                marginLeft: '8px',
                                                                fontSize: '10px',
                                                                padding: '2px 7px',
                                                                borderRadius: '4px',
                                                                background: hostInfo.color + '22',
                                                                color: hostInfo.color,
                                                                border: `1px solid ${hostInfo.color}44`,
                                                                fontWeight: '600'
                                                            }}>
                                                                {hostInfo.label}
                                                            </span>
                                                            {q.size && (
                                                                <span style={{
                                                                    marginLeft: '6px',
                                                                    fontSize: '11px',
                                                                    color: 'var(--txt-d)'
                                                                }}>
                                                                    {q.size}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/* Watch + Link buttons */}
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button
                                                                onClick={() => playVideo(q.link, selectedItem.title)}
                                                                className="btn bp"
                                                                style={{ fontSize: '12px', padding: '6px 14px' }}
                                                            >
                                                                <i className="fas fa-play"></i> Watch
                                                            </button>
                                                            <button
                                                                onClick={() => openDirectLink(q.link)}
                                                                className="btn"
                                                                style={{ fontSize: '12px', padding: '6px 14px' }}
                                                                title="Open direct link in a new tab"
                                                            >
                                                                <i className="fas fa-up-right-from-square"></i> Link
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="es">
                                                <i className="fas fa-link-slash"></i>
                                                <p>No download links available</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* SERIES: episodes */}
                            {selectedItem.type === 'series' && (
                                <div>
                                    <div className="st">
                                        {selectedItem.episodes?.length || 0} Episodes
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {selectedItem.episodes?.map((ep) => (
                                            <div
                                                key={ep.episode}
                                                style={{
                                                    background: 'var(--surf-2)',
                                                    border: '1px solid var(--brd)',
                                                    borderRadius: 'var(--radius)',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                <div style={{
                                                    padding: '10px 14px',
                                                    background: 'var(--surf-3)',
                                                    borderBottom: '1px solid var(--brd)',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    color: 'var(--pri-h)'
                                                }}>
                                                    <i className="fas fa-circle-play" style={{ marginRight: '8px' }}></i>
                                                    Episode {ep.episode}
                                                </div>
                                                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {ep.qualities?.length > 0 ? (
                                                        ep.qualities.map((q, idx) => {
                                                            const hostInfo = getHostBadge(q.host);
                                                            return (
                                                                <div key={idx} className="fit" style={{ padding: '8px 12px' }}>
                                                                    <div style={{ flex: 1 }}>
                                                                        <span style={{
                                                                            fontSize: '13px',
                                                                            fontWeight: '600',
                                                                            color: 'var(--txt)'
                                                                        }}>
                                                                            {q.quality || q.label || 'Download'}
                                                                        </span>
                                                                        <span style={{
                                                                            marginLeft: '8px',
                                                                            fontSize: '10px',
                                                                            padding: '2px 7px',
                                                                            borderRadius: '4px',
                                                                            background: hostInfo.color + '22',
                                                                            color: hostInfo.color,
                                                                            border: `1px solid ${hostInfo.color}44`,
                                                                            fontWeight: '600'
                                                                        }}>
                                                                            {hostInfo.label}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                                        <button
                                                                            onClick={() => playVideo(
                                                                                q.link,
                                                                                `${selectedItem.title} — Episode ${ep.episode}`
                                                                            )}
                                                                            className="btn bp"
                                                                            style={{ fontSize: '12px', padding: '5px 12px' }}
                                                                        >
                                                                            <i className="fas fa-play"></i> Watch
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openDirectLink(q.link)}
                                                                            className="btn"
                                                                            style={{ fontSize: '12px', padding: '5px 12px' }}
                                                                            title="Open direct link in a new tab"
                                                                        >
                                                                            <i className="fas fa-up-right-from-square"></i> Link
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <p style={{ color: 'var(--txt-d)', fontSize: '13px', padding: '4px 0' }}>
                                                            No links available
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ====== VIDEO PLAYER MODAL ====== */}
                {playingVideo && (
                    <div
                        className="mo open"
                        onClick={closeVideo}
                        style={{ flexDirection: 'column', padding: 0, alignItems: 'stretch', justifyContent: 'flex-start' }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                width: '100%',
                                height: '100%',
                                background: '#000'
                            }}
                        >
                            {/* Video header */}
                            <div className="vid-hdr">
                                <div className="vid-ttl">{playingVideo.title}</div>
                                <div className="vid-acts">
                                    {!playingVideo.loading && playingVideo.url && (
                                        <a
                                            href={playingVideo.url}
                                            download
                                            className="vid-act-btn"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <i className="fas fa-download"></i>
                                            <span className="vid-dl-lbl">Download</span>
                                        </a>
                                    )}
                                    {!playingVideo.loading && playingVideo.server && (
                                        <span style={{
                                            fontSize: '11px',
                                            padding: '4px 10px',
                                            borderRadius: '99px',
                                            background: 'var(--surf-3)',
                                            color: 'var(--txt-m)',
                                            border: '1px solid var(--brd)'
                                        }}>
                                            {playingVideo.server}
                                        </span>
                                    )}
                                    <button onClick={closeVideo} className="ib" style={{ color: 'var(--txt-m)' }}>
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>

                            {/* Video body */}
                            <div className="vid-body">
                                {playingVideo.loading ? (
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '16px',
                                        color: 'var(--txt-m)',
                                        padding: '60px'
                                    }}>
                                        <i
                                            className="fas fa-circle-notch fa-spin"
                                            style={{ fontSize: '40px', color: 'var(--pri)' }}
                                        ></i>
                                        <p style={{ fontSize: '14px' }}>
                                            Bypassing link, please wait...
                                        </p>
                                    </div>
                                ) : (
                                    <video
                                        key={playingVideo.url}
                                        controls
                                        autoPlay
                                        style={{ width: '100%', maxHeight: 'calc(100vh - 56px)', display: 'block' }}
                                        onError={() => alert('Video failed to load. Try a different quality.')}
                                    >
                                        <source src={playingVideo.url} type="video/mp4" />
                                        Your browser does not support the video tag.
                                    </video>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        );
    }

    // ====== LIST VIEW ======
    return (
        <Layout>
            <div style={{ padding: '24px' }}>
                {/* Header */}
                <div className="ph">
                    <div>
                        <h1 className="pt">HDHub4u</h1>
                        <p className="ps">
                            {total > 0 ? `${total} titles scraped` : 'No content yet'}
                        </p>
                    </div>
                    <div className="ba">
                        <button onClick={() => setView('settings')} className="btn bs">
                            <i className="fas fa-cog"></i> Settings
                        </button>
                    </div>
                </div>

                {/* Status bar */}
                {settings && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius)',
                        marginBottom: '20px',
                        background: settings.enabled ? 'var(--green-lo)' : 'var(--surf-2)',
                        border: `1px solid ${settings.enabled ? 'rgba(16,185,129,0.3)' : 'var(--brd)'}`,
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: settings.enabled ? 'var(--green)' : 'var(--txt-d)',
                                boxShadow: settings.enabled ? '0 0 8px var(--green)' : 'none',
                                display: 'inline-block'
                            }}></span>
                            <span style={{
                                fontSize: '13px',
                                fontWeight: '600',
                                color: settings.enabled ? 'var(--green)' : 'var(--txt-m)'
                            }}>
                                {settings.enabled ? 'Scraper Active' : 'Scraper Inactive'}
                            </span>
                            {settings.isRunning && (
                                <span style={{ fontSize: '12px', color: 'var(--txt-m)' }}>
                                    <i className="fas fa-circle-notch fa-spin"></i> Running
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--txt-d)' }}>
                            Interval: {settings.interval} {settings.intervalUnit} &nbsp;|&nbsp;{' '}
                            {settings.caughtUp ? 'Monitoring latest 5 pages' : `Catch-up page: ${settings.lastScrapedPage || 0}`}
                            {settings.lastRunAt && ` | Last: ${new Date(settings.lastRunAt).toLocaleTimeString()}`}
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <i className="fas fa-search" style={{
                            position: 'absolute', left: '12px', top: '50%',
                            transform: 'translateY(-50%)', color: 'var(--txt-d)', fontSize: '13px'
                        }}></i>
                        <input
                            type="text"
                            placeholder="Search titles..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="fi2"
                            style={{ paddingLeft: '34px' }}
                        />
                    </div>
                    <select
                        value={typeFilter}
                        onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                        className="fi2"
                        style={{ width: '140px' }}
                    >
                        <option value="">All Types</option>
                        <option value="movie">🎬 Movies</option>
                        <option value="series">📺 Series</option>
                    </select>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="es">
                        <i className="fas fa-circle-notch fa-spin"></i>
                        <p>Loading content...</p>
                    </div>
                ) : content.length === 0 ? (
                    <div className="es">
                        <i className="fas fa-film"></i>
                        <p>
                            {searchQuery || typeFilter
                                ? 'No results found'
                                : settings?.enabled
                                    ? 'Scraper is running, check back soon...'
                                    : 'Enable the scraper in Settings to start collecting content'}
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '16px',
                        marginBottom: '28px'
                    }}>
                        {content.map(item => (
                            <div
                                key={item._id}
                                onClick={() => {
                                    navigate(`/scrapers/hdhub4u/${item._id}`);
                                    fetchItemDetails(item._id);
                                }}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 'var(--radius-lg)',
                                    overflow: 'hidden',
                                    border: '1px solid var(--brd)',
                                    background: 'var(--surf-2)',
                                    transition: 'all var(--trans)',
                                    position: 'relative'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.borderColor = 'var(--brd-hi)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.borderColor = 'var(--brd)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {/* Thumbnail */}
                                <div style={{ position: 'relative', aspectRatio: '2/3', background: 'var(--surf-3)', overflow: 'hidden' }}>
                                    <img
                                        src={item.thumbnail}
                                        alt={item.title}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={e => e.target.style.display = 'none'}
                                    />
                                    {/* Type badge */}
                                    <span style={{
                                        position: 'absolute',
                                        top: '8px',
                                        left: '8px',
                                        fontSize: '9px',
                                        fontWeight: '700',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        background: item.type === 'movie' ? 'rgba(99,102,241,0.9)' : 'rgba(16,185,129,0.9)',
                                        color: '#fff',
                                        backdropFilter: 'blur(4px)'
                                    }}>
                                        {item.type === 'movie' ? 'MOVIE' : 'SERIES'}
                                    </span>
                                </div>

                                {/* Info */}
                                <div style={{ padding: '10px 12px' }}>
                                    <h3 style={{
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        color: 'var(--txt)',
                                        lineHeight: 1.4,
                                        overflow: 'hidden',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        marginBottom: '4px'
                                    }}>
                                        {item.title}
                                    </h3>
                                    <span style={{ fontSize: '10px', color: 'var(--txt-d)' }}>
                                        {item.type === 'series'
                                            ? `${item.episodes?.length || 0} episodes`
                                            : `${item.qualities?.length || 0} qualities`}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '8px'
                    }}>
                        <button
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                            className="btn bs"
                            style={{ opacity: page === 1 ? 0.4 : 1, padding: '7px 12px' }}
                        >
                            <i className="fas fa-angles-left"></i>
                        </button>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="btn bs"
                            style={{ opacity: page === 1 ? 0.4 : 1 }}
                        >
                            <i className="fas fa-chevron-left"></i> Prev
                        </button>

                        <div style={{
                            padding: '8px 18px',
                            background: 'var(--surf-2)',
                            border: '1px solid var(--brd)',
                            borderRadius: 'var(--radius)',
                            fontSize: '13px',
                            color: 'var(--txt-m)',
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            <span style={{ color: 'var(--pri-h)', fontWeight: '600' }}>{page}</span>
                            <span style={{ margin: '0 6px', color: 'var(--txt-d)' }}>/</span>
                            {totalPages}
                        </div>

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="btn bs"
                            style={{ opacity: page === totalPages ? 0.4 : 1 }}
                        >
                            Next <i className="fas fa-chevron-right"></i>
                        </button>
                        <button
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                            className="btn bs"
                            style={{ opacity: page === totalPages ? 0.4 : 1, padding: '7px 12px' }}
                        >
                            <i className="fas fa-angles-right"></i>
                        </button>
                    </div>
                )}
            </div>
        </Layout>
    );
}