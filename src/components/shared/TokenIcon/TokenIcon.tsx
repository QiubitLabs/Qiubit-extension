/**
 * Token Icon Component
 * Displays token image from URL or fallback to placeholder
 */

import { useState } from 'react';

interface TokenInfo {
    name: string;
    symbol: string;
    decimals: number;
    isNative: boolean;
    logoType: string;
}

// Token metadata cache - in production this would come from an API or explorer
const KNOWN_TOKENS: Record<string, TokenInfo> = {
    'OCT': {
        name: 'Octra',
        symbol: 'OCT',
        decimals: 6,
        isNative: true,
        // Native token uses built-in logo
        logoType: 'native'
    }
};

// Preload OCT logo immediately
const preloadQiubitLogo = (): void => {
    if (typeof window !== 'undefined') {
        const img = new Image();
        img.src = '/qiubit-icon.svg';
    }
};

// Preload on module load
if (typeof window !== 'undefined') {
    preloadQiubitLogo();
}

export interface TokenIconProps {
    symbol: string;
    logoUrl?: string;
    size?: number;
    color?: string;
}

/**
 * TokenIcon - Displays token image with fallback
 * @param {string} symbol - Token symbol
 * @param {string} logoUrl - Optional URL to token logo
 * @param {number} size - Icon size in pixels
 * @param {string} color - Accent color for the icon
 */
export function TokenIcon({ symbol, logoUrl, size = 40, color: _color = '#00D4FF' }: TokenIconProps) {
    const [imageError, setImageError] = useState(false);
    // Only use loading state for external URLs
    const [isLoading, setIsLoading] = useState(!!logoUrl && !logoUrl.startsWith('/'));

    // OCT and wOCT share the same Qiubit icon
    const isOctFamily = symbol === 'OCT' || symbol === 'wOCT' || symbol === 'WOCT';

    if (isOctFamily) {
        return (
            <div
                className="token-icon token-icon-native"
                style={{
                    width: size,
                    height: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'transparent'
                }}
            >
                <img
                    src="/qiubit-icon.svg"
                    alt={symbol}
                    width={size}
                    height={size}
                    loading="eager"
                    style={{ display: 'block', opacity: 1, imageRendering: 'auto' }}
                />
            </div>
        );
    }

    // If logo URL exists and no error, try to load image
    if (logoUrl && !imageError) {
        const isLocal = logoUrl.startsWith('/');
        return (
            <div
                className="token-icon"
                style={{
                    width: size,
                    height: size,
                    background: (isLoading && !isLocal) ? 'var(--bg-elevated)' : 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '50%'
                }}
            >
                <img
                    src={logoUrl}
                    alt={symbol}
                    width={size}
                    height={size}
                    onError={() => {
                        setImageError(true);
                        setIsLoading(false);
                    }}
                    onLoad={() => setIsLoading(false)}
                    style={{
                        borderRadius: '50%',
                        opacity: (isLoading && !isLocal) ? 0 : 1,
                        transition: isLocal ? 'none' : 'opacity 0.2s',
                        display: 'block'
                    }}
                />
                {isLoading && !isLocal && (
                    <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: '50%' }} />
                )}
            </div>
        );
    }

    // Fallback: Unknown token - show ? placeholder
    return (
        <div
            className="token-icon token-icon-unknown"
            style={{
                width: size,
                height: size,
                background: 'var(--bg-elevated)',
                color: 'var(--text-tertiary)'
            }}
        >
            <span style={{ fontSize: size * 0.4, fontWeight: 700 }}>?</span>
        </div>
    );
}

/**
 * Get token info from symbol
 * In production, this would fetch from an API/explorer
 */
export function getTokenInfo(symbol: string): TokenInfo | null {
    return KNOWN_TOKENS[symbol] || null;
}

/**
 * Format token amount based on decimals
 */
export function formatTokenAmount(amount: string | number, _decimals: number = 6, displayDecimals: number = 4): string {
    if (!amount) return '0';

    // Handle number 0 separately to avoid returning '0' for valid 0 amount if checked with !amount (Safe here as 0 is falsy but we check isNaN afterwards? No, !amount catches 0. So need explicit check)
    // Actually !amount catches 0. So `if (!amount && amount !== 0)`
    // But original code: `if (!amount || isNaN(amount)) return '0';`
    // If amount is 0, !amount is true, returns '0'. Correct.

    const num = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(num)) return '0';

    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';

    return num.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: displayDecimals
    });
}

export default TokenIcon;
