import { getRpcClient } from "../services/network/RpcService";
import { backgroundSync } from "../services/features/BackgroundSyncService";
import {
  SessionService,
  AUTO_LOCK_ALARM,
} from "../services/core/SessionService";
import { keyringService } from "../services/core/KeyringService";

import {
  activeDappPorts,
  dappConnections,
  dappApprovals,
  setActiveSessionCache,
  setMemorySessionKey,
} from "./store";
import {
  getWalletFromStorage,
  readDappSession,
  loadConnections,
  saveConnections,
  loadSolanaConnections,
  loadSuiConnections,
  broadcastToTabs,
} from "./helpers";
import {
  handleConnect,
  handleDisconnect,
  handleGetAccounts,
  handleGetPublicKey,
} from "./handlers/connection";
import { handleResolveApproval } from "./handlers/approval";
import { syncApprovalBadge } from "./badge";
import {
  handleGetBalance,
  handleSignMessage,
  handleSignTransaction,
  handleSendTransaction,
  handleGetEncryptedBalance,
  handleContractCall,
  handleContractView,
  handleGetPendingTransactions,
} from "./handlers/octra";
import {
  handleEthSendTransaction,
  handlePersonalSign,
  handleEthSign,
  handleSignTypedData,
  handleEvmRpcPassthrough,
  handleAddEthereumChain,
  handleSwitchEthereumChain,
  handleGetChainId,
} from "./handlers/evm";
import {
  handleSolanaConnect,
  handleSolanaDisconnect,
  handleSolanaGetAccount,
  handleSolanaSignMessage,
  handleSolanaSignTransaction,
  handleSolanaSignAllTransactions,
  handleSolanaSendTransaction,
} from "./handlers/solana";
import {
  handleSuiConnect,
  handleSuiDisconnect,
  handleSuiGetAccounts,
  handleSuiSignMessage,
  handleSuiSignTransaction,
  handleSuiSignAndExecuteTransaction,
} from "./handlers/sui";
import { handleMultichainConnect } from "./handlers/multichain";
import { refreshWatchedPrices } from "../services/network/PriceService";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "octra-dapp-channel") return;
  activeDappPorts.add(port);
  port.onDisconnect.addListener(() => activeDappPorts.delete(port));
  port.onMessage.addListener((message) => {
    if (message.type !== "DAPP_REQUEST") return;
    handleDappRequest(message, port.sender)
      .then((response) => {
        if (activeDappPorts.has(port)) {
          port.postMessage({
            type: "OCTRA_RESPONSE",
            id: message.id,
            result: response.result,
            error: response.error,
          });
        }
      })
      .catch((error) => {
        if (activeDappPorts.has(port)) {
          port.postMessage({
            type: "OCTRA_RESPONSE",
            id: message.id,
            error: { code: 5000, message: error.message || "Internal error" },
          });
        }
      });
  });
});

chrome.alarms.create("bgBalanceSync", { periodInMinutes: 3 });
// Keep the shared price cache warm so the popup opens with prices already
// rendered (getMultipleTokenPrices skips the network when the cache is fresh).
chrome.alarms.create("bgPriceRefresh", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "bgPriceRefresh") {
    await refreshWatchedPrices().catch(() => {});
    return;
  }
  if (alarm.name === AUTO_LOCK_ALARM) {
    const locked = await SessionService.enforceAutoLock();
    if (locked) {
      setMemorySessionKey(null);
      setActiveSessionCache(null);
      chrome.runtime
        .sendMessage({ type: "SESSION_STATE_CHANGED" })
        .catch(() => {});
      broadcastToTabs("accountsChanged", []);
      broadcastToTabs("solana:accountChanged", null);
      broadcastToTabs("sui:accountChanged", null);
      broadcastToTabs("disconnect", { code: 4900, message: "Wallet locked" });
    }
    return;
  }
  if (alarm.name !== "bgBalanceSync") return;
  const wallet = await getWalletFromStorage();
  if (wallet?.address) {
    await backgroundSync.syncAll(wallet.address, wallet.network || "octra");
  }
});

(async () => {
  try {
    await readDappSession();
    await SessionService.loadAutoLockSetting();
  } catch (e) {
    console.warn("[Background] Session restore error:", e);
  }
})();

const connectionsReady = Promise.all([
  loadConnections(),
  loadSolanaConnections(),
  loadSuiConnections(),
]);

// The in-memory approval queue is empty on a fresh service-worker start, so
// clear any toolbar badge left over from a previous (crashed) session.
syncApprovalBadge();

const PRIVILEGED_MSG_TYPES = new Set([
  "KEYRING_ACTION",
  "SESSION_ACTION",
  "SYNC_SESSION",
  "POPUP_REQUEST",
  "GET_PENDING_APPROVALS",
  "RESOLVE_APPROVAL",
  "RESET_EVERYTHING",
]);

