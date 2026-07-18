import { dappApprovals } from "../store";
import { getWalletFromStorage, getActiveNetwork } from "../helpers";
import { keyringService } from "../../services/core/KeyringService";
import { syncApprovalBadge } from "../badge";

// The single approval window shared across a burst of requests (OKX/Rabby
// style). New requests queue into dappApprovals and the one window steps
// through them, instead of stacking N popups.
let approvalWindowId: number | null = null;
// Set synchronously before chrome.windows.create so a second request arriving
// during the async create can't see "no window" and spawn a duplicate.
let approvalWindowOpening = false;
// The window id also lives in storage.session: the MV3 service worker can die
// while the window stays open, and after restart the in-memory id is gone —
// without this, the next request would open a second window next to the
// orphaned one (one popup unlocked, one stuck on its old state).
const APPROVAL_WINDOW_KEY = "qiubit_approval_window";

chrome.windows.onRemoved.addListener((removedId: number) => {
  if (removedId !== approvalWindowId) return;
  approvalWindowId = null;
  chrome.storage.session.remove(APPROVAL_WINDOW_KEY).catch(() => {});
  // Closing the window cancels everything still waiting.
  rejectAllPending({
    code: 4001,
    message: "User closed the approval window",
  });
});

/** Reject every still-pending request (used when the window is closed). */
function rejectAllPending(reason: { code: number; message: string }): void {
  for (const [id, pending] of Array.from(dappApprovals.entries())) {
    dappApprovals.delete(id);
    try {
      pending.reject(reason);
    } catch {
      /* ignore */
    }
  }
  syncApprovalBadge();
}

export async function requestApproval(
  origin: string,
  type: string,
  params: Record<string, any>,
  _wallet: any,
): Promise<any> {
  const approvalId = crypto.randomUUID();
  const networkSetting = params?.networkSetting || (await getActiveNetwork());

  return new Promise((resolve, reject) => {
    dappApprovals.set(approvalId, {
      type,
      origin,
      params: { ...params, networkSetting },
      timestamp: Date.now(),
      resolve,
      reject,
    });
    syncApprovalBadge();
    void routeApproval(approvalId);
  });
}

/** Focus the existing approval window (queueing into it) or open the one
 * shared window. Never opens a second window: creation is single-flight and
 * a window that survived a service-worker restart is recovered and reused. */
