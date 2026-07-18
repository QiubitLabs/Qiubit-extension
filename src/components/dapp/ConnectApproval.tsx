import { useState } from "react";
import { Wallet } from "../../types";
import { CheckCircleIcon, ShieldIcon, LinkIcon } from "../shared/Icons";

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
  /** Per-chain addresses for an unscoped multichain connect — when set, every
   * granted address is listed with its chain instead of a single ambiguous one. */
  multichainAddresses?: Array<{ label: string; address: string }>;
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
  onWalletSelectClick,
  multichainAddresses,
}: ConnectApprovalProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const connectDisplayAddr = getDisplayAddress(selectedOctraAddr);
  const connectWallet = wallets.find((w) => w.address === selectedOctraAddr);
  const connectLabel =
    connectWallet?.name ?? truncate(connectDisplayAddr, 8, 6);

  const getFaviconUrl = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.id && request.origin) {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(request.origin)}&size=64`;
    }
    return request.icon || "";
  };
  const faviconUrl = getFaviconUrl();

  return (
    <div className="da-body-content da-connect-layout">
      <div className="da-site-header-card">
        <div className="da-site-icon">
          {faviconUrl &&
          !imgFailed &&
          (faviconUrl.startsWith("chrome-extension://") ||
            faviconUrl.startsWith("http://") ||
            faviconUrl.startsWith("https://") ||
            faviconUrl.startsWith("data:image/")) ? (
            <img src={faviconUrl} alt="" onError={() => setImgFailed(true)} />
          ) : (
            <div className="da-site-icon-fallback">
              <LinkIcon size={24} />
            </div>
          )}
        </div>
        <div className="da-site-origin-domain">{request.origin}</div>
        <div className="da-site-subtitle">
          Requesting connection to your wallet
        </div>
      </div>

      {/* Wallet selector card */}
      <div className="da-connect-wallet-section">
        <div className="da-section-label">Connect with Account:</div>
        <button
          type="button"
          className="da-connect-wallet-btn"
          onClick={() => wallets.length > 1 && onWalletSelectClick()}
          style={{ cursor: wallets.length > 1 ? "pointer" : "default" }}
        >
          <div className="da-connect-wallet-avatar">
            {connectLabel.slice(0, 1).toUpperCase()}
          </div>
          <div className="da-connect-wallet-info">
            <span className="da-connect-wallet-name">{connectLabel}</span>
            {multichainAddresses && multichainAddresses.length > 0 ? (
              multichainAddresses.map((row) => (
                <span
                  key={row.label}
                  className="da-connect-wallet-addr"
                  title={row.address}
                >
                  {row.label}: {truncate(row.address, 8, 6)}
                </span>
              ))
            ) : (
              <span className="da-connect-wallet-addr">
                {truncate(connectDisplayAddr || selectedOctraAddr, 8, 6)}
              </span>
            )}
          </div>
          {wallets.length > 1 && (
            <span className="da-connect-wallet-chevron">&#8250;</span>
          )}
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
              <span className="da-perm-desc">
                Required to propose transactions and messages.
              </span>
            </div>
          </div>
          <div className="da-perm-row">
            <CheckCircleIcon size={16} className="da-perm-check" />
            <div className="da-perm-text">
              <span className="da-perm-title">View account balance</span>
              <span className="da-perm-desc">
                Allows dApp to show native tokens and balances.
              </span>
            </div>
          </div>
          <div className="da-perm-row">
            <CheckCircleIcon size={16} className="da-perm-check" />
            <div className="da-perm-text">
              <span className="da-perm-title">
                Request transaction approvals
              </span>
              <span className="da-perm-desc">
                Transactions will always require your manual sign-off.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shield security notice */}
      <div className="da-notice da-security-shield-notice">
        <ShieldIcon size={14} className="da-shield-icon" />
        <span>
          Only connect to sites you trust. Connecting allows the site to read
          your public data but they cannot move assets without your signature.
        </span>
      </div>
    </div>
  );
}

export default ConnectApproval;
