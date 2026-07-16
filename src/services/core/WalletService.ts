/**
 * LOGIC: Core aggregator for fetching blockchain balances and contract states.
 * Orchestrates calls to the Octra RPC client, OCS-01 token managers, and multi-chain fallbacks (EVM JSON-RPC, Sui RPC), while implementing request deduplication via the balance cache and handling new-wallet (Sender not found) scenarios.
 * EXPORTS:
 *   - WalletService (const class instance of WalletServiceImpl)
 * FUNCTIONS:
 *   - refreshBalances(wallets): Refreshes native balances for a collection of wallets, handling "Sender not found" RPC errors by caching a zero balance.
 *   - getBalance(address, forceRefresh): Fetches balance/nonce for a single address with optional cache bypass.
 *   - getSingleTokenBalance(walletAddressOrObject, token, rpcUrl): Queries dynamic token balances across EVM native, EVM ERC-20, and Sui chains, performing RPC failovers on EVM connections.
 *   - getTokens(address): Pulls list of custom OCS01 user token balances.
 *   - getPrivacyBalance(address, forceRefresh): Stubbed/disabled privacy loader for FHE balances.
 *   - refreshAllState(address, isUnlocked): Executes native balance, custom token, and privacy balance loaders in parallel.
 */

import { Wallet, Token } from "../../types";
import { balanceCache } from "../../utils/balanceCache";
import { getRpcClient } from "../network/RpcService";
import { ocs01Manager } from "../features/OCS01TokenService";
import { ethers } from "ethers";
import { getBalanceRpcList } from "../../utils/evmProvider";
import { getTransactionRpcList } from "../../config/rpcEndpoints";

/**
 * WalletService - Manages wallet data fetching and synchronization.
 *
 * Responsibilities:
 * - Fetching balances (RPC + Cache)
 * - Fetching tokens (OCS01)
 * - Fetching privacy data
 * - Managed deduplication of requests
 * - Error handling for "Sender not found" (New wallets)
 */
class WalletServiceImpl {
  private static _instance: WalletServiceImpl | null = null;

  constructor() {
    if (WalletServiceImpl._instance) {
      return WalletServiceImpl._instance;
    }
    WalletServiceImpl._instance = this;
  }

  /**
   * Refresh balances for multiple wallets
   * Uses balanceCache for deduplication and caching.
   */
  async refreshBalances(wallets: Wallet[]): Promise<Wallet[]> {
    if (wallets.length === 0) return wallets;
    const rpcClient = getRpcClient();

    try {
      const updatedWallets = await Promise.all(
        wallets.map(async (w) => {
          try {
            const data = await balanceCache.fetchWithDedup(
              w.address,
              async (addr: string) => await rpcClient.getBalance(addr),
            );

            return {
              ...w,
              lastKnownBalance: data.balance,
            };
          } catch (err: any) {
            if (err.message && err.message.includes("Sender not found")) {
              await balanceCache.set(w.address, {
                balance: 0,
                nonce: 0,
                lastKnownBalance: 0,
              });
              return { ...w, lastKnownBalance: 0 };
            }
            console.warn(
              `[WalletService] Failed to fetch balance for ${w.address}:`,
              err,
            );
            return w;
          }
        }),
      );

      return updatedWallets;
    } catch (error) {
      console.error("[WalletService] Global refresh failed:", error);
      return wallets; // Return original on total failure
    }
  }

  /**
   * Get balance for a single address
   * Prefer this over direct RPC usage in components.
   */
  async getBalance(address: string, forceRefresh = false): Promise<any> {
    const rpcClient = getRpcClient();

    if (forceRefresh) {
      balanceCache.clear(address);
    }

    try {
      const data = await balanceCache.fetchWithDedup(
        address,
        async (addr: string) => await rpcClient.getBalance(addr),
      );
      return data;
    } catch (err: any) {
      if (err.message && err.message.includes("Sender not found")) {
        return { balance: 0, nonce: 0 };
      }
      throw err;
    }
  }

