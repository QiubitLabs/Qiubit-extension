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
      {/* 1. Home Button */}
      <button
        className={`nav-btn ${view === "home" ? "active" : ""}`}
        onClick={() => onChangeView("home")}
        type="button"
      >
        <div className="nav-icon-wrapper">
          <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <span className="nav-btn-label">Home</span>
        <span className="nav-btn-line"></span>
      </button>

      {/* 2. Send Button */}
      <button
        className={`nav-btn ${view === "send" ? "active" : ""}`}
        onClick={() => onChangeView("send")}
        type="button"
      >
        <div className="nav-icon-wrapper">
          <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
        <span className="nav-btn-label">Send</span>
        <span className="nav-btn-line"></span>
      </button>

      {/* 3. Swap Button (Floating Center FAB) */}
      <div className={`swap-fab-container ${view === "swap" ? "active" : ""}`}>
        <button
          className="swap-fab"
          onClick={() => onChangeView("swap")}
          type="button"
        >
          <div className="swap-fab-icon-wrapper">
            <svg className="swap-fab-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
          </div>
        </button>
        <span className="swap-fab-dot"></span>
      </div>

      {/* 4. Privacy Button */}
      <button
        className={`nav-btn ${view === "privacy" ? "active" : ""}`}
        onClick={() => onChangeView("privacy")}
        type="button"
      >
        <div className="nav-icon-wrapper">
          <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <polyline points="9 11 11 13 15 9"/>
          </svg>
        </div>
        <span className="nav-btn-label">Privacy</span>
        <span className="nav-btn-line"></span>
      </button>

      {/* 5. History Button */}
      <button
        className={`nav-btn ${view === "history" ? "active" : ""}`}
        onClick={() => onChangeView("history")}
        type="button"
      >
        <div className="nav-icon-wrapper">
          <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <polyline points="3 3 3 8 8 8"/>
            <line x1="12" y1="7" x2="12" y2="12"/>
            <line x1="12" y1="12" x2="16" y2="14"/>
          </svg>
        </div>
        <span className="nav-btn-label">History</span>
        <span className="nav-btn-line"></span>
      </button>
    </nav>
  );
}
