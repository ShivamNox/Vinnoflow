import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

export default function Scrapers() {
    const navigate = useNavigate();
    const [scrapers, setScrapers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchScrapers();
    }, []);

    const fetchScrapers = async () => {
        try {
            const res = await fetch('/api/scrapers/status', {
                credentials: 'include'
            });
            const data = await res.json();
            setScrapers(data.scrapers || []);
        } catch (error) {
            console.error('Failed to fetch scrapers:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Layout><div>Loading...</div></Layout>;

    return (
        <Layout>
            <div style={{ padding: '20px' }}>
                <h1>Scrapers</h1>
                <p>Manage your content scrapers</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '30px' }}>
                    {/* HDHub4u Card */}
                    <div
                        onClick={() => navigate('/scrapers/hdhub4u')}
                        style={{
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: '#fff'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        <h2 style={{ margin: '0 0 10px 0' }}>HDHub4u Scraper</h2>
                        <p style={{ color: '#666', margin: '0 0 15px 0' }}>
                            Automatically scrape movies and series from HDHub4u
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '500',
                                backgroundColor: scrapers.find(s => s.name === 'hdhub4u')?.enabled ? '#d4edda' : '#f8d7da',
                                color: scrapers.find(s => s.name === 'hdhub4u')?.enabled ? '#155724' : '#721c24'
                            }}>
                                {scrapers.find(s => s.name === 'hdhub4u')?.enabled ? 'Active' : 'Inactive'}
                            </span>
                            {scrapers.find(s => s.name === 'hdhub4u')?.isRunning && (
                                <span style={{ fontSize: '12px', color: '#666' }}>🔄 Running...</span>
                            )}
                        </div>
                    </div>

                    {/* Placeholder for future scrapers */}
                    <div style={{
                        border: '1px dashed #ddd',
                        borderRadius: '8px',
                        padding: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '150px',
                        color: '#999'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', marginBottom: '10px' }}>+</div>
                            <div>More scrapers coming soon</div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}