async function routeApproval(approvalId: string): Promise<void> {
  if (approvalWindowOpening) return; // creating — the new UI drains the queue

  if (approvalWindowId === null) {
    // Recover a window that outlived a service-worker restart.
    try {
      const data = await chrome.storage.session.get(APPROVAL_WINDOW_KEY);
      const storedId = data?.[APPROVAL_WINDOW_KEY];
      if (typeof storedId === "number") {
        const win = await chrome.windows.get(storedId).catch(() => null);
        if (win) approvalWindowId = storedId;
        else await chrome.storage.session.remove(APPROVAL_WINDOW_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  if (approvalWindowId !== null) {
    try {
      await chrome.windows.update(approvalWindowId, { focused: true });
      // Nudge the open UI to pick up the newly queued request if it's idle.
      chrome.runtime
        .sendMessage({ type: "APPROVAL_QUEUE_CHANGED" })
        .catch(() => {});
      return;
    } catch {
      approvalWindowId = null; // stale reference — fall through and reopen
    }
  }

  if (!approvalWindowOpening) openApprovalWindow(approvalId);
}

function openApprovalWindow(approvalId: string): void {
  approvalWindowOpening = true;
  chrome.windows.create(
    {
      url: "index.html#/dapp/approve?id=" + approvalId,
      type: "popup",
      width: 360,
      height: 600,
    },
    (win) => {
      approvalWindowOpening = false;
      if (!win?.id) return;
      approvalWindowId = win.id;
      chrome.storage.session
        .set({ [APPROVAL_WINDOW_KEY]: win.id })
        .catch(() => {});
    },
  );
}

export async function handleResolveApproval(
  data: any,
): Promise<{ success: boolean; error?: string }> {
  const { id, decision, result, selectedOctraAddress, selectedEvmAddress } =
    data;

  const approval = dappApprovals.get(id);
  if (!approval) return { success: false, error: "Request not found" };
  dappApprovals.delete(id);
  syncApprovalBadge();

  if (decision !== "approved") {
    approval.reject({ code: 4001, message: "User rejected request" });
    return { success: true };
  }

  try {
    const swSignedTypes = ["sendTransaction", "signTransaction", "signMessage"];
    const noKeyNeeded = !swSignedTypes.includes(approval.type);
    let signingWallet: any = {};

    if (!noKeyNeeded) {
      if (!keyringService.isUnlocked()) {
        try {
          const { SessionService } =
            await import("../../services/core/SessionService");
          await SessionService.restoreSession();
        } catch (_) {}
      }
      if (!keyringService.isUnlocked()) {
        throw new Error("Wallet is locked. Please unlock the extension.");
      }

      if (selectedOctraAddress) {
        signingWallet = {
          address: selectedOctraAddress,
          evmAddress:
            selectedEvmAddress ||
            keyringService.getEvmAddress(selectedOctraAddress) ||
            null,
          solanaAddress:
            keyringService.getSolanaAddress(selectedOctraAddress) || null,
          suiAddress:
            keyringService.getSuiAddress(selectedOctraAddress) || null,
          publicKeyB64:
            keyringService.getPublicKey(selectedOctraAddress) || null,
        };
      } else {
        const freshWallet = await getWalletFromStorage();
        if (!freshWallet)
          throw new Error("Wallet not found. Please unlock the extension.");
        signingWallet = freshWallet;
      }
    }

    const pk = signingWallet.address
      ? keyringService.getPrivateKey(signingWallet.address)
      : null;

    if (approval.type === "sendTransaction") {
      const signed = await signAndBroadcastTransaction(
        approval.params,
        signingWallet,
      );
      approval.resolve({ result: signed });
    } else if (approval.type === "signTransaction") {
      const signed = await signTransactionOnly(approval.params, signingWallet);
      approval.resolve({ result: signed });
    } else if (approval.type === "signMessage") {
      if (!pk) throw new Error("Private key not available for message signing");
      const { createSigningMessage } = await import("../../utils/octra/osm1");
      const { signMessage } = await import("../../utils/crypto/transaction");
      const signingMessage = createSigningMessage(approval.params.payload);
      const signature = signMessage(signingMessage, pk);
      approval.resolve({
        result: {
          signature,
          publicKey: signingWallet.publicKeyB64 || signingWallet.publicKey,
          address: signingWallet.address,
          payload: approval.params.payload,
        },
      });
    } else if (
      ["ethSendTransaction", "ethPersonalSign", "ethSignTypedData"].includes(
        approval.type,
      )
    ) {
      approval.resolve({ result });
    } else if (approval.type === "addNetwork") {
      approval.resolve({ result: null });
    } else {
      approval.resolve({
        result,
        selectedOctraAddress: selectedOctraAddress || null,
        selectedEvmAddress: selectedEvmAddress || null,
      });
    }
  } catch (err: any) {
    console.error("[Background] Resolve Error:", err);
    approval.reject({
      code: 5000,
      message: err.message || "Internal signing error",
    });
    return { success: false, error: err.message || "Internal signing error" };
  }

  return { success: true };
}

async function signTransactionOnly(params: any, wallet: any): Promise<any> {
  const from = wallet.address;
  const privateKey = keyringService.getPrivateKey(from);
  if (!privateKey)
    throw new Error("Private key not available — wallet may be locked.");
  const txParams = params.transaction || params;
  const { createTransaction } = await import("../../utils/crypto/transaction");
  const fee = txParams.fee || null;
  // createTransaction expects a human OCT amount and scales it by 1e6 itself.
  // If the dapp only supplied amountRaw (micro-units), convert it back to a
  // human decimal string first so it is not scaled twice.
  let amount: string | number;
  if (txParams.amount !== undefined && txParams.amount !== null) {
    amount = txParams.amount;
  } else if (txParams.amountRaw !== undefined && txParams.amountRaw !== null) {
    const raw = BigInt(String(txParams.amountRaw));
    const whole = raw / 1_000_000n;
    const frac = (raw % 1_000_000n).toString().padStart(6, "0");
    amount = `${whole}.${frac}`;
  } else {
    throw new Error("Transaction amount is required.");
  }
  return createTransaction(
    from,
    txParams.to || txParams.to_,
    amount,
    Number(txParams.nonce),
    privateKey,
    txParams.message || null,
    fee,
  );
}

async function signAndBroadcastTransaction(
  params: any,
  wallet: any,
): Promise<string> {
  const signedTransaction = await signTransactionOnly(params, wallet);
  const { getRpcClient } = await import("../../services/network/RpcService");
  const client = getRpcClient();
  const response = await client.sendTransaction(signedTransaction);
  if (response.success && response.txHash) return response.txHash;
  throw new Error("Transaction submission failed");
}
