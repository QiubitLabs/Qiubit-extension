/**
 * SVG Icon Components for Octra Wallet
 */

// Quantum Wallet Logo - Uses icon.svg
export const QuantumLogo = ({ size = 24, className = '' }) => (
    <img
        src="/icon.svg"
        alt="Quantum"
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain' }}
    />
);

// Keep UbaLogo as alias for backward compatibility
export const UbaLogo = QuantumLogo;

// Keep Octra logo for backward compatibility
export const OctraLogo = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path d="M12 6V2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 22V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Official Octra Token Logo from octra-repos
export const OctraTokenLogo = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 50 50" fill="none" className={className}>
        <circle cx="25" cy="25" r="21" stroke="#0000DB" strokeWidth="8" />
    </svg>
);

export const SendIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const ReceiveIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 5V19M12 19L5 12M12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const ScanIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M3 7V5C3 3.89543 3.89543 3 5 3H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 3H19C20.1046 3 21 3.89543 21 5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 17V19C21 20.1046 20.1046 21 19 21H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 21H5C3.89543 21 3 20.1046 3 19V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 12H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const HistoryIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    </svg>
);

export const SearchIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const WalletIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="14" r="1.5" fill="currentColor" />
    </svg>
);

export const SettingsIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M19.4 15C19.1 15.6 19 16.2 19.2 16.8L19.9 19.2C19.9 19.3 19.9 19.4 19.8 19.5L18.9 21.3C18.8 21.4 18.7 21.5 18.5 21.5L15.9 20.8C15.3 20.6 14.7 20.7 14.1 21L12.4 22C12.3 22.1 12.1 22.1 12 22.1H10.1C10 22.1 9.8 22.1 9.7 22L8 21C7.4 20.7 6.8 20.6 6.2 20.8L3.6 21.5C3.5 21.5 3.3 21.4 3.2 21.3L2.3 19.5C2.2 19.4 2.2 19.3 2.2 19.2L2.9 16.8C3.1 16.2 3 15.6 2.7 15L1.7 13.3C1.6 13.2 1.6 13 1.6 12.9V11.1C1.6 11 1.6 10.8 1.7 10.7L2.7 9C3 8.4 3.1 7.8 2.9 7.2L2.2 4.8C2.2 4.7 2.2 4.6 2.3 4.5L3.2 2.7C3.3 2.6 3.4 2.5 3.6 2.5L6.2 3.2C6.8 3.4 7.4 3.3 8 3L9.7 2C9.8 1.9 10 1.9 10.1 1.9H12C12.1 1.9 12.3 1.9 12.4 2L14.1 3C14.7 3.3 15.3 3.4 15.9 3.2L18.5 2.5C18.6 2.5 18.8 2.6 18.9 2.7L19.8 4.5C19.9 4.6 19.9 4.7 19.9 4.8L19.2 7.2C19 7.8 19.1 8.4 19.4 9L20.4 10.7C20.5 10.8 20.5 11 20.5 11.1V12.9C20.5 13 20.5 13.2 20.4 13.3L19.4 15Z" stroke="currentColor" strokeWidth="2" />
    </svg>
);

export const CopyIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

export const CheckIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const CloseIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const ChevronRightIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const ChevronLeftIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const PlusIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const ImportIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 3V15M12 15L7 10M12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 19H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const ExportIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 15V3M12 3L7 8M12 3L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 19H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const RefreshIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M4 12C4 7.58172 7.58172 4 12 4C15.0736 4 17.7554 5.80151 19 8.5M20 12C20 16.4183 16.4183 20 12 20C8.92638 20 6.24462 18.1985 5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 4V8.5H14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 20V15.5H9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const KeyIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="8" cy="16" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M11 13L20 4M17 4H20V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 9L14 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const LockIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke="currentColor" strokeWidth="2" />
    </svg>
);