function isFromExtension(sender: chrome.runtime.MessageSender): boolean {
  if (
    sender.id !==
    (typeof chrome !== "undefined" && chrome.runtime
      ? chrome.runtime.id
      : undefined)
  ) {
    return false;
  }
  if (!sender.tab) return true;
  const extensionUrl =
    typeof chrome !== "undefined" && chrome.runtime
      ? chrome.runtime.getURL("")
      : "";
  return !!sender.url && sender.url.startsWith(extensionUrl);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DAPP_REQUEST") {
    handleDappRequest(message, sender).then(sendResponse);
    return true;
  }

  if (PRIVILEGED_MSG_TYPES.has(message.type) && !isFromExtension(sender)) {
    sendResponse({ error: "Unauthorized" });
    return false;
  }

  if (message.type === "KEYRING_ACTION") {
    handleKeyringAction(message.action, message.payload, sendResponse);
    return true;
  }

  if (message.type === "SESSION_ACTION") {
    handleSessionAction(message.action, message.payload, sendResponse);
    return true;
  }

  if (message.type === "SYNC_SESSION") {
    handleSyncSession(message.data || message).then((result) =>
      sendResponse(result),
    );
    return true;
  }

  if (message.type === "POPUP_REQUEST") {
    handlePopupRequest(message).then(sendResponse);
    return true;
  }

  if (message.type === "GET_PENDING_APPROVALS") {
    const requests = Array.from(dappApprovals.entries()).map(([id, req]) => ({
      id,
      type: req.type,
      origin: req.origin,
      params: req.params,
      timestamp: req.timestamp,
    }));
    sendResponse(requests);
    return false;
  }

  if (message.type === "RESOLVE_APPROVAL") {
    handleResolveApproval(message.data).then(sendResponse);
    return true;
  }

  if (message.type === "GET_FEE_ESTIMATE") {
    getRpcClient()
      .getFeeEstimate()
      .then((fees) => sendResponse(fees))
      .catch(() => sendResponse({ medium: 0.002 }));
    return true;
  }

  if (message.type === "RESET_EVERYTHING") {
    console.warn("!!! EMERGENCY RESET TRIGGERED !!!");
    (async () => {
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      setActiveSessionCache(null);
      setMemorySessionKey(null);
      dappConnections.clear();
      dappApprovals.clear();
      sendResponse({ success: true });
    })();
    return true;
  }

  return false;
});

async function handleDappRequest(message: any, _sender: any) {
  await connectionsReady;
  const { method, params, origin, title, favicon } = message;
  switch (method) {
    case "connect":
      return handleConnect(origin, title, favicon, params);
    case "disconnect":
      return handleDisconnect(origin);
    case "getAccounts":
      return handleGetAccounts(origin);
    case "getPublicKey":
      return handleGetPublicKey(origin);
    case "getBalance":
      return handleGetBalance(origin, params);
    case "signMessage":
      return handleSignMessage(origin, params);
    case "signTransaction":
      return handleSignTransaction(origin, params);
    case "sendTransaction":
      return handleSendTransaction(origin, params);
    case "getEncryptedBalance":
      return handleGetEncryptedBalance(origin);
    case "contractCall":
      return handleContractCall(origin, params);
    case "contractView":
      return handleContractView(params);
    case "getPendingTransactions":
      return handleGetPendingTransactions(origin);
    case "wallet_addEthereumChain":
      return handleAddEthereumChain(origin, params);
    case "wallet_switchEthereumChain":
      return handleSwitchEthereumChain(origin, params);
    case "eth_chainId":
      return handleGetChainId(origin);
    case "net_version":
      return handleGetChainId(origin).then((r) =>
        r.result ? { result: String(parseInt(r.result as string, 16)) } : r,
      );
    case "eth_sendTransaction":
      return handleEthSendTransaction(origin, params);
    case "personal_sign":
      return handlePersonalSign(origin, params);
    case "eth_sign":
      return handleEthSign(origin, params);
    case "eth_signTypedData_v4":
      return handleSignTypedData(origin, params);
    case "eth_accounts":
      return handleGetAccounts(origin);
    case "eth_requestAccounts":
      // MetaMask semantics: prompt for connection when not yet connected,
      // then return the accounts array.
      return handleConnect(origin, title, favicon, params).then((r) =>
        r.result ? { result: r.result.accounts } : r,
      );
    case "eth_gasPrice":
    case "eth_getTransactionCount":
    case "eth_estimateGas":
    case "eth_blockNumber":
    case "eth_getBalance":
    case "eth_call":
    case "eth_getBlockByNumber":
    case "eth_getBlockByHash":
    case "eth_getTransactionReceipt":
    case "eth_getTransactionByHash":
    case "eth_getCode":
    case "eth_getLogs":
    case "eth_maxPriorityFeePerGas":
      return handleEvmRpcPassthrough(origin, method, params);
    case "multichain_connect":
      return handleMultichainConnect(
        origin,
        title,
        favicon,
        params?.requestedChains,
      );
    case "solana_connect":
      return handleSolanaConnect(origin, title, favicon);
    case "solana_disconnect":
      return handleSolanaDisconnect(origin);
    case "solana_getAccount":
      return handleSolanaGetAccount(origin);
    case "solana_signMessage":
      return handleSolanaSignMessage(origin, params);
    case "solana_signTransaction":
      return handleSolanaSignTransaction(origin, params);
    case "solana_signAllTransactions":
      return handleSolanaSignAllTransactions(origin, params);
    case "solana_sendTransaction":
      return handleSolanaSendTransaction(origin, params);
    case "sui_connect":
      return handleSuiConnect(origin, title, favicon);
    case "sui_disconnect":
      return handleSuiDisconnect(origin);
    case "sui_getAccounts":
      return handleSuiGetAccounts(origin);
    case "sui_signMessage":
      return handleSuiSignMessage(origin, params);
    case "sui_signTransaction":
      return handleSuiSignTransaction(origin, params);
    case "sui_signAndExecuteTransaction":
      return handleSuiSignAndExecuteTransaction(origin, params);
    default:
      return { error: { code: 4200, message: `Unknown method: ${method}` } };
  }
}

