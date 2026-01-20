import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeftIcon, CopyIcon, CheckIcon } from '../../shared/Icons';
import './ReceiveView.css';

export function ReceiveView({ address, onBack }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-md mb-xl">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold">Receive OCT</h2>
            </div>

            <div className="qr-container">
                <div className="qr-code">
                    {/* Real QR Code - Can be scanned */}
                    <QRCodeSVG
                        value={address}
                        size={240}
                        level="H"
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        includeMargin={false}
                    />
                </div>

                <p className="text-secondary text-sm mb-lg text-center">
                    Scan this QR code to receive OCT
                </p>
            </div>

            {/* Improved address display with copy button on side */}
            <div className="address-display-full">
                <p className="address-display-label">Your Address</p>
                <div className="address-display-value">
                    <span className="address-display-text">{address}</span>
                    <button
                        className="address-copy-btn"
                        onClick={handleCopy}
                        title="Copy address"
                    >
                        {copied ? (
                            <CheckIcon size={18} style={{ color: 'var(--success)' }} />
                        ) : (
                            <CopyIcon size={18} />
                        )}
                    </button>
                </div>
            </div>

            <button
                className="btn btn-primary btn-lg btn-full gap-sm"
                onClick={handleCopy}
            >
                {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                {copied ? 'Copied!' : 'Copy Address'}
            </button>
        </div>
    );
}
