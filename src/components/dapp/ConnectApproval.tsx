import { Wallet } from '../../types';
import { CheckCircleIcon, ShieldIcon, LinkIcon } from '../shared/Icons';

interface RequestData {
    origin: string;
    icon?: string;
    action: string;
    params?: any;
    [key: string]: any;
}

interface ConnectApprovalProps {
    request: RequestData;
    wallets: Wallet[];
    selectedOctraAddr: string;
    getDisplayAddress: (addr: string) => string;
    onWalletSelectClick: () => void;
}

function truncate(addr: string, front = 6, back = 4): string {
    if (!addr || addr.length <= front + back + 3) return addr;
    return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

export function ConnectApproval({
    request,
    wallets,
    selectedOctraAddr,
    getDisplayAddress,
    onWalletSelectClick
}: ConnectApprovalProps) {
    const connectDisplayAddr = getDisplayAddress(selectedOctraAddr);
    const connectWallet = wallets.find(w => w.address === selectedOctraAddr);
    const connectLabel = connectWallet?.name ?? truncate(connectDisplayAddr, 8, 6);

    return (
        <div className="da-body-content da-connect-layout">
            <div className="da-site-header-card">
                <div className="da-site-icon">
                    {request.icon && (request.icon.startsWith('https://') || request.icon.startsWith('data:image/')) ? (
                        <img src={request.icon} alt="" />
                    ) : (
                        <div className="da-site-icon-fallback">
                            <LinkIcon size={24} />
                        </div>
                    )}
                </div>
                <div className="da-site-origin-domain">{request.origin}</div>
                <div className="da-site-subtitle">Requesting connection to your wallet</div>
            </div>

            {/* Wallet selector card */}
            <div className="da-connect-wallet-section">
                <div className="da-section-label">Connect with Account:</div>
                <button
                    type="button"
                    className="da-connect-wallet-btn"
                    onClick={() => wallets.length > 1 && onWalletSelectClick()}
                    style={{ cursor: wallets.length > 1 ? 'pointer' : 'default' }}
                >
                    <div className="da-connect-wallet-avatar">
                        {connectLabel.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="da-connect-wallet-info">
                        <span className="da-connect-wallet-name">{connectLabel}</span>
                        <span className="da-connect-wallet-addr">
                            {truncate(connectDisplayAddr || selectedOctraAddr, 8, 6)}
                        </span>
                    </div>
                    {wallets.length > 1 && <span className="da-connect-wallet-chevron">&#8250;</span>}
                </button>
            </div>

            {/* Permissions list */}
            <div className="da-perms-container">
                <div className="da-section-label">Permissions requested:</div>
                <div className="da-perms-list">
                    <div className="da-perm-row">
                        <CheckCircleIcon size={16} className="da-perm-check" />
                        <div className="da-perm-text">
                            <span className="da-perm-title">View wallet address</span>
                            <span className="da-perm-desc">Required to propose transactions and messages.</span>
                        </div>
                    </div>
                    <div className="da-perm-row">
                        <CheckCircleIcon size={16} className="da-perm-check" />
                        <div className="da-perm-text">
                            <span className="da-perm-title">View account balance</span>
                            <span className="da-perm-desc">Allows dApp to show native tokens and balances.</span>
                        </div>
                    </div>
                    <div className="da-perm-row">
                        <CheckCircleIcon size={16} className="da-perm-check" />
                        <div className="da-perm-text">
                            <span className="da-perm-title">Request transaction approvals</span>
                            <span className="da-perm-desc">Transactions will always require your manual sign-off.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Shield security notice */}
            <div className="da-notice da-security-shield-notice">
                <ShieldIcon size={14} className="da-shield-icon" />
                <span>Only connect to sites you trust. Connecting allows the site to read your public data but they cannot move assets without your signature.</span>
            </div>
        </div>
    );
}

export default ConnectApproval;
