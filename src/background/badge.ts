import { dappApprovals } from "./store";

/**
 * Reflect the number of pending dApp approval requests (connect / sign /
 * transaction) on the extension toolbar icon — like modern wallets (OKX,
 * Rabby). Users see at a glance how many requests still need to be signed or
 * cancelled. Cleared automatically when the queue empties.
 */
export function syncApprovalBadge(): void {
  try {
    if (typeof chrome === "undefined" || !chrome.action?.setBadgeText) return;
    const count = dappApprovals.size;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor?.({ color: "#FF5252" });
      chrome.action.setBadgeTextColor?.({ color: "#FFFFFF" });
    }
  } catch {
    /* badge is cosmetic — never let it break the approval flow */
  }
}