  /**
   * Fetch balance for a single token using standard direct RPC calls
   * EVM: Utilizes standard eth_getBalance or eth_call (balanceOf) to avoid heavy API scans.
   */
  async getSingleTokenBalance(
    walletAddressOrObject: string | any,
    token: Token,
    rpcUrl?: string,
    opts?: {
      /**
       * Try private endpoints (Infura → dRPC → …) BEFORE public RPCs.
       * Used by latency-sensitive flows like Send; Home keeps public-first
       * to preserve private rate limits.
       */
      preferPrivate?: boolean;
    },
  ): Promise<number> {
    try {
      let walletAddress: string;
      if (typeof walletAddressOrObject === "string") {
        walletAddress = walletAddressOrObject;
      } else if (
        walletAddressOrObject &&
        typeof walletAddressOrObject === "object"
      ) {
        // Pick the address by VM flags, not hardcoded mainnet chainIds —
        // otherwise testnet/devnet and custom SVM/Sui tokens fell through to
        // the EVM address and the wrong chain entirely.
        if (token.isSolana) {
          walletAddress =
            walletAddressOrObject.solanaAddress ||
            walletAddressOrObject.address;
        } else if (token.isSui) {
          walletAddress =
            walletAddressOrObject.suiAddress || walletAddressOrObject.address;
        } else if (token.isBitcoin) {
          walletAddress =
            walletAddressOrObject.bitcoinAddress ||
            walletAddressOrObject.address;
        } else if (token.isNative || token.chainId === 9048201) {
          walletAddress = walletAddressOrObject.address;
        } else {
          walletAddress =
            walletAddressOrObject.evmAddress || walletAddressOrObject.address;
        }
      } else {
        walletAddress = "";
      }

      if (token.isSui && walletAddress) {
        const { suiRpc, SUI_TESTNET_RPCS, SUI_MAINNET_RPCS } = await import(
          "../network/SuiRpcService"
        );
        const { getUserNetworkByChainId } = await import(
          "../network/UserNetworkService"
        );
        // Route to the token's own cluster: custom Sui-VM → its RPC,
        // testnet sentinel → testnet fullnodes, else mainnet.
        const customRpc = token.chainId
          ? getUserNetworkByChainId(token.chainId)?.rpcUrls?.[0]
          : undefined;
        const urls = customRpc
          ? [customRpc]
          : token.chainId === 9270000000000002 || token.isTestnet
            ? SUI_TESTNET_RPCS
            : SUI_MAINNET_RPCS;
        const coinType =
          token.contractAddress === "sui" || !token.contractAddress
            ? "0x2::sui::SUI"
            : token.contractAddress;
        const rawBal = await suiRpc.getBalance(walletAddress, coinType, urls);
        if (coinType !== "0x2::sui::SUI") {
          const dec = token.decimals ?? 9;
          return parseFloat(rawBal) / Math.pow(10, dec);
        }
        return parseFloat(rawBal);
      }

      if (token.isSolana && walletAddress) {
        const { solanaRpc } = await import("../network/SolanaRpcService");
        if (token.contractAddress && token.contractAddress !== "solana") {
          const rawBal = await solanaRpc.getSplBalance(
            walletAddress,
            token.contractAddress,
          );
          return parseFloat(rawBal);
        }
        // Native SOL on the token's own cluster (mainnet/devnet/testnet).
        const cluster =
          token.chainId === 1151111081099720
            ? ("devnet" as const)
            : token.chainId === 1151111081099721
              ? ("testnet" as const)
              : ("mainnet" as const);
        const rawBal = await solanaRpc.getBalance(walletAddress, cluster);
        return parseFloat(rawBal);
      }

      const isEvmChain =
        token.isEVM === true ||
        (!token.isNative &&
          !token.isSolana &&
          !token.isSui &&
          !token.isBitcoin &&
          token.chainId !== 9048201);

      if (!isEvmChain) {
        return typeof token.balance === "string"
          ? parseFloat(token.balance)
          : token.balance || 0;
      }

      if (
        isEvmChain &&
        (!walletAddress ||
          !walletAddress.startsWith("0x") ||
          walletAddress.length !== 42)
      ) {
        return typeof token.balance === "string"
          ? parseFloat(token.balance)
          : token.balance || 0;
      }

      const rpcUrls = rpcUrl
        ? [rpcUrl]
        : token.chainId
          ? opts?.preferPrivate
            ? getTransactionRpcList(token.chainId)
            : getBalanceRpcList(token.chainId)
          : [];
      if (rpcUrls.length === 0) {
        const defaultRpc = getRpcClient().getActualRpcUrl();
        if (defaultRpc) rpcUrls.push(defaultRpc);
      }

      let lastErr: unknown;
      for (const url of rpcUrls) {
        try {
          const provider = new ethers.JsonRpcProvider(url);

          if (
            token.isNative ||
            !token.contractAddress ||
            token.contractAddress ===
              "0x0000000000000000000000000000000000000000"
          ) {
            const balanceWei = await provider.getBalance(walletAddress);
            return parseFloat(
              ethers.formatUnits(balanceWei, token.decimals ?? 18),
            );
          }

          const minAbi = ["function balanceOf(address) view returns (uint256)"];
          const contract = new ethers.Contract(
            token.contractAddress,
            minAbi,
            provider,
          );
          const balanceRaw = await contract.balanceOf(walletAddress);
          return parseFloat(
            ethers.formatUnits(balanceRaw, token.decimals ?? 18),
          );
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    } catch (err) {
      console.warn(
        `[WalletService] Single token balance query failed for ${token.symbol}:`,
        err,
      );
      return typeof token.balance === "string"
        ? parseFloat(token.balance)
        : token.balance || 0;
    }
  }

  /**
   * Get tokens (OCS01) for an address
   */
  async getTokens(address: string): Promise<Token[]> {
    try {
      const results = await ocs01Manager.getUserTokenBalances(address);

      return results.map((r: any) => {
        const dec = r.decimals ?? 6;
        const balanceFormatted = Number(r.balance) / Math.pow(10, dec);
        return {
          symbol:
            r.symbol ??
            (r.contractName
              ? r.contractName.substring(0, 4).toUpperCase()
              : "UNK"),
          name: r.contractName || r.name || "Unknown Token",
          balance: balanceFormatted.toString(),
          contractAddress: r.contractAddress,
          isNative: false,
          isOCS01: true,
          vm: "octra",
          decimals: dec,
          verified: r.verified,
          chainId: 9048201,
        };
      });
    } catch (error) {
      console.warn(
        `[WalletService] Failed to fetch tokens for ${address}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get privacy balance
   */
  async getPrivacyBalance(address: string, _forceRefresh = false) {
    try {
      return null;
    } catch (error) {
      console.warn(
        `[WalletService] Failed to fetch privacy for ${address}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Refresh ALL state for a specific wallet (Native, Tokens, Privacy)
   * This acts as the Single Source of Truth aggregator.
   */
  async refreshAllState(address: string, isUnlocked: boolean) {
    const [balanceData, tokens, privacyData] = await Promise.all([
      this.getBalance(address).catch(() => ({ balance: 0, nonce: 0 })),
      this.getTokens(address).catch(() => []),
      isUnlocked
        ? this.getPrivacyBalance(address).catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      balance: balanceData.balance,
      nonce: balanceData.nonce,
      tokens,
      privacy: privacyData,
    };
  }
}

export const WalletService = new WalletServiceImpl();
