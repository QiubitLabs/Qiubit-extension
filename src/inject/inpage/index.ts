/**
 * Qiubit Wallet — Inpage Provider (entry).
 * Injected into every webpage. Implements EIP-1193 + EIP-6963 + Solana Wallet
 * Standard + Sui Wallet Standard.
 *
 * Architecture: shared bridge + per-chain provider modules. Wallet Standard
 * registers one "Qiubit" wallet per chain (Solana, Sui); registries filter by
 * feature namespace so the same name never collides across chains.
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

  // ─── Wallet Standard: one wallet per chain ───────────────────────────────
  // Registries filter by feature namespace, so the Solana wallet only shows in
  // Solana dApps and the Sui wallet only in Sui dApps — same name, no clash —
  // and each connect approval is scoped to its own chain (label + address).
  registerWalletStandard({
    version: "1.0.0",
    name: "Qiubit",
    icon: QIUBIT_ICON,
    chains: ["solana:mainnet", "solana:devnet", "solana:testnet"],
    features: solana.features,
    get accounts() {
      return solana.getAccounts();
    },
  });

  registerWalletStandard({
    version: "1.0.0",
    name: "Qiubit",
    icon: QIUBIT_ICON,
    chains: ["sui:mainnet", "sui:testnet", "sui:devnet"],
    features: sui.features,
    get accounts() {
      return sui.getAccounts();
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
