import { getPrimaryRpc, RPC_ENDPOINTS } from "../../config/rpcEndpoints";
import { NETWORK_REGISTRY } from "../../constants/networks/registry";
import { dappConnections, activeSessionCache, setActiveSessionCache } from "../store";
import {
  getWalletFromStorage,
  saveConnections,
  saveUserNetworkToStorage,
  getUserNetworksFromStorage,
  chainIdToNetworkSetting,
  getConnectionChainId,
  parseChainId,
  broadcastToTabs,
  isValidRpcUrl,
} from "../helpers";
import { requestApproval } from "./approval";
import type { DappResponse } from "../types";

/**
 * Built-in EVM network from NETWORK_REGISTRY by decimal chainId. RPC_ENDPOINTS
 * and the registry are maintained separately, so a chain registered in only
 * one of them must still count as "known" to the dapp switch/add flow —
 * otherwise a 4902 makes every dapp SDK re-open its add-network dialog.
 */
function findBuiltinEvmNetwork(chainIdDecimal: number) {
  return (
    Object.values(NETWORK_REGISTRY).find(
      (n) => n.isEVM && n.chainId === chainIdDecimal,
    ) ?? null
  );
}

export async function handleEthSendTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = dappConnections.get(origin);
  if (!connection?.connected)
    return { error: { code: 4100, message: "Not connected" } };
  const txParams = Array.isArray(params) ? params[0] : params;
  if (!txParams)
    return { error: { code: 4200, message: "Missing transaction params" } };
  const wallet = await getWalletFromStorage();
  try {
    const txChainId =
      txParams.chainId != null ? parseChainId(txParams.chainId) : null;
    const activeChainId = txChainId || getConnectionChainId(origin);
    const networkSetting =
      chainIdToNetworkSetting(activeChainId) ||
      connection?.networkSetting ||
      "ethereum";
    return await requestApproval(
      origin,
      "ethSendTransaction",
      { txParams, chainId: activeChainId, networkSetting },
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected transaction",
      },
    };
  }
}

/**
 * eth_sign params arrive as [address, message] — the reverse of
 * personal_sign's [message, address] — so reorder before delegating.
 */
export async function handleEthSign(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const reordered = Array.isArray(params)
    ? [params[1], params[0], ...params.slice(2)]
    : params;
  return handlePersonalSign(origin, reordered);
}

export async function handlePersonalSign(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = dappConnections.get(origin);
  if (!connection?.connected)
    return { error: { code: 4100, message: "Not connected" } };
  const message = Array.isArray(params) ? params[0] : params.message;
  const from = Array.isArray(params) ? params[1] : params.from;
  const chainId = Array.isArray(params) ? undefined : params.chainId;
  const wallet = await getWalletFromStorage();
  try {
    const activeChainId = chainId || getConnectionChainId(origin);
    const networkSetting =
      chainIdToNetworkSetting(activeChainId) ||
      connection?.networkSetting ||
      "ethereum";
    return await requestApproval(
      origin,
      "ethPersonalSign",
      {
        message,
        from: from || connection.evmAddress || connection.address,
        chainId: activeChainId,
        networkSetting,
      },
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected sign request",
      },
    };
  }
}

export async function handleSignTypedData(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = dappConnections.get(origin);
  if (!connection?.connected)
    return { error: { code: 4100, message: "Not connected" } };
  const { from, typedData, chainId } = params;
  const wallet = await getWalletFromStorage();
  try {
    const activeChainId = chainId || getConnectionChainId(origin);
    const networkSetting =
      chainIdToNetworkSetting(activeChainId) ||
      connection?.networkSetting ||
      "ethereum";
    return await requestApproval(
      origin,
      "ethSignTypedData",
      {
        from: from || connection.address,
        typedData,
        chainId: activeChainId,
        networkSetting,
      },
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected sign request",
      },
    };
  }
}

export async function handleEvmRpcPassthrough(
  origin: string,
  method: string,
  params: any,
): Promise<DappResponse> {
  const chainId = getConnectionChainId(origin);
  let rpcUrl = getPrimaryRpc(chainId);
  // Registry-only chains (no RPC_ENDPOINTS entry) still carry their own RPC.
  if (!rpcUrl) rpcUrl = findBuiltinEvmNetwork(chainId)?.rpcUrl || "";
  if (!rpcUrl) {
    const userNets = await getUserNetworksFromStorage();
    const userNet = userNets.find(
      (n: any) =>
        n.chainIdDecimal === chainId && (!n.vm || n.vm === "evm"),
    );
    const candidateUrl = userNet?.rpcUrls?.[0];
    if (!candidateUrl) {
      return {
        error: {
          code: -32603,
          message: `No RPC endpoint configured for chain ${chainId}`,
        },
      };
    }
    if (!isValidRpcUrl(candidateUrl)) {
      return {
        error: {
          code: -32603,
          message: "Invalid or unsafe RPC URL for this network",
        },
      };
    }
    rpcUrl = candidateUrl;
  }
  try {
    const rpcParams = Array.isArray(params)
      ? params
      : params && typeof params === "object" && Object.keys(params).length > 0
        ? [params]
        : [];
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params: rpcParams,
        id: 1,
      }),
    });
    if (!res.ok)
      return { error: { code: -32603, message: "RPC request failed" } };
    const data = await res.json();
    return data.error ? { error: data.error } : { result: data.result };
  } catch (err: any) {
    return {
      error: { code: -32603, message: err.message || "Internal RPC error" },
    };
  }
}

