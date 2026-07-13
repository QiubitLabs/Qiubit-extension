import { dappConnections } from "../store";
import {
  getWalletFromStorage,
  getWalletPublicInfo,
  getActiveNetwork,
  saveConnections,
  getChainIdForNetworkSetting,
  isEvmNetworkSetting,
  isNonEvmUserChain,
  networkIdForSetting,
  requireConnectedWallet,
  broadcastToTabs,
} from "../helpers";
import { requestApproval } from "./approval";
import type { DappResponse } from "../types";
import { keyringService } from "../../services/core/KeyringService";

export async function handleConnect(
  origin: string,
  title: string | undefined,
  favicon: string | undefined,
  _params: any,
): Promise<DappResponse> {
  // window.octra sends networkSetting:"octra"; window.ethereum (EVM dapps like
  // Uniswap) send none. A networkSetting-less connect is therefore an EVM dapp,
  // so if the wallet's active network isn't EVM (e.g. Octra), default to
  // Ethereum — otherwise the dapp receives an Octra address and a chain it
  // can't switch, and shows "switch network in your wallet" manually.
  let networkSetting = _params?.networkSetting as string | undefined;
  if (!networkSetting) {
    const active = await getActiveNetwork();
    networkSetting = isEvmNetworkSetting(active) ? active : "ethereum";
    // Custom Solana-VM / Sui-VM networks share the user_<id> setting form but
    // are NOT Ethereum chains — an EVM dApp connect must not bind to them.
    if (networkSetting.startsWith("user_")) {
      const cid = parseInt(networkSetting.slice(5), 10);
      if (await isNonEvmUserChain(cid)) networkSetting = "ethereum";
    }
  }
  const activeChainId = getChainIdForNetworkSetting(networkSetting);
  const activeNetworkId = networkIdForSetting(networkSetting);

  const existing = dappConnections.get(origin);
  if (existing?.connected) {
    if (!keyringService.isUnlocked()) {
      try {
        const { SessionService } =
          await import("../../services/core/SessionService");
        await SessionService.restoreSession();
      } catch (_) {}
    }
    if (keyringService.isUnlocked()) {
      const fresh = await getWalletFromStorage();
      if (fresh) {
        const evmAddr = fresh.evmAddress || null;
        const displayAddr =
          networkSetting === "octra" ? fresh.address : evmAddr || fresh.address;
        if (
          displayAddr !== (existing.evmAddress || existing.address) ||
          existing.chainId !== activeChainId ||
          existing.networkSetting !== networkSetting
        ) {
          existing.address = fresh.address;
          existing.evmAddress = evmAddr;
          existing.chainId = activeChainId;
          existing.networkId = activeNetworkId;
          existing.networkSetting = networkSetting;
          existing.authorizedAddresses = Array.from(
            new Set([
              ...(existing.authorizedAddresses ?? [existing.address]),
              fresh.address,
            ]),
          );
          dappConnections.set(origin, existing);
          await saveConnections();
        }
        return {
          result: {
            accounts: [displayAddr],
            selectedAddress: displayAddr,
            octraAddress: fresh.address,
            evmAddress: evmAddr,
            publicKey: fresh.publicKeyB64,
            networkId: activeNetworkId,
            chainId: activeChainId,
            networkSetting,
            permissions: ["sign", "balance"],
          },
        };
      }
    }
  }

  let wallet = await getWalletFromStorage();
  const isLocked = !wallet || !keyringService.isUnlocked();
  if (isLocked)
    console.warn("[Background] Wallet locked. Prompting unlock via popup...");

  let approvalResult: any;
  try {
    approvalResult = await requestApproval(
      origin,
      "connect",
      { title, favicon, networkSetting },
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected connection request",
      },
    };
  }

  const selectedOctraAddr = approvalResult?.selectedOctraAddress;
  const selectedEvmAddr = approvalResult?.selectedEvmAddress;

  if (selectedOctraAddr) {
    wallet = {
      address: selectedOctraAddr,
      evmAddress: selectedEvmAddr || null,
    };
  } else {
    wallet = await getWalletFromStorage();
    if (!wallet) wallet = await getWalletPublicInfo();
  }

  if (!wallet?.address) {
    return {
      error: {
        code: 4900,
        message:
          "Wallet session expired. Please unlock the extension and try again.",
      },
    };
  }

  const freshNetworkSetting = networkSetting;
  const isOctra = freshNetworkSetting === "octra";
  const isEvmChain = isEvmNetworkSetting(freshNetworkSetting);
  const evmAddr = wallet.evmAddress || null;
  const displayAddress = isOctra ? wallet.address : evmAddr || wallet.address;
  const freshChainId =
    !isOctra && isEvmChain
      ? getChainIdForNetworkSetting(freshNetworkSetting)
      : 1;
  const freshNetworkId = networkIdForSetting(freshNetworkSetting);

  const prior = dappConnections.get(origin);
  const connection = {
    origin,
    title: title || "",
    favicon: favicon || "",
    address: wallet.address,
    evmAddress: evmAddr,
    connected: true,
    connectedAt: Date.now(),
    networkId: freshNetworkId,
    chainId: freshChainId,
    networkSetting: freshNetworkSetting,
    authorizedAddresses: Array.from(
      new Set([...(prior?.authorizedAddresses ?? []), wallet.address]),
    ),
  };
  dappConnections.set(origin, connection);
  await saveConnections();
  // Scoped to this origin: connecting one dapp must not rewrite the
  // selected account on every other connected dapp.
  broadcastToTabs("accountsChanged", [displayAddress], origin);

  return {
    result: {
      accounts: [displayAddress],
      selectedAddress: displayAddress,
      octraAddress: wallet.address,
      evmAddress: evmAddr,
      publicKey: wallet.publicKeyB64,
      networkId: connection.networkId,
      chainId: connection.chainId,
      networkSetting: connection.networkSetting,
      permissions: ["sign", "balance"],
    },
  };
}

export async function handleDisconnect(origin: string): Promise<DappResponse> {
  dappConnections.delete(origin);
  await saveConnections();
  return { result: true };
}

export async function handleGetAccounts(origin: string): Promise<DappResponse> {
  const connection = dappConnections.get(origin);
  if (!connection?.connected) return { result: [] };
  const displayAddr = connection.evmAddress || connection.address;
  return { result: [displayAddr] };
}

export async function handleGetPublicKey(
  origin: string,
): Promise<DappResponse> {
  const guard = await requireConnectedWallet(dappConnections.get(origin), {
    notConnectedMessage: "Not connected",
    lockedCode: -32603,
    lockedMessage: "Wallet locked. Please unlock the extension.",
  });
  if (guard.error) return { error: guard.error };
  return { result: guard.wallet.publicKeyB64 };
}
