/**
 * Token Icon Component
 * Displays token image from URL or fallback to placeholder
 */

import { useState, useEffect } from "react";
import {
  getCachedIcon,
  fetchAndCacheIcon,
  getCachedContractLogoUrl,
  setCachedContractLogoUrl,
} from "../../../utils/iconCache";
import {
  resolveNetwork,
  resolveNetworkByChainId,
} from "../../../services/network/NetworkResolver";

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  logoType: string;
}

const KNOWN_TOKENS: Record<string, TokenInfo> = {
  OCT: {
    name: "Octra",
    symbol: "OCT",
    decimals: 6,
    isNative: true,
    logoType: "native",
  },
};

const preloadQiubitLogo = (): void => {
  if (typeof window !== "undefined") {
    const img = new Image();
    img.src = "/octra-icon.svg";
  }
};

if (typeof window !== "undefined") {
  preloadQiubitLogo();
}

export interface TokenIconProps {
  symbol: string;
  logoUrl?: string;
  size?: number;
  color?: string;
  contractAddress?: string;
  chainId?: number;
  networkId?: string;
}

/**
 * TokenIcon - Displays token image with fallback
 * @param {string} symbol - Token symbol
 * @param {string} logoUrl - Optional URL to token logo
 * @param {number} size - Icon size in pixels
 * @param {string} color - Accent color for the icon
 */
