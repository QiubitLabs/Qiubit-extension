import { useState, useEffect } from 'react';
import { ChevronLeftIcon, CloseIcon, LinkIcon, GlobeIcon } from '../../shared/Icons';
import './ConnectedSites.css';

interface SiteConnection {
    origin: string;
    title?: string;
    favicon?: string;
    address?: string;
    evmAddress?: string;
    connectedAt?: number;
}

interface ConnectedSitesProps {
    onBack: () => void;
}

export function ConnectedSites({ onBack }: ConnectedSitesProps) {
    const [sites, setSites] = useState<SiteConnection[]>([]);
    const [loading, setLoading] = useState(true);

    const loadSites = () => {
        setLoading(true);
        chrome.runtime.sendMessage(
            { type: 'POPUP_REQUEST', action: 'getConnections' },
            (response) => {
                if (response?.result) {
                    setSites(response.result);
                }
                setLoading(false);
            }
        );
    };

    useEffect(() => {
        loadSites();
    }, []);

    const handleDisconnect = (origin: string) => {
        chrome.runtime.sendMessage(
            { type: 'POPUP_REQUEST', action: 'disconnectOrigin', data: { origin } },
            () => {
                setSites(prev => prev.filter(s => s.origin !== origin));
            }
        );
    };

    const getFaviconUrl = (site: SiteConnection) => {
        if (site.favicon) return site.favicon;
        try {
            return `${site.origin}/favicon.ico`;
        } catch {
            return '';
        }
    };

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const truncateOrigin = (origin: string) => {
        try {
            const url = new URL(origin);
            return url.hostname;
        } catch {
            return origin;
        }
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Connected Sites</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in" style={{ paddingBottom: 0 }}>
                {loading ? (
                    <div className="cs-empty">
                        <div className="cs-spinner" />
                    </div>
                ) : sites.length === 0 ? (
                    <div className="cs-empty">
                        <div className="cs-empty-icon">
                            <LinkIcon size={32} />
                        </div>
                        <p className="cs-empty-title">No connected sites</p>
                        <p className="cs-empty-desc">
                            Sites you connect to will appear here
                        </p>
                    </div>
                ) : (
                    <div className="cs-list">
                        {sites.map((site) => (
                            <div key={site.origin} className="cs-item">
                                <div className="cs-item-left">
                                    <div className="cs-favicon">
                                        <img
                                            src={getFaviconUrl(site)}
                                            alt=""
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                        <GlobeIcon size={18} className="cs-favicon-fallback hidden" />
                                    </div>
                                    <div className="cs-item-info">
                                        <span className="cs-item-host">
                                            {truncateOrigin(site.origin)}
                                        </span>
                                        {site.connectedAt && (
                                            <span className="cs-item-date">
                                                Connected {formatDate(site.connectedAt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className="cs-disconnect-btn"
                                    onClick={() => handleDisconnect(site.origin)}
                                    title="Disconnect"
                                >
                                    <CloseIcon size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            className="cs-disconnect-all"
                            onClick={() => {
                                sites.forEach(s => handleDisconnect(s.origin));
                            }}
                        >
                            Disconnect All
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