// Animated Lock Icon - Professional padlock with open/closed state animation
export const AnimatedLockIcon = ({ size = 48, isLocked = false, className = '' }) => {
    const lockColor = isLocked ? 'var(--success, #2ecc71)' : 'var(--accent-primary, #00d4ff)';

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            className={className}

        >
            {/* Lock Body - Rounded rectangle */}
            <rect
                x="14"
                y="30"
                width="36"
                height="26"
                rx="4"
                stroke={lockColor}
                strokeWidth="3"
                fill="none"
                style={{ transition: 'stroke 0.3s ease' }}
            />

            {/* Keyhole - Circle with stem */}
            <circle
                cx="32"
                cy="41"
                r="3.5"
                fill={lockColor}
                style={{ transition: 'fill 0.3s ease' }}
            />
            <path
                d="M32 44V50"
                stroke={lockColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ transition: 'stroke 0.3s ease' }}
            />

            {/* Shackle - U-shape that slides up when unlocked */}
            <path
                d={isLocked
                    ? "M22 30V20C22 14.4772 26.4772 10 32 10C37.5228 10 42 14.4772 42 20V30"
                    : "M22 30V20C22 14.4772 26.4772 10 32 10C37.5228 10 42 14.4772 42 20V18"
                }
                stroke={lockColor}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                style={{
                    transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: isLocked ? 'translateY(0)' : 'translateY(-8px)',
                }}
            />

            {/* Success checkmark overlay when locked */}
            {isLocked && (
                <g style={{
                    animation: 'checkFadeIn 0.3s ease-out 0.2s both'
                }}>
                    <circle
                        cx="48"
                        cy="14"
                        r="8"
                        fill="var(--success, #2ecc71)"
                    />
                    <path
                        d="M44 14L46.5 17L52 11"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </g>
            )}
        </svg>
    );
};

export const EyeIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
);

export const EyeOffIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.5 10.677C9.83 11.347 9.83 12.653 10.5 13.323C11.17 13.993 12.83 13.993 13.5 13.323" stroke="currentColor" strokeWidth="2" />
        <path d="M7.362 7.561C5.682 8.741 4.279 10.421 3 12C4.889 14.889 8 17 12 17C13.545 17 14.966 16.622 16.238 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 5C16 5 19.111 7.111 21 10C20.485 10.857 19.882 11.627 19.2 12.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const ArrowUpRightIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const ArrowDownLeftIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M17 7L7 17M7 17H17M7 17V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const QrCodeIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
        <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="14" width="3" height="3" fill="currentColor" />
        <rect x="18" y="18" width="3" height="3" fill="currentColor" />
        <rect x="14" y="18" width="3" height="3" fill="currentColor" />
        <rect x="18" y="14" width="3" height="3" fill="currentColor" />
    </svg>
);

export const LogoutIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const GlobeIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="2" />
        <path d="M3 12H21" stroke="currentColor" strokeWidth="2" />
    </svg>
);

// Generic Token/Coin icon
export const GenericTokenIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 6V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M15 8.5C15 8.5 14.5 7 12 7C9.5 7 8.5 8.5 8.5 9.5C8.5 12 15.5 11 15.5 14C15.5 15.5 14 17 12 17C9.5 17 9 15.5 9 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Buy icon (for future use)  
export const BuyIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
        <path d="M7 14H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Swap icon
export const SwapIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M7 10L3 6L7 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 6H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 14L21 18L17 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Chevron down icon for dropdowns
export const ChevronDownIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Staking icon
export const StakingIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 16L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Edit/Pencil icon
export const EditIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 2.5C18.8978 2.10217 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10217 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10217 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Privacy icon (lock with shield)
export const PrivacyIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L4 6V12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12V6L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="2" />
        <path d="M12 12V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Shield icon (for shielding balance)
export const ShieldIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L4 6V11C4 16.5228 7.58172 21 12 22C16.4183 21 20 16.5228 20 11V6L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Unshield icon (eye with shield outline)
export const UnshieldIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L4 6V11C4 16.5228 7.58172 21 12 22C16.4183 21 20 16.5228 20 11V6L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" />
        <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
        <path d="M7 12C7 12 9 9 12 9C15 9 17 12 17 12C17 12 15 15 12 15C9 15 7 12 7 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Private transfer icon (locked send)
export const PrivateTransferIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="6" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 10V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 14V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="14" r="1" fill="currentColor" />
    </svg>
);

// Claim icon (download with check)
export const ClaimIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 3V14M12 14L7 9M12 14L17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 17V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Public balance icon (visible eye)
export const PublicIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
);


// Bridge icon
export const BridgeIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M4 19V15M4 15V9C4 7 5 5 8 5M4 15H20M20 19V15M20 15V9C20 7 19 5 16 5M8 5C10 5 11 6 12 7C13 6 14 5 16 5M8 5V9M16 5V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 19H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Earn/Staking icon alt
export const EarnIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 1V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Contract icon
export const ContractIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Gas/Fuel icon
export const GasIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M3 22V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 7H12.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

// Signature icon
export const SignatureIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M16 3H21V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 12L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 15C13.5 16.5 11.5 17 9.5 16.5C7.5 16 6 14.5 5.5 12.5C5 10.5 5.5 8.5 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 12C12 12 10 14 7 14C4 14 2 12 2 9C2 6 5 4 8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
// Alert/Warning icon
export const AlertIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Warning triangle icon
export const WarningIcon = ({ size = 16, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 2L2 20H22L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

// Info icon
export const InfoIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// Image/NFT icon
export const ImageIcon = ({ size = 24, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <path d="M21 15L16 10L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
