/**
 * NotificationService — desktop notifications for transaction outcomes.
 *
 * Works from both the popup and the background worker. Silently no-ops when
 * the `notifications` permission or API is unavailable so callers never need
 * to guard. Opt-out is stored in settings (qiubit_notifications_enabled).
 */

const ENABLED_KEY = "qiubit_notifications_enabled";
const ICON_URL = "icons/icon-128.png";

async function isEnabled(): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return true;
    const data = await chrome.storage.local.get(ENABLED_KEY);
    return data[ENABLED_KEY] !== false; // default on
  } catch {
    return true;
  }
}

function iconFullUrl(): string {
  try {
    return chrome.runtime.getURL(ICON_URL);
  } catch {
    return ICON_URL;
  }
}

async function notify(title: string, message: string): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.notifications) return;
    if (!(await isEnabled())) return;
    chrome.notifications.create(`qiubit_${Date.now()}`, {
      type: "basic",
      iconUrl: iconFullUrl(),
      title,
      message,
      priority: 1,
    });
  } catch {
    /* notifications are best-effort */
  }
}

export const notificationService = {
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await chrome.storage?.local?.set({ [ENABLED_KEY]: enabled });
    } catch {
      /* ignore */
    }
  },

  async getEnabled(): Promise<boolean> {
    return isEnabled();
  },

  async transactionConfirmed(
    symbol: string,
    amount: string | number,
  ): Promise<void> {
    await notify(
      "Transaction confirmed",
      `Your transfer of ${amount} ${symbol} was confirmed on-chain.`,
    );
  },

  async transactionFailed(symbol: string): Promise<void> {
    await notify(
      "Transaction failed",
      `Your ${symbol} transfer did not go through. Please try again.`,
    );
  },

  async balanceReceived(
    symbol: string,
    amount: string | number,
  ): Promise<void> {
    await notify("Funds received", `You received ${amount} ${symbol}.`);
  },
};
