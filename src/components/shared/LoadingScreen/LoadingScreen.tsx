import { useEffect, useState } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
    message?: string;
}

export function LoadingScreen({ message = 'Loading Qiubit Wallet...' }: LoadingScreenProps) {
    const [showLongLoadMessage, setShowLongLoadMessage] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowLongLoadMessage(true);
        }, 5000); // Show "taking longer than expected" after 5s

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="loading-screen">
            <div className="loading-content">
                <div className="logo-container">
                    <div className="logo-pulse"></div>
                    <div className="logo-icon">
                        {/* Simple Qiubit O logo geometry */}
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="20" cy="20" r="16" stroke="#00D4FF" strokeWidth="4" className="logo-ring" />
                            <circle cx="20" cy="20" r="8" fill="#00D4FF" className="logo-core" />
                        </svg>
                    </div>
                </div>

                <h2 className="loading-title">Qiubit Wallet</h2>

                <div className="loading-bar-container">
                    <div className="loading-bar-fill"></div>
                </div>

                <p className="loading-status">{message}</p>

                {showLongLoadMessage && (
                    <p className="loading-hint animate-fade-in">
                        Taking a bit longer than usual...
                    </p>
                )}
            </div>

            <div className="loading-footer">
                <p>Secure & Private</p>
            </div>
        </div>
    );
}
