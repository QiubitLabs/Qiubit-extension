import {
  WalletIcon,
  SendIcon,
  PrivacyIcon,
  SwapIcon,
  HistoryIcon,
} from "../../../shared/Icons";
import "./BottomNavigation.css";

export type DashboardView =
  | "home"
  | "send"
  | "history"
  | "nft"
  | "privacy"
  | "token-detail"
  | "swap";

interface BottomNavigationProps {
  view: string;
  onChangeView: (view: DashboardView) => void;
}

export function BottomNavigation({
  view,
  onChangeView,
}: BottomNavigationProps) {
  return (
    <nav className="wallet-nav">
      <button
        className={`nav-item nav-home ${view === "home" ? "active" : ""}`}
        onClick={() => onChangeView("home")}
      >
        <WalletIcon size={20} className="nav-icon" />
        <span className="nav-label">Home</span>
      </button>
      <button
        className={`nav-item nav-send ${view === "send" ? "active" : ""}`}
        onClick={() => onChangeView("send")}
      >
        <SendIcon size={20} className="nav-icon" />
        <span className="nav-label">Send</span>
      </button>
      <button
        className={`nav-item nav-privacy ${view === "privacy" ? "active" : ""}`}
        onClick={() => onChangeView("privacy")}
      >
        <PrivacyIcon size={20} className="nav-icon" />
        <span className="nav-label">Privacy</span>
      </button>
      <button
        className={`nav-item nav-swap ${view === "swap" ? "active" : ""}`}
        onClick={() => onChangeView("swap")}
      >
        <SwapIcon size={20} className="nav-icon" />
        <span className="nav-label">Swap</span>
      </button>
      <button
        className={`nav-item nav-history ${view === "history" ? "active" : ""}`}
        onClick={() => onChangeView("history")}
      >
        <HistoryIcon size={20} className="nav-icon" />
        <span className="nav-label">History</span>
      </button>
    </nav>
  );
}