async function handleKeyringAction(
  action: string,
  payload: any,
  sendResponse: (r: any) => void,
) {
  try {
    let result: any;
    switch (action) {
      case "GET_STATE":
        result = {
          isUnlocked: keyringService.isUnlocked(),
          addresses: Array.from(
            keyringService.getDecryptedKeysMap()?.keys() || [],
          ),
          activeAddress: keyringService.getActiveAddress(),
          evmAddresses: Object.fromEntries(
            keyringService.getEvmAddressesMap() || [],
          ),
          publicKeyB64s: Object.fromEntries(
            Array.from(
              keyringService.getDecryptedKeysMap()?.entries() || [],
            ).map(([addr, keyData]) => [addr, (keyData as any).publicKeyB64]),
          ),
        };
        break;
      case "initialize":
        await keyringService.initialize(payload.wallets, payload.password);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "unlock":
        await keyringService.unlock(payload.password, payload.wallets);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "lock":
        keyringService.lock();
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        broadcastToTabs("accountsChanged", []);
        broadcastToTabs("solana:accountChanged", null);
        broadcastToTabs("sui:accountChanged", null);
        broadcastToTabs("disconnect", { code: 4900, message: "Wallet locked" });
        break;
      case "addKey":
        keyringService.addKey(
          payload.address,
          payload.privateKeyB64,
          payload.publicKeyB64,
        );
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "signTransaction":
        result = await keyringService.signTransaction(
          payload.address,
          payload.txParams,
        );
        break;
      case "signAndSendEvm":
        result = await keyringService.signAndSendEvm(
          payload.walletAddress,
          payload.txRequest,
          payload.rpcUrl,
        );
        break;
      case "signEvmMessage":
        result = await keyringService.signEvmMessage(
          payload.walletAddress,
          payload.message,
        );
        break;
      case "signEvmTypedData":
        result = await keyringService.signEvmTypedData(
          payload.walletAddress,
          payload.typedData,
        );
        break;
      case "addEvmKey":
        keyringService.addEvmKey(payload.address, payload.privateKeyHex);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "signMessage":
        result = await keyringService.signMessage(
          payload.address,
          payload.message,
        );
        break;
      case "signContractCall":
        result = await keyringService.signContractCall(
          payload.address,
          payload.callParams,
        );
        break;
      case "setActiveWallet":
        await keyringService.setActiveWallet(payload.address);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        // Switching the active wallet no longer auto-propagates to connected
        // dApps. Professional wallets ask first: the popup detects connected
        // sites and, on user confirmation, calls the "migrateConnections"
        // popup action which re-points each origin and emits accountsChanged
        // scoped per origin. Declining leaves each dApp on its old account.
        break;
      case "removeKey":
        keyringService.removeKey(payload.address);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "KEYRING_STATE_CHANGED" })
          .catch(() => {});
        break;
      default:
        throw new Error(`Unknown keyring action: ${action}`);
    }
    sendResponse({ result });
  } catch (err: any) {
    console.error("[Background] Keyring action failed:", err);
    sendResponse({ error: err.message });
  }
}

async function syncSessionCacheFromStorage(): Promise<void> {
  await readDappSession();
}

