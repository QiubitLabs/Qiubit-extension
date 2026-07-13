/**
 * Wallet Standard registration (Solana & Sui).
 * Mirrors @wallet-standard/wallet registerWallet(): dispatch register-wallet
 * (detail = a callback the app invokes with its { register } api) and answer
 * app-ready for dApps that load after us. We keep the callbacks so we can
 * re-dispatch register-wallet later — some dApps attach their listener after
 * our initial dispatch and never emit app-ready, so a single dispatch misses
 * them. Re-dispatching register-wallet only (never touching navigator.wallets)
 * is safe because registries dedupe by wallet identity.
 */

type RegisterCallback = (api: any) => void;

const _wsCallbacks: RegisterCallback[] = [];

export function registerWalletStandard(wallet: any): void {
  const callback: RegisterCallback = (api) => {
    try {
      (api && api.register ? api.register : api)(wallet);
    } catch (e) {
      console.warn("[Qiubit] Wallet Standard register failed:", e);
    }
  };
  _wsCallbacks.push(callback);
  announceWallet(callback);
  try {
    window.addEventListener("wallet-standard:app-ready", (event: any) => {
      callback(event.detail);
    });
  } catch {
    /* ignore */
  }
}

function announceWallet(callback: RegisterCallback): void {
  try {
    window.dispatchEvent(
      new CustomEvent("wallet-standard:register-wallet", { detail: callback }),
    );
  } catch {
    /* ignore */
  }
}

export function reannounceWallets(): void {
  for (const cb of _wsCallbacks) announceWallet(cb);
}