export async function handleAddEthereumChain(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const networkParams = Array.isArray(params) ? params[0] : params;
  if (!networkParams?.chainId || !networkParams?.rpcUrls?.length) {
    return {
      error: {
        code: 4200,
        message: "Invalid addEthereumChain params: missing chainId or rpcUrls",
      },
    };
  }
  const chainIdDecimal = parseChainId(networkParams.chainId);
  if (!Number.isFinite(chainIdDecimal) || chainIdDecimal <= 0) {
    return {
      error: {
        code: 4200,
        message: "Invalid addEthereumChain params: malformed chainId",
      },
    };
  }
  const invalidUrl = (networkParams.rpcUrls as string[]).find(
    (url) => !isValidRpcUrl(url),
  );
  if (invalidUrl) {
    return {
      error: {
        code: 4200,
        message: "Invalid or unsafe RPC URL in addEthereumChain params",
      },
    };
  }
  // MetaMask semantics: wallet_addEthereumChain for a chain the wallet already
  // knows is an implicit switch. Returning a bare success here (the old
  // behavior) left eth_chainId on the previous network, so dapps that use
  // add-and-switch in one call kept re-prompting the user to "add" the chain.
  const isBuiltin =
    !!RPC_ENDPOINTS[chainIdDecimal] || !!findBuiltinEvmNetwork(chainIdDecimal);
  const existing = await getUserNetworksFromStorage();
  const known = existing.find((n: any) => n.chainIdDecimal === chainIdDecimal);
  if (isBuiltin || (known && (!known.vm || known.vm === "evm"))) {
    return handleSwitchEthereumChain(origin, [
      { chainId: networkParams.chainId },
    ]);
  }
  // Known but non-EVM (custom Solana-VM / Sui-VM entry): not an Ethereum chain.
  if (known) return { result: null };
  const wallet = await getWalletFromStorage();
  try {
    await requestApproval(origin, "addNetwork", { networkParams }, wallet);
    await saveUserNetworkToStorage(networkParams);
    // A freshly added chain becomes the active one for this origin, matching
    // the EIP-3085 add-then-switch behavior dapps expect.
    return handleSwitchEthereumChain(origin, [
      { chainId: networkParams.chainId },
    ]);
  } catch (err: any) {
    return {
      error: {
        code: 4001,
        message: err.message || "User rejected add network request",
      },
    };
  }
}

export async function handleSwitchEthereumChain(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const switchParams = Array.isArray(params) ? params[0] : params;
  if (!switchParams?.chainId) {
    return {
      error: {
        code: 4200,
        message: "Invalid switchEthereumChain params: missing chainId",
      },
    };
  }
  const chainIdDecimal = parseChainId(switchParams.chainId);
  let networkSetting: string | null = null;
  if (RPC_ENDPOINTS[chainIdDecimal] || findBuiltinEvmNetwork(chainIdDecimal)) {
    networkSetting = chainIdToNetworkSetting(chainIdDecimal);
  } else {
    const userNets = await getUserNetworksFromStorage();
    const found = userNets.find(
      (n: any) => n.chainIdDecimal === chainIdDecimal,
    );
    // Custom Solana-VM / Sui-VM networks are not switchable Ethereum chains.
    if (found && (!found.vm || found.vm === "evm"))
      networkSetting = `user_${chainIdDecimal}`;
  }
  if (!networkSetting) {
    return {
      error: {
        code: 4902,
        message: `Unrecognized chain ID ${switchParams.chainId}. Add the network first using wallet_addEthereumChain.`,
      },
    };
  }

  // Normalize the hex chainId so eth_chainId echoes exactly what the dapp sent.
  const chainHex = "0x" + chainIdDecimal.toString(16);

  // Update this origin's connection (create a light one if the dapp switched
  // before a full connect, so the new chain still sticks).
  const existing = dappConnections.get(origin);
  if (existing) {
    existing.chainId = chainIdDecimal;
    existing.networkId = networkSetting;
    existing.networkSetting = networkSetting;
    dappConnections.set(origin, existing);
  } else {
    dappConnections.set(origin, {
      origin,
      title: "",
      favicon: "",
      address: "",
      evmAddress: null,
      connected: false,
      connectedAt: Date.now(),
      networkId: networkSetting,
      chainId: chainIdDecimal,
      networkSetting,
    });
  }
  await saveConnections();

  // MetaMask model: the switch also becomes the wallet's active network so
  // eth_chainId reports it consistently and the dapp auto-continues instead of
  // asking the user to change it manually.
  setActiveSessionCache({
    ...(activeSessionCache || {}),
    network: networkSetting,
  });
  try {
    await chrome.storage.local.set({ dapp_active_network: networkSetting });
  } catch (_) {}

  await broadcastToTabs("chainChanged", chainHex, origin);
  return { result: null };
}

export async function handleGetChainId(origin: string): Promise<DappResponse> {
  const chainId = getConnectionChainId(origin);
  return { result: "0x" + chainId.toString(16) };
}