async function handleSessionAction(
  action: string,
  payload: any,
  sendResponse: (r: any) => void,
) {
  try {
    let result: any;
    switch (action) {
      case "GET_STATE":
        result = {
          isValid: SessionService.isValid(),
          sessionKey: SessionService.getSessionKey(),
          autoLockDuration: SessionService.getAutoLockDuration(),
          decryptedWallets: SessionService.getDecryptedWallets(),
        };
        break;
      case "setAutoLockDuration":
        await SessionService.setAutoLockDuration(payload.key);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "SESSION_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "loadAutoLockSetting":
        await SessionService.loadAutoLockSetting();
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "SESSION_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "recordActivity":
        SessionService.recordActivity();
        result = { success: true };
        break;
      case "extendSession":
        SessionService.extendSession();
        result = { success: true };
        break;
      case "login":
        result = await SessionService.login(payload.password, payload.wallets);
        await syncSessionCacheFromStorage();
        chrome.runtime
          .sendMessage({ type: "SESSION_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "logout":
        await SessionService.logout();
        setMemorySessionKey(null);
        setActiveSessionCache(null);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "SESSION_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "restoreSession":
        result = await SessionService.restoreSession();
        await syncSessionCacheFromStorage();
        break;
      case "updateDecryptedWallets":
        await SessionService.updateDecryptedWallets(payload.wallets);
        result = { success: true };
        chrome.runtime
          .sendMessage({ type: "SESSION_STATE_CHANGED" })
          .catch(() => {});
        break;
      case "syncSessionToBackground":
        await SessionService.syncSessionToBackground();
        await syncSessionCacheFromStorage();
        result = { success: true };
        break;
      case "syncActiveWalletToBackground":
        await SessionService.syncActiveWalletToBackground(
          payload.address,
          payload.network,
        );
        await syncSessionCacheFromStorage();
        result = { success: true };
        break;
      default:
        throw new Error(`Unknown session action: ${action}`);
    }
    sendResponse({ result });
  } catch (err: any) {
    console.error("[Background] Session action failed:", err);
    sendResponse({ error: err.message });
  }
}

async function handleSyncSession(data: any) {
  if (data.sessionKey) {
    setMemorySessionKey(data.sessionKey);
    await readDappSession();
    return { success: true };
  }
  if (data.session) {
    setActiveSessionCache(data.session);
    return { success: true };
  }
  return { success: true };
}

async function handlePopupRequest(message: any) {
  const { action, data } = message;
  switch (action) {
    case "getPendingRequests":
      return {
        result: Array.from(dappApprovals.entries()).map(([id, req]) => {
          const { resolve, reject, ...safeReq } = req;
          return { id, ...safeReq };
        }),
      };
    case "getConnections":
      return {
        result: Array.from(dappConnections.entries()).map(([origin, info]) => {
          const { origin: _o, ...rest } = info as any;
          return { origin, ...rest };
        }),
      };
    case "disconnectOrigin":
      dappConnections.delete(data.origin);
      await saveConnections();
      return { result: true };
    case "migrateConnections": {
      // Re-point connected dApps to a newly selected wallet and notify them.
      // data.address = new active wallet's Octra address.
      // data.origins = optional subset; defaults to all connected origins.
      const octraAddr = data?.address as string | undefined;
      if (!octraAddr) return { error: "Missing target wallet address" };
      const targetOrigins: string[] = Array.isArray(data?.origins)
        ? data.origins
        : Array.from(dappConnections.keys());

      const newEvm = keyringService.getEvmAddress(octraAddr);
      const newSol = keyringService.getSolanaAddress(octraAddr);
      const newSui = keyringService.getSuiAddress(octraAddr);
      const migrated: string[] = [];

      for (const origin of targetOrigins) {
        const conn = dappConnections.get(origin);
        if (!conn?.connected) continue;

        // Grant the new wallet permission for this origin (EIP-2255 style) and
        // point the exposed account at it.
        conn.authorizedAddresses = Array.from(
          new Set([
            ...(conn.authorizedAddresses ?? [conn.address]),
            octraAddr,
          ]),
        );
        conn.address = octraAddr;
        conn.evmAddress = newEvm ?? null;
        dappConnections.set(origin, conn);

        const displayAddr =
          conn.networkSetting === "octra" ? octraAddr : newEvm || octraAddr;
        broadcastToTabs("accountsChanged", [displayAddr], origin);
        if (newSol) broadcastToTabs("solana:accountChanged", newSol, origin);
        if (newSui) broadcastToTabs("sui:accountChanged", newSui, origin);
        migrated.push(origin);
      }

      if (migrated.length) await saveConnections();
      return { result: { migrated } };
    }
    default:
      return { error: "Unknown action" };
  }
}
