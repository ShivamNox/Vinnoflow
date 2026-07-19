import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";

export default function Scrapers() {
    const navigate = useNavigate();
    const [scrapers, setScrapers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchScrapers();
    }, []);

    const fetchScrapers = async () => {
        try {
            const res = await fetch("/api/scrapers/status", {
                credentials: "include",
            });
            const data = await res.json();
            setScrapers(data.scrapers || []);
        } catch (error) {
            console.error("Failed to fetch scrapers:", error);
        } finally {
            setLoading(false);
        }
    };

    const hdhub = scrapers.find((s) => s.name === "hdhub4u");

    if (loading) {
        return (
            <Layout>
                <div className="es">
                    <i className="fas fa-spinner fa-spin"></i>
                    Loading scrapers...
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="ph">
                <div>
                    <div className="pt">Scrapers</div>
                    <div className="ps">
                        Manage your content scrapers and automation tools
                    </div>
                </div>
            </div>

            <div className="cards-grid">
                {/* HDHub4u Card */}
                <div
                    className="card"
                    onClick={() => navigate("/scrapers/hdhub4u")}
                >
                    <div className="card-icon">
                        <i className="fas fa-film"></i>
                    </div>
                    <div className="card-title">HDHub4u Scraper</div>
                    <div className="card-desc">
                        Automatically scrape movies and series from HDHub4u
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <span
                            className={`card-tag ${hdhub?.enabled ? "active" : "soon"}`}
                        >
                            <i
                                className="fas fa-circle"
                                style={{ fontSize: "6px" }}
                            ></i>
                            {hdhub?.enabled ? "Active" : "Inactive"}
                        </span>
                        {hdhub?.isRunning && (
                            <span className="card-tag blue">
                                <i
                                    className="fas fa-sync fa-spin"
                                    style={{ fontSize: "8px" }}
                                ></i>
                                Running
                            </span>
                        )}
                    </div>
                </div>

                {/* Placeholder for future scrapers */}
                <div className="card soon">
                    <div className="card-icon amber">
                        <i className="fas fa-plus"></i>
                    </div>
                    <div className="card-title">More Scrapers</div>
                    <div className="card-desc">
                        Additional scraper modules coming soon
                    </div>
                    <span className="card-tag soon">
                        <i
                            className="fas fa-clock"
                            style={{ fontSize: "8px" }}
                        ></i>
                        Coming Soon
                    </span>
                </div>
            </div>
        </Layout>
    );
}
