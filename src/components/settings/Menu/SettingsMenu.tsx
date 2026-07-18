import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  KeyIcon,
  LogoutIcon,
  ExportIcon,
  LockIcon,
  AlertIcon,
  CopyIcon,
  LinkIcon,
  ShieldIcon,
} from "../../shared/Icons";
import { keyringService } from "../../../services/core/KeyringService";
import { Wallet, Settings } from "../../../types";
import { getNetworkLabel } from "../../../constants/networks/registry";
import "./SettingsMenu.css";
import {
  AUTO_LOCK_DURATIONS,
  type AutoLockDuration,
  SessionService,
} from "../../../services/core/SessionService";
import packageInfo from "../../../../package.json";

interface SettingsMenuProps {
  wallet: Wallet;
  settings: Settings;
  onViewChange: (view: string) => void;
  onUpdateSettings?: (newSettings: Partial<Settings>) => Promise<void> | void;
  onBack: () => void;
  onExportKeystore: () => void;
  onDisconnect: () => void;
  onLock?: () => void;
}

export function SettingsMenu({
  wallet,
  settings,
  onViewChange,
  onUpdateSettings,
  onBack,
  onExportKeystore,
  onDisconnect,
  onLock,
}: SettingsMenuProps) {
  const handlePanicLock = () => {
    keyringService.panicLock();
    if (onLock) onLock();
  };

  return (
    <>
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Settings</span>
        </div>
      </header>

      <div
        className="wallet-content animate-fade-in"
        style={{ paddingBottom: 0 }}
      >


        {/* Network */}
        <div className="settings-section">
          <div className="settings-section-title">Common</div>

          <div
            className="settings-item"
            onClick={() => onViewChange("network")}
          >
            <div className="flex items-center gap-md">
              <GlobeIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Network</div>
                <div className="settings-item-value">
                  {getNetworkLabel(settings.network || "all")}
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div
            className="settings-item"
            onClick={() =>
              onUpdateSettings?.({
                hideZeroBalances: !(settings.hideZeroBalances === true),
              })
            }
          >
            <div className="flex items-center gap-md">
              <ShieldIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">
                  Hide Zero-Balance Tokens
                </div>
                <div className="settings-item-value">
                  Fold empty default tokens into Low assets
                </div>
              </div>
            </div>
            <span
              className={`settings-switch ${settings.hideZeroBalances === true ? "on" : ""}`}
              role="switch"
              aria-checked={settings.hideZeroBalances === true}
            >
              <span className="settings-switch-knob" />
            </span>
          </div>

          <div
            className="settings-item"
            onClick={() => onViewChange("connected-sites")}
          >
            <div className="flex items-center gap-md">
              <LinkIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Connected Sites</div>
                <div className="settings-item-value">
                  Manage dApp connections
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div
            className="settings-item"
            onClick={() => onViewChange("auto-lock")}
          >
            <div className="flex items-center gap-md">
              <LockIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Auto-Lock Timer</div>
                <div className="settings-item-value">
                  {(() => {
                    const ms = SessionService.getAutoLockDuration();
                    const match = (
                      Object.entries(AUTO_LOCK_DURATIONS) as [
                        AutoLockDuration,
                        number,
                      ][]
                    ).find(([, v]) => v === ms);
                    if (!match) return "5 minutes";
                    return match[0].replace("min", " minutes");
                  })()}
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div
            className="settings-item"
            onClick={() => onViewChange("address-book")}
          >
            <div className="flex items-center gap-md">
              <CopyIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Address Book</div>
                <div className="settings-item-value">Saved addresses</div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div
            className="settings-item"
            onClick={() => onViewChange("approvals")}
          >
            <div className="flex items-center gap-md">
              <ShieldIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Token Approvals</div>
                <div className="settings-item-value">
                  Review & revoke allowances
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div
            className="settings-item"
            onClick={() => onViewChange("currency")}
          >
            <div className="flex items-center gap-md">
              <GlobeIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Display Currency</div>
                <div className="settings-item-value">
                  Choose your fiat currency
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>
        </div>

        {/* Security */}
        <div className="settings-section">
          <div className="settings-section-title">Security</div>

          <div
            className="settings-item"
            onClick={() => onViewChange("change-password")}
          >
            <div className="flex items-center gap-md">
              <LockIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Change Password</div>
                <div className="settings-item-value">
                  Update your wallet password
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div className="settings-item" onClick={() => onViewChange("export")}>
            <div className="flex items-center gap-md">
              <KeyIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Export Private Key</div>
                <div className="settings-item-value">Requires password</div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>

          <div className="settings-item" onClick={onExportKeystore}>
            <div className="flex items-center gap-md">
              <ExportIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Export Keystore</div>
                <div className="settings-item-value">
                  Download wallet JSON file
                </div>
              </div>
            </div>
            <ChevronRightIcon size={18} className="text-tertiary" />
          </div>
        </div>

        {/* Recovery Phrase */}
        {wallet.mnemonic && (
          <div className="settings-section">
            <div className="settings-section-title">Recovery Phrase</div>

            <div
              className="settings-item"
              onClick={() => onViewChange("recovery-phrase")}
            >
              <div className="flex items-center gap-md">
                <KeyIcon size={20} />
                <div className="settings-item-content">
                  <div className="settings-item-label">12-word phrase</div>
                  <div className="settings-item-value">Requires password</div>
                </div>
              </div>
              <ChevronRightIcon size={18} className="text-tertiary" />
            </div>
          </div>
        )}

        {/* Emergency Zone */}
        <div className="settings-section">
          <div className="settings-section-title text-error">Emergency</div>

          <div
            className="settings-item settings-item-danger"
            onClick={handlePanicLock}
          >
            <div className="flex items-center gap-md">
              <AlertIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Panic Lock</div>
                <div className="settings-item-value">
                  Immediately lock and wipe memory
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section">
          <div className="settings-section-title">Danger Zone</div>

          <div
            className="settings-item settings-item-danger"
            onClick={onDisconnect}
          >
            <div className="flex items-center gap-md">
              <LogoutIcon size={20} />
              <div className="settings-item-content">
                <div className="settings-item-label">Disconnect Wallet</div>
                <div className="settings-item-value">
                  Remove wallet from this device
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center py-xl">
          <a
            href="https://qiubitwallet.com/privacy-terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "11px",
              color: "var(--text-tertiary)",
              textDecoration: "none",
              display: "inline-block",
              marginBottom: "8px",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--accent-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-tertiary)")
            }
          >
            Privacy Policy & Terms
          </a>
          <p className="text-xs text-tertiary">
            Qiubit Wallet v{packageInfo.version}
          </p>
          <p className="text-xs text-tertiary mt-xs">
            {getNetworkLabel(settings.network || "all")} - Client-side only
          </p>
        </div>
      </div>
    </>
  );
}
