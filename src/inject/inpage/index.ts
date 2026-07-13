/**
 * Qiubit Wallet — Inpage Provider (entry).
 * Injected into every webpage. Implements EIP-1193 + EIP-6963 + Solana Wallet
 * Standard + Sui Wallet Standard.
 *
 * Architecture: shared bridge + per-chain provider modules, composed here into
 * a single multichain "Qiubit" Wallet Standard wallet (Phantom/Backpack
 * pattern) — two same-named wallets would collide in registries that dedupe
 * by name (e.g. @mysten/dapp-kit), so one would shadow the other.
 */

import { createBridge } from "./bridge";
import { registerWalletStandard, reannounceWallets } from "./walletStandard";
import { initEvm } from "./evm";
import { initSolana } from "./solana";
import { initSui } from "./sui";
import { QIUBIT_ICON } from "./icon";

declare global {
  interface Window {
    __qiubitInjected?: boolean;
  }
}

(function () {
  "use strict";

  if (window.__qiubitInjected) return;
  window.__qiubitInjected = true;

  const bridge = createBridge();

  initEvm(bridge);
  const solana = initSolana(bridge);
  const sui = initSui(bridge);

  // ─── Single multichain wallet (Solana + Sui) ─────────────────────────────
  // One "Qiubit" that advertises both chains so it appears in Solana dApps
  // (Jupiter) and Sui dApps (Cetus/SuiVision) without name collision.
  const _mergedWsListeners: Array<(e: { accounts: any[] }) => void> = [];
  function fireMergedChange(): void {
    const accounts = [...solana.getAccounts(), ...sui.getAccounts()];
    for (const cb of _mergedWsListeners) {
      try {
        cb({ accounts });
      } catch {
        /* ignore */
      }
    }
  }

  // Unified connect: one approval grants both addresses (same underlying key).
  async function multichainConnect() {
    const res = await bridge.sendRequest("multichain_connect", {
      appInfo: { name: document.title, url: window.location.origin },
    });
    if (res?.solana) solana.applyExternalConnect(res.solana);
    if (res?.sui) sui.applyExternalConnect(res.sui, res.suiPublicKey);
    return { accounts: [...solana.getAccounts(), ...sui.getAccounts()] };
  }

  const _mergedFeatures: Record<string, any> = {
    "standard:connect": { version: "1.0.0", connect: multichainConnect },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect: async () => {
        await solana.solanaProvider.disconnect().catch(() => {});
        await sui.suiProvider.disconnect().catch(() => {});
      },
    },
    "standard:events": {
      version: "1.0.0",
      on: (event: string, listener: any) => {
        if (event !== "change") return () => {};
        _mergedWsListeners.push(listener);
        return () => {
          const i = _mergedWsListeners.indexOf(listener);
          if (i > -1) _mergedWsListeners.splice(i, 1);
        };
      },
    },
    // Solana signing features
    "solana:signMessage": solana.features["solana:signMessage"],
    "solana:signTransaction": solana.features["solana:signTransaction"],
    "solana:signAndSendTransaction":
      solana.features["solana:signAndSendTransaction"],
    "solana:signIn": solana.features["solana:signIn"],
    // Sui signing features (v2 + legacy *Block + report)
    "sui:signPersonalMessage": sui.features["sui:signPersonalMessage"],
    "sui:signTransaction": sui.features["sui:signTransaction"],
    "sui:signAndExecuteTransaction":
      sui.features["sui:signAndExecuteTransaction"],
    "sui:signTransactionBlock": sui.features["sui:signTransactionBlock"],
    "sui:signAndExecuteTransactionBlock":
      sui.features["sui:signAndExecuteTransactionBlock"],
    "sui:reportTransactionEffects":
      sui.features["sui:reportTransactionEffects"],
  };

  // Report account changes from either chain to standard:events listeners.
  solana.onAccountsChange(fireMergedChange);
  sui.onAccountsChange(fireMergedChange);

  registerWalletStandard({
    version: "1.0.0",
    name: "Qiubit",
    icon: QIUBIT_ICON,
    chains: [
      "solana:mainnet",
      "solana:devnet",
      "solana:testnet",
      "sui:mainnet",
      "sui:testnet",
      "sui:devnet",
    ],
    features: _mergedFeatures,
    get accounts() {
      return [...solana.getAccounts(), ...sui.getAccounts()];
    },
  });

  // ─── Init events ──────────────────────────────────────────────────────────

  window.dispatchEvent(new Event("octra#initialized"));
  window.dispatchEvent(new Event("ethereum#initialized"));
  window.dispatchEvent(new Event("solana#initialized"));
  window.dispatchEvent(new Event("sui#initialized"));

  // Re-announce so dApps that attach their wallet-standard listener after our
  // document_start dispatch (and never emit app-ready) still discover us.
  // Deduped by wallet identity in the registry, so repeats are harmless.
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", reannounceWallets, {
        once: true,
      });
    }
    window.addEventListener("load", reannounceWallets, { once: true });
    setTimeout(reannounceWallets, 500);
    setTimeout(reannounceWallets, 1500);
  } catch {
    /* ignore */
  }
})();