export function TokenIcon({
  symbol,
  logoUrl,
  size = 40,
  color: _color = "#00D4FF",
  contractAddress,
  chainId,
  networkId,
}: TokenIconProps) {
  const [imageError, setImageError] = useState(false);

  const FALLBACK_LOGOS: Record<string, string> = {
    ETH: "/eth-icon.svg",
    BNB: "https://static.debank.com/image/chain/logo_url/bsc/bc73fa84b7fc5337905e527dadcbc854.png",
    POL: "https://static.debank.com/image/chain/logo_url/matic/52ca152c08831e4765506c9bd75767e8.png",
    USDT: "/usdt-icon.svg",
    USDC: "/usdc-icon.svg",
    DAI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
    WBTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
    LINK: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    UNI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
    PEPE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png",
    SHIB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png",
    MATIC:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0/logo.png",
    GRT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc944E90C64B2c07662A292be6244BDf05Cda44a7/logo.png",
    AAVE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png",
    MKR: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12ef6589cC3A579A2/logo.png",
    LDO: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBE2B3eB3e90C40d0068FD99169C53F6af2/logo.png",
    MON: "/chains/monad/logo.jpg",
    HYPE: "/chains/hyperliquid/logo.jpg",
    BTC: "/chains/bitcoin/btc.png",
    SUI: "/chains/sui/sui.png",
    SOL: "/chains/solana/sol.png",
    // Native gas tokens of the additional EVM L1s — resolve by symbol to the
    // chain logo so they always render (like ETH/MON above), even when no
    // logoUrl is passed. (Robinhood & MegaETH natives are ETH; Arc native is
    // USDC — both already covered above.)
    PROS: "/chains/pharos/logo.svg",
    G: "/chains/gravity/logo.svg",
    SOMI: "/chains/somnia/logo.svg",
    "0G": "/chains/zerog/logo.svg",
    XPL: "/chains/plasma/logo.svg",
    PUSD: "/usdc-icon.svg",
  };

  const upperSymbol = symbol.toUpperCase();
  let resolvedUrl = logoUrl || FALLBACK_LOGOS[upperSymbol] || "";

  // Dynamic overrides to force native gas assets and standard tokens to use high-quality local SVGs
  if (upperSymbol === "ETH") {
    resolvedUrl = "/eth-icon.svg";
  } else if (
    upperSymbol === "USDC" ||
    upperSymbol === "PUSD" ||
    upperSymbol === "PATHUSD" ||
    upperSymbol === "USD"
  ) {
    resolvedUrl = "/usdc-icon.svg";
  } else if (upperSymbol === "USDT" || upperSymbol === "USDT0") {
    resolvedUrl = "/usdt-icon.svg";
  }

  const [srcUrl, setSrcUrl] = useState<string>(() => {
    if (resolvedUrl) return getCachedIcon(resolvedUrl) ?? resolvedUrl;
    if (contractAddress && chainId) {
      const cachedLogoUrl = getCachedContractLogoUrl(contractAddress, chainId);
      if (cachedLogoUrl) return getCachedIcon(cachedLogoUrl) ?? cachedLogoUrl;
    }
    return "";
  });
  const [isLoading, setIsLoading] = useState(
    !srcUrl.startsWith("data:") && !srcUrl.startsWith("/") && !!srcUrl,
  );

  useEffect(() => {
    if (!resolvedUrl) {
      setIsLoading(false);
      return;
    }
    if (resolvedUrl.startsWith("/")) {
      setSrcUrl(resolvedUrl);
      setIsLoading(false);
      return;
    }
    const cached = getCachedIcon(resolvedUrl);
    if (cached) {
      setSrcUrl(cached);
      setIsLoading(false);
      return;
    }
    fetchAndCacheIcon(resolvedUrl).then((base64) => {
      if (base64) {
        setSrcUrl(base64);
        setIsLoading(false);
      }
    });
  }, [resolvedUrl]);

  useEffect(() => {
    const hasNoLogo = (!resolvedUrl && !srcUrl) || imageError;
    const hasAddress =
      contractAddress &&
      contractAddress !== "0x0000000000000000000000000000000000000000";
    if (!hasNoLogo || !hasAddress) return;

    if (srcUrl && !imageError) return;

    let isMounted = true;
    setIsLoading(true);

    const saveLogoUrl = (logoUri: string) => {
      if (contractAddress && chainId) {
        setCachedContractLogoUrl(contractAddress, chainId, logoUri);
      }
      fetchAndCacheIcon(logoUri);
    };

    const fetchDynamicLogo = async () => {
      if (chainId) {
        try {
          const resp = await fetch(
            `https://li.quest/v1/token?chain=${chainId}&token=${contractAddress}`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (resp.ok) {
            const data = await resp.json();
            const logoUri = (data?.logoURI as string) || "";
            if (logoUri && isMounted) {
              setSrcUrl(logoUri);
              setImageError(false);
              setIsLoading(false);
              saveLogoUrl(logoUri);
              return;
            }
          }
        } catch {
          /* fall through */
        }
      }

      try {
        const resp = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
        );
        if (!resp.ok) {
          if (isMounted) setIsLoading(false);
          return;
        }
        const data = await resp.json();
        const imageUrl = (data.pairs?.[0]?.info?.imageUrl as string) || "";
        if (imageUrl && isMounted) {
          setSrcUrl(imageUrl);
          setImageError(false);
          setIsLoading(false);
          saveLogoUrl(imageUrl);
        } else if (isMounted) {
          setIsLoading(false);
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDynamicLogo();
    return () => {
      isMounted = false;
    };
  }, [resolvedUrl, imageError, contractAddress, chainId]);

  const isOctFamily =
    symbol === "OCT" || symbol === "wOCT" || symbol === "WOCT";

  const renderMainIcon = () => {
    if (isOctFamily) {
      return (
        <div
          className="token-icon token-icon-native"
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            overflow: "hidden",
            background: "transparent",
          }}
        >
          <img
            src="/octra-icon.svg"
            alt={symbol}
            width={size}
            height={size}
            loading="eager"
            style={{ display: "block", opacity: 1, imageRendering: "auto" }}
          />
        </div>
      );
    }

    const hasLogo = !!srcUrl;
    const shouldShowImage = hasLogo && !imageError;

    if (shouldShowImage) {
      const isLocal = srcUrl.startsWith("/") || srcUrl.startsWith("data:");
      return (
        <div
          className="token-icon"
          style={{
            width: size,
            height: size,
            background:
              isLoading && !isLocal ? "var(--bg-elevated)" : "transparent",
            position: "relative",
            overflow: "hidden",
            borderRadius: "50%",
          }}
        >
          <img
            src={srcUrl}
            alt={symbol}
            width={size}
            height={size}
            onError={() => {
              const fallback = FALLBACK_LOGOS[upperSymbol];
              if (fallback && srcUrl !== fallback) {
                setSrcUrl(fallback);
                fetchAndCacheIcon(fallback).then((b) => {
                  if (b) setSrcUrl(b);
                });
              } else {
                setImageError(true);
              }
              setIsLoading(false);
            }}
            onLoad={() => setIsLoading(false)}
            style={{
              borderRadius: "50%",
              opacity: isLoading && !isLocal ? 0 : 1,
              transition: isLocal ? "none" : "opacity 0.2s",
              display: "block",
            }}
          />
          {isLoading && !isLocal && (
            <div
              className="skeleton"
              style={{ position: "absolute", inset: 0, borderRadius: "50%" }}
            />
          )}
        </div>
      );
    }

    const firstLetter = symbol ? symbol.slice(0, 1).toUpperCase() : "?";
    return (
      <div
        className="token-icon token-icon-unknown"
        style={{
          width: size,
          height: size,
          background: "var(--bg-elevated)",
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: size * 0.4, fontWeight: 700 }}>
          {firstLetter}
        </span>
      </div>
    );
  };

  const netConfig = networkId
    ? resolveNetwork(networkId)
    : chainId
      ? resolveNetworkByChainId(chainId)
      : null;

  const showNetworkBadge = !!(netConfig && netConfig.id !== "octra");

  return (
    <div
      className="token-icon-wrapper"
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-block",
        overflow: "visible",
        flexShrink: 0,
      }}
    >
      {renderMainIcon()}
      {showNetworkBadge && netConfig && (
        <div
          className="token-network-badge-overlay"
          title={`${netConfig.displayName}${netConfig.isTestnet ? " (testnet)" : ""}`}
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: Math.max(12, size * 0.45),
            height: Math.max(12, size * 0.45),
            borderRadius: "50%",
            border: "1.5px solid var(--bg-card, #131820)",
            background: "#0d0d12",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            zIndex: 3,
          }}
        >
          <img
            src={netConfig.iconUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      )}
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
export function formatTokenAmount(
  amount: string | number,
  _decimals: number = 6,
  displayDecimals: number = 4,
): string {
  if (!amount) return "0";

  const num = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(num)) return "0";

  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

export default TokenIcon;
