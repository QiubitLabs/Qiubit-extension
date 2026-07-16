import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { CheckIcon } from "../../../shared/Icons";
import { FeedbackLottie } from "../../../shared/FeedbackLottie";
import { Wallet, Token } from "../../../../types";
import { getRpcClient } from "../../../../services/network/RpcService";
import { keyringService } from "../../../../services/core/KeyringService";
import { cleanErrorMessage } from "../../../../utils/errorMessages";
import { createTransaction } from "../../../../utils/crypto/transaction";
import {
  getEvmRpcUrl,
  getEvmRpcUrlForChain,
  fetchGasOptions,
  GasOptions,
  gweiToWei,
} from "../../../../utils/evmProvider";
import { getTokenPrice } from "../../../../services/network/PriceService";
import { BridgeConfirmModal } from "../BridgeConfirmModal";
import { sleep, parseUnitsOct, abiEncodeStringUint } from "../swapUtils";
import {
  BRIDGE_VAULT,
  WOCT_ADDR,
  ETH_BRIDGE,
  RECOVERY_URL,
  signerPost,
} from "../../../../utils/octra/bridge";
import "./OctraBridgeView.css";

export interface OctraBridgeViewProps {
  wallet: Wallet;
  address: string;
  balance: number;
  onRefresh: (
    mode?: "public" | "private" | "both",
    opts?: { force?: boolean },
  ) => void;
  tokens?: Token[];
  refreshTrigger?: number;
}

type BridgeStep = 0 | 1 | 2 | 3 | 4;

export function OctraBridgeView({
  wallet,
  address,
  balance,
  onRefresh,
  tokens,
  refreshTrigger,
}: OctraBridgeViewProps) {
  const [bridgeDir, setBridgeDir] = useState<"o2e" | "e2o">("o2e");
  const [fromAmount, setFromAmount] = useState("");
  const [bridgeStep, setBridgeStep] = useState<BridgeStep>(0);
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [bridgeError, setBridgeError] = useState("");
  const [lockTxHash, setLockTxHash] = useState("");
  const [completedInfo, setCompletedInfo] = useState<{
    amount: string;
    dir: "o2e" | "e2o";
    status: string;
  } | null>(null);

  const claimStorageKey = `bridge_pending_claim_${address}`;
  const epochStorageKey = `bridge_pending_epoch_${address}`;

  const [pendingClaim, setPendingClaimState] = useState<{
    calldata: string;
    epochId: number;
    amount?: string;
  } | null>(() => {
    try {
      const stored = localStorage.getItem(`bridge_pending_claim_${address}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [pendingEpoch, setPendingEpochState] = useState<{
    epochId: number;
    recipient: string;
    amount: string;
  } | null>(() => {
    try {
      const stored = localStorage.getItem(`bridge_pending_epoch_${address}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const epochPollingRef = useRef(false);

  const [ethRecipient, setEthRecipient] = useState(
    () => wallet.evmAddress || keyringService.getEvmAddress(address) || "",
  );
  const [octRecipient] = useState(address || "");

  useEffect(() => {
    const evmAddr =
      wallet.evmAddress || keyringService.getEvmAddress(address) || "";
    if (evmAddr) setEthRecipient(evmAddr);
  }, [wallet.evmAddress, address]);

  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [showBridgeConfirm, setShowBridgeConfirm] = useState(false);
  const [showClaimFeePopup, setShowClaimFeePopup] = useState(false);
  const [showOctFeePopup, setShowOctFeePopup] = useState(false);

  const [claimFeeSpeed, setClaimFeeSpeed] = useState<
    "slow" | "normal" | "fast" | "custom"
  >("normal");
  const [customClaimGasPriceGwei, setCustomClaimGasPriceGwei] = useState("10");
  const [claimGasOpts, setClaimGasOpts] = useState<GasOptions | null>(null);
  const [isFetchingClaimFee, setIsFetchingClaimFee] = useState(false);
  const [isClaimSubmitting, setIsClaimSubmitting] = useState(false);
  const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);
  const [ethBalanceWei, setEthBalanceWei] = useState<bigint | null>(null);

  const [octFeeSpeed, setOctFeeSpeed] = useState<
    "slow" | "normal" | "fast" | "custom"
  >("normal");
  const [customOctFee, setCustomOctFee] = useState("0.005");
  const [octFeeEstimate, setOctFeeEstimate] = useState({
    slow: 0.001,
    medium: 0.005,
    fast: 0.01,
  });

  const [unclaimedProofs, setUnclaimedProofs] = useState<any[]>([]);
  const [isFetchingUnclaimed, setIsFetchingUnclaimed] = useState(false);

  const selectedOctFee =
    octFeeSpeed === "slow"
      ? octFeeEstimate.slow
      : octFeeSpeed === "fast"
        ? octFeeEstimate.fast
        : octFeeSpeed === "custom"
          ? parseFloat(customOctFee) || 0.02
          : octFeeEstimate.medium;

  const [woctBalance, setWoctBalance] = useState<number>(0);

  useEffect(() => {
    const evmAddr = wallet.evmAddress || keyringService.getEvmAddress(address);
    if (!evmAddr) {
      setWoctBalance(0);
      return;
    }

    let isMounted = true;

    const tokenMatch = tokens?.find(
      (t) =>
        t.chainId === 1 &&
        t.contractAddress?.toLowerCase() === WOCT_ADDR.toLowerCase(),
    );
    if (tokenMatch) {
      const bal =
        typeof tokenMatch.balance === "string"
          ? parseFloat(tokenMatch.balance)
          : tokenMatch.balance || 0;
      setWoctBalance(bal);
    }

    const fetchDirect = async () => {
      try {
        const rpcUrl = getEvmRpcUrlForChain(1);
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const data =
          "0x70a08231" +
          evmAddr.replace("0x", "").toLowerCase().padStart(64, "0");
        const hexResult = await provider.call({ to: WOCT_ADDR, data });
        if (isMounted) {
          if (!hexResult || hexResult === "0x") {
            if (!tokenMatch) setWoctBalance(0);
          } else {
            const balanceBig = BigInt(hexResult);
            setWoctBalance(Number(balanceBig) / 1e6);
          }
        }
      } catch (err) {
        console.error("Failed to fetch wOCT balance directly:", err);
      }
    };

    fetchDirect();

    return () => {
      isMounted = false;
    };
  }, [wallet.evmAddress, address, tokens, refreshTrigger]);

  const fromBalance = bridgeDir === "o2e" ? balance || 0 : woctBalance;

  const setPendingClaim = (
    claim: { calldata: string; epochId: number; amount?: string } | null,
  ) => {
    setPendingClaimState(claim);
    if (claim) localStorage.setItem(claimStorageKey, JSON.stringify(claim));
    else localStorage.removeItem(claimStorageKey);
  };

  const setPendingEpoch = (
    epoch: { epochId: number; recipient: string; amount: string } | null,
  ) => {
    setPendingEpochState(epoch);
    if (epoch) localStorage.setItem(epochStorageKey, JSON.stringify(epoch));
    else localStorage.removeItem(epochStorageKey);
  };

  async function fetchUnclaimedProofs() {
    if (!ethRecipient) return;
    setIsFetchingUnclaimed(true);
    const target = ethRecipient.toLowerCase();
    const candidates: Array<{
      epochId: number;
      leafIndex: number;
      amount: string;
      calldata?: string;
    }> = [];

    try {
      const resp = await fetch(RECOVERY_URL, { cache: "no-store" });
      if (resp.ok) {
        const data = await resp.json();
        const by: Record<string, any[]> = data?.by_recipient ?? {};
        const matchedKey = Object.keys(by).find(
          (k) => k.toLowerCase() === target,
        );
        const bucket = matchedKey ? by[matchedKey] : [];
        if (Array.isArray(bucket)) {
          bucket.forEach((m) => {
            const epochId =
              typeof m.epoch === "number" ? m.epoch : parseInt(m.epoch, 10);
            const leafIndex =
              typeof m.leaf_index === "number"
                ? m.leaf_index
                : parseInt(m.leaf_index, 10);
            const amount = (
              Number(String(m.amount_raw || "0")) / 1e6
            ).toString();
            if (epochId && amount !== "0")
              candidates.push({ epochId, leafIndex, amount });
          });
        }
      }
    } catch (e) {
      console.warn("Failed to fetch from recovery.json:", e);
    }

    const claimKeys = [
      `bridge_pending_claim_${address}`,
      `bridge_pending_claim_${address?.toLowerCase()}`,
      "bridge_pending_claim",
    ].filter(Boolean);

    claimKeys.forEach((key) => {
      const str = localStorage.getItem(key);
      if (!str) return;
      try {
        const lc = JSON.parse(str);
        const epochId = lc.epochId || lc.claim?.epoch_id;
        const leafIndex = lc.leafIndex || lc.claim?.leaf_index || 0;
        const amount = lc.amount || lc.amt || "0";
        const calldata = lc.calldata || lc.claim?.calldata;
        if (epochId && !candidates.some((c) => c.epochId === epochId)) {
          candidates.push({ epochId, leafIndex, amount, calldata });
        }
      } catch (e) {
        console.warn(`Failed to parse pending claim for key ${key}`, e);
      }
    });

    const epochKeys = [
      `bridge_pending_epoch_${address}`,
      `bridge_pending_epoch_${address?.toLowerCase()}`,
      "bridge_pending_lock",
    ].filter(Boolean);

    epochKeys.forEach((key) => {
      const str = localStorage.getItem(key);
      if (!str) return;
      try {
        const le = JSON.parse(str);
        const epochId = le.epochId || le.epoch;
        const amount =
          le.amount ||
          le.amt_display ||
          (le.amount_raw ? (Number(le.amount_raw) / 1e6).toString() : "0");
        const leafIndex = le.leafIndex || le.leaf_index || 0;
        if (epochId && !candidates.some((c) => c.epochId === epochId)) {
          candidates.push({ epochId, leafIndex, amount });
        }
      } catch (e) {
        console.warn(`Failed to parse pending epoch for key ${key}`, e);
      }
    });

    const localHistoryStr = localStorage.getItem("bridge_history");
    if (localHistoryStr) {
      try {
        const historyArr = JSON.parse(localHistoryStr);
        if (Array.isArray(historyArr)) {
          historyArr.forEach((h) => {
            if (h && h.status !== "claimed" && h.status !== "unlocked") {
              const epochId =
                typeof h.epoch === "number" ? h.epoch : parseInt(h.epoch, 10);
              const rawAmt = h.amount_raw ? String(h.amount_raw) : "0";
              const amtDisplay =
                h.amt_display || (Number(rawAmt) / 1e6).toString();
              const leafIndex = h.leaf_index || 0;
              const calldata = h.claim_data?.calldata;
              if (epochId && !candidates.some((c) => c.epochId === epochId)) {
                candidates.push({
                  epochId,
                  leafIndex,
                  amount: amtDisplay,
                  calldata,
                });
              }
            }
          });
        }
      } catch (e) {
        console.warn("Failed to parse bridge_history from localStorage", e);
      }
    }

    if (candidates.length === 0) {
      setUnclaimedProofs([]);
      setIsFetchingUnclaimed(false);
      return;
    }

    try {
      const checkedProofs = await Promise.all(
        candidates.map(async (c) => {
          try {
            let calldata = c.calldata;
            let leafIndex = c.leafIndex;
            if (!calldata) {
              try {
                const msgData = await signerPost("bridgeMessagesByEpoch", [
                  c.epochId,
                ]);
                const messages = msgData.result?.messages || [];
                const myMsg = messages.find(
                  (m: any) => m.recipient?.toLowerCase() === target,
                );
                if (myMsg) {
                  leafIndex = myMsg.leaf_index;
                  const cdData = await signerPost("bridgeClaimCalldata", [
                    c.epochId,
                    leafIndex,
                  ]);
                  if (cdData.result?.calldata)
                    calldata = cdData.result.calldata;
                } else {
                  const cdData = await signerPost("bridgeClaimCalldata", [
                    c.epochId,
                    leafIndex || 0,
                  ]);
                  if (cdData.result?.calldata)
                    calldata = cdData.result.calldata;
                }
              } catch {
                try {
                  const cdData = await signerPost("bridgeClaimCalldata", [
                    c.epochId,
                    leafIndex || 0,
                  ]);
                  if (cdData.result?.calldata)
                    calldata = cdData.result.calldata;
                } catch {}
              }
            }

            if (!calldata) return null;

            try {
              const provider = new ethers.JsonRpcProvider(getEvmRpcUrl());
              await provider.call({
                to: ETH_BRIDGE,
                data: calldata!,
                from: ethRecipient,
              });
              return {
                calldata,
                epochId: c.epochId,
                amount: c.amount,
                leafIndex: leafIndex || c.leafIndex,
              };
            } catch (simErr: any) {
              const simMsg = (
                simErr?.message ||
                simErr?.data ||
                ""
              ).toLowerCase();
              if (
                simMsg.includes("already") ||
                simMsg.includes("replay") ||
                simErr?.data === "0xb5a78004"
              ) {
                return null;
              }
              return {
                calldata,
                epochId: c.epochId,
                amount: c.amount,
                leafIndex: leafIndex || c.leafIndex,
              };
            }
          } catch (err: any) {
            const msg = (err?.message || "").toLowerCase();
            if (
              msg.includes("already") ||
              msg.includes("replay") ||
              err?.data === "0xb5a78004"
            )
              return null;
            return null;
          }
        }),
      );

      const activeProofs = (
        checkedProofs.filter((p) => p !== null) as any[]
      ).sort((a, b) => b.epochId - a.epochId);

      setUnclaimedProofs(activeProofs);
      if (activeProofs.length > 0 && !pendingClaim)
        setPendingClaim(activeProofs[0]);
    } catch (e) {
      console.warn("Failed to resolve proofs:", e);
    } finally {
      setIsFetchingUnclaimed(false);
    }
  }

  useEffect(() => {
    if (ethRecipient) fetchUnclaimedProofs();
  }, [ethRecipient]);

  useEffect(() => {
    if (!pendingEpoch || pendingClaim || epochPollingRef.current) return;
    epochPollingRef.current = true;
    setBridgeDir("o2e");
    setBridgeStep(2);
    waitForClaimData(pendingEpoch.epochId, pendingEpoch.recipient).then(
      (claimData) => {
        epochPollingRef.current = false;
        if (claimData) {
          setPendingEpoch(null);
          setPendingClaim({ ...claimData, amount: pendingEpoch.amount });
          setBridgeStep(3);
          setBridgeStatus("Bridge ready! Claim your wOCT on Ethereum.");
        } else {
          setPendingEpoch(null);
          setBridgeError(
            `Bridge header for epoch #${pendingEpoch.epochId} not confirmed after 10 minutes. ` +
              "Your OCT is locked safely — try reopening the Bridge tab.",
          );
          setBridgeStep(0);
        }
      },
    );
  }, []);

  async function waitForOctraReceipt(
    txHash: string,
    maxSec = 60,
  ): Promise<any> {
    const rpc = getRpcClient();
    const start = Date.now();
    while (Date.now() - start < maxSec * 1000) {
      try {
        const tx = await rpc.getTransaction(txHash);
        if (tx && (tx.status === "confirmed" || tx.epoch)) return tx;
      } catch {
        /* not ready yet */
      }
      await sleep(2000);
    }
    throw new Error("Transaction not confirmed within 60s");
  }

  async function waitForClaimData(
    epochId: number,
    recipient: string,
  ): Promise<{ calldata: string; epochId: number } | null> {
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < 600000) {
      attempt++;
      setBridgeStatus(
        `Waiting for bridge header on Ethereum — epoch #${epochId} (attempt ${attempt})...`,
      );
      try {
        const headerData = await signerPost("bridgeHeader", [epochId]);
        if (headerData.result && headerData.result.message_count > 0) {
          const msgData = await signerPost("bridgeMessagesByEpoch", [epochId]);
          const messages = msgData.result?.messages || [];
          const myMsg = messages.find(
            (m: any) => m.recipient?.toLowerCase() === recipient.toLowerCase(),
          );
          if (!myMsg) {
            await sleep(6000);
            continue;
          }

          const cdData = await signerPost("bridgeClaimCalldata", [
            epochId,
            myMsg.leaf_index,
          ]);
          if (cdData.result?.calldata) {
            try {
              const provider = new ethers.JsonRpcProvider(getEvmRpcUrl());
              await provider.call({
                to: ETH_BRIDGE,
                data: cdData.result.calldata,
              });
              return { calldata: cdData.result.calldata, epochId };
            } catch (callErr: any) {
              const errMsg = (
                callErr?.message ||
                callErr?.data ||
                ""
              ).toLowerCase();
              if (
                errMsg.includes("0xb5a78004") ||
                errMsg.includes("already") ||
                errMsg.includes("replay")
              ) {
                return { calldata: cdData.result.calldata, epochId };
              }
              setBridgeStatus(
                `Relayer ready, waiting for Ethereum header confirmation — attempt ${attempt}...`,
              );
            }
          }
        }
      } catch (e: any) {
        setBridgeStatus(
          `Relayer unreachable (${e.message?.slice(0, 40)}), retry ${attempt}...`,
        );
      }
      await sleep(6000);
    }
    return null;
  }

  const lockOctToEth = async () => {
    const recip = ethRecipient.trim();
    if (!recip || !/^0x[0-9a-fA-F]{40}$/.test(recip)) {
      setBridgeError("Enter a valid Ethereum address");
      return;
    }
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setBridgeError("Enter amount");
      return;
    }

    setBridgeStep(1);
    setBridgeError("");
    setBridgeStatus("Locking OCT on Octra...");
    setLockTxHash("");

    try {
      const privateKeyB64 = wallet?.privateKeyB64;
      if (!privateKeyB64) throw new Error("Wallet locked");

      const rpc = getRpcClient();
      const nonce = await rpc.getNonceForSend(address);

      const signedTx = await createTransaction(
        address,
        BRIDGE_VAULT,
        fromAmount,
        nonce + 1,
        privateKeyB64,
        JSON.stringify([recip]),
        selectedOctFee.toFixed(4),
        "call",
        "lock_to_eth",
      );

      const result = await rpc.sendTransaction(signedTx);
      if (!result.success || !result.txHash)
        throw new Error("Lock transaction failed");

      const lockHash = result.txHash;
      setLockTxHash(lockHash);
      // Record the lock in the main transaction history (local-only mode
      // shows nothing that isn't recorded; the pending verifier confirms it).
      try {
        const { saveTxHistorySecure } = await import("../../../../utils/storage");
        void saveTxHistorySecure(
          [
            {
              hash: lockHash,
              type: "out",
              amount: parseFloat(fromAmount) || 0,
              symbol: "OCT",
              token: "OCT",
              address: recip,
              timestamp: Date.now(),
              status: "pending",
              networkId: "octra",
              description: "Bridge OCT to wOCT (lock)",
            } as any,
          ],
          "octra",
          address,
        );
      } catch {
        /* history is best-effort */
      }
      setBridgeStatus(
        `OCT locked! Tx: ${lockHash.slice(0, 14)}... — waiting for confirmation`,
      );
      setBridgeStep(2);

      const receipt = await waitForOctraReceipt(lockHash);
      let epochId: number = receipt?.epoch || 0;

      if (!epochId) {
        setBridgeStatus("Waiting for epoch finalization...");
        for (let i = 0; i < 20 && !epochId; i++) {
          await sleep(3000);
          try {
            const txInfo = await rpc.getTransaction(lockHash);
            epochId = txInfo?.epoch || 0;
          } catch {
            /* retry */
          }
        }
      }

      if (!epochId) {
        setBridgeError(
          `Lock tx sent (${lockHash.slice(0, 12)}...) but epoch not assigned yet. ` +
            "Check OctraScan, then reload this page to retry claiming.",
        );
        setBridgeStep(0);
        return;
      }

      setPendingEpoch({ epochId, recipient: recip, amount: fromAmount });
      setBridgeStatus(
        `Epoch #${epochId} confirmed. Waiting for bridge header on Ethereum...`,
      );

      const claimData = await waitForClaimData(epochId, recip);
      if (!claimData) {
        setBridgeError(
          `Bridge header for epoch #${epochId} not confirmed on Ethereum after 10 minutes. ` +
            "Your OCT is locked safely — reopen the Bridge tab to resume.",
        );
        setBridgeStep(0);
        return;
      }

      setPendingEpoch(null);
      setPendingClaim({ ...claimData, amount: fromAmount });
      setBridgeStep(3);
      setBridgeStatus("Bridge ready! Claim your wOCT on Ethereum.");
    } catch (e: any) {
      setBridgeError(cleanErrorMessage(e, "Bridge failed"));
      setBridgeStep(0);
      setBridgeStatus("");
    }
  };

  const openClaimConfirm = async (claimOverride?: any) => {
    const activeClaim = claimOverride || pendingClaim;
    if (!activeClaim) return;
    setClaimFeeSpeed("normal");
    setClaimGasOpts(null);
    setEthPriceUsd(null);
    setEthBalanceWei(null);
    setShowClaimConfirm(true);
    setIsFetchingClaimFee(true);
    try {
      const [opts, priceData, balWei] = await Promise.all([
        fetchGasOptions(
          {
            to: ETH_BRIDGE,
            data: activeClaim.calldata,
            from: wallet.evmAddress,
          },
          400_000n,
        ),
        getTokenPrice("ETH"),
        wallet.evmAddress
          ? new ethers.JsonRpcProvider(getEvmRpcUrl())
              .getBalance(wallet.evmAddress!)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      setClaimGasOpts(opts);
      setCustomClaimGasPriceGwei(
        (Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2),
      );
      setEthPriceUsd(priceData?.price ?? null);
      if (balWei !== null) setEthBalanceWei(BigInt(balWei.toString()));
    } catch {
      setClaimGasOpts(null);
    } finally {
      setIsFetchingClaimFee(false);
    }
  };

  const handleDirectClaim = (proof: any) => {
    setPendingClaim(proof);
    setBridgeStep(3);
    setBridgeDir("o2e");
    openClaimConfirm(proof);
  };

  const claimWoct = async () => {
    if (!pendingClaim) return;
    setIsFetchingClaimFee(true);
    setBridgeError("");

    try {
      const gasOpts0 =
        claimGasOpts ??
        (await fetchGasOptions(
          {
            to: ETH_BRIDGE,
            data: pendingClaim.calldata,
            from: wallet.evmAddress,
          },
          400_000n,
        ));
      const requiredWei =
        gasOpts0.gasLimit *
        gasOpts0[claimFeeSpeed === "custom" ? "normal" : claimFeeSpeed]
          .maxFeePerGas;
      const balanceWei =
        ethBalanceWei ??
        (wallet.evmAddress
          ? await new ethers.JsonRpcProvider(getEvmRpcUrl())
              .getBalance(wallet.evmAddress!)
              .then((b) => BigInt(b.toString()))
              .catch(() => null)
          : null);

      if (balanceWei !== null && balanceWei < requiredWei) {
        const reqEth = (Number(requiredWei) / 1e18).toFixed(6);
        const hasEth = (Number(balanceWei) / 1e18).toFixed(6);
        setBridgeError(
          `Insufficient ETH: you have ${hasEth} ETH but need at least ${reqEth} ETH for gas.`,
        );
        setIsFetchingClaimFee(false);
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(getEvmRpcUrl());
        await provider.call({ to: ETH_BRIDGE, data: pendingClaim.calldata });
      } catch (simErr: any) {
        const msg: string = simErr?.message || simErr?.data || "";
        const msgLower = msg.toLowerCase();
        const isAlreadyClaimed =
          msg.includes("0xb5a78004") ||
          msgLower.includes("already") ||
          msgLower.includes("replay");
        if (isAlreadyClaimed) {
          setShowClaimConfirm(false);
          setCompletedInfo({
            amount: pendingClaim.amount || fromAmount,
            dir: "o2e",
            status: "wOCT already claimed!",
          });
          setPendingClaim(null);
          fetchUnclaimedProofs();
          setBridgeStep(4);
          setBridgeStatus("wOCT already claimed on Ethereum!");
          onRefresh("public");
          return;
        }
        if (msgLower.includes("insufficient funds")) {
          if (balanceWei !== null && balanceWei < requiredWei) {
            const reqEth = (Number(requiredWei) / 1e18).toFixed(6);
            setBridgeError(
              `Insufficient ETH for gas fee. You need at least ${reqEth} ETH.`,
            );
            setIsFetchingClaimFee(false);
            return;
          }
        } else {
          setBridgeError("Claim simulation failed. Please retry in a moment.");
          setIsFetchingClaimFee(false);
          return;
        }
      }

      setShowClaimConfirm(false);
      setIsClaimSubmitting(true);
      setBridgeStep(3);
      setBridgeStatus("Submitting claim to Ethereum...");

      const gasOpts =
        claimGasOpts ??
        (await fetchGasOptions(
          {
            to: ETH_BRIDGE,
            data: pendingClaim.calldata,
            from: wallet.evmAddress,
          },
          400_000n,
        ));

      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (claimFeeSpeed === "custom") {
        const customWei = gweiToWei(customClaimGasPriceGwei);
        maxFeePerGas = customWei;
        maxPriorityFeePerGas =
          customWei > 1_000_000_000n ? 1_000_000_000n : customWei;
      } else {
        const tier = gasOpts[claimFeeSpeed];
        maxFeePerGas = tier.maxFeePerGas;
        maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
      }

      const tx = await keyringService.signAndSendEvm(
        address,
        {
          to: ETH_BRIDGE,
          data: pendingClaim.calldata,
          gasLimit: gasOpts.gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        },
        getEvmRpcUrl(),
      );

      setBridgeStatus(
        `Claim submitted (tx: ${tx.hash.slice(0, 12)}...). Waiting...`,
      );
      try {
        const { saveEvmTxHistory } = await import("../../../../utils/storage");
        const evmAddr =
          wallet.evmAddress || keyringService.getEvmAddress(address);
        if (evmAddr) {
          void saveEvmTxHistory("ethereum", evmAddr, [
            {
              hash: tx.hash,
              type: "in",
              amount: parseFloat(pendingClaim.amount || fromAmount) || 0,
              symbol: "WOCT",
              token: "WOCT",
              address: ETH_BRIDGE,
              timestamp: Date.now(),
              status: "pending",
              contractAddress: ETH_BRIDGE,
              networkId: "ethereum",
              description: "Bridge OCT to wOCT (claim)",
            } as any,
          ]).catch(() => {});
        }
      } catch {
        /* history is best-effort */
      }
      await tx.wait();

      setIsClaimSubmitting(false);
      setCompletedInfo({
        amount: pendingClaim.amount || fromAmount,
        dir: "o2e",
        status: "wOCT claimed successfully!",
      });
      setBridgeStep(4);
      setBridgeStatus("wOCT claimed successfully!");
      setPendingClaim(null);
      setPendingEpoch(null);
      fetchUnclaimedProofs();
      onRefresh("public");
    } catch (e: any) {
      setIsClaimSubmitting(false);
      setIsFetchingClaimFee(false);
      const msg = String(e?.message || e?.data || e || "");
      if (msg.toLowerCase().includes("insufficient funds")) {
        setBridgeError(
          "Insufficient ETH for gas fee. Please deposit some ETH to claim.",
        );
      } else {
        setBridgeError(msg.length > 100 ? msg.slice(0, 100) + "..." : msg);
      }
    }
  };

  const burnWoctToOct = async (
    overrideGasOpts?: any,
    overrideFeeSpeed?: string,
    overrideCustomGwei?: string,
  ) => {
    const recip = octRecipient.trim();
    if (!recip || recip.length !== 47 || !recip.startsWith("oct")) {
      setBridgeError("Octra address missing in wallet");
      return;
    }
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setBridgeError("Enter amount");
      return;
    }

    setShowBridgeConfirm(false);
    setBridgeStep(1);
    setBridgeError("");
    setBridgeStatus("Approving wOCT spend...");

    try {
      const rawAmt = parseUnitsOct(fromAmount);

      const selectedGasOpts =
        overrideGasOpts ||
        claimGasOpts ||
        (await fetchGasOptions(
          { to: ETH_BRIDGE, from: wallet.evmAddress },
          180_000n,
        ));
      const selectedFeeSpeed = overrideFeeSpeed || claimFeeSpeed;
      const selectedCustomGwei = overrideCustomGwei || customClaimGasPriceGwei;

      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (selectedFeeSpeed === "custom") {
        const customWei = gweiToWei(selectedCustomGwei);
        maxFeePerGas = customWei;
        maxPriorityFeePerGas =
          customWei > 1_000_000_000n ? 1_000_000_000n : customWei;
      } else {
        const tier = selectedGasOpts[selectedFeeSpeed];
        maxFeePerGas = tier.maxFeePerGas;
        maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
      }

      const approveData =
        "0x095ea7b3" +
        ETH_BRIDGE.substring(2).toLowerCase().padStart(64, "0") +
        BigInt(rawAmt).toString(16).padStart(64, "0");

      const approveTx = await keyringService.signAndSendEvm(
        address,
        {
          to: WOCT_ADDR,
          data: approveData,
          gasLimit: 0x30000n,
          maxFeePerGas,
          maxPriorityFeePerGas,
        },
        getEvmRpcUrl(),
      );
      await approveTx.wait();

      setBridgeStep(2);
      setBridgeStatus(
        `Burning wOCT to send to ${recip.slice(0, 10)}... on Octra...`,
      );

      const burnSig = "0xe3e3aed0";
      const encoded = await abiEncodeStringUint(recip, rawAmt);
      const burnData = burnSig + encoded;

      const burnTx = await keyringService.signAndSendEvm(
        address,
        {
          to: ETH_BRIDGE,
          data: burnData,
          gasLimit: 0x40000n,
          maxFeePerGas,
          maxPriorityFeePerGas,
        },
        getEvmRpcUrl(),
      );
      setBridgeStatus(
        `Burn submitted (tx: ${burnTx.hash.slice(0, 10)}...). Sending to ${recip.slice(0, 10)}... on Octra`,
      );
      try {
        const { saveEvmTxHistory } = await import("../../../../utils/storage");
        const evmAddr =
          wallet.evmAddress || keyringService.getEvmAddress(address);
        if (evmAddr) {
          void saveEvmTxHistory("ethereum", evmAddr, [
            {
              hash: burnTx.hash,
              type: "out",
              amount: parseFloat(fromAmount) || 0,
              symbol: "WOCT",
              token: "WOCT",
              address: recip,
              timestamp: Date.now(),
              status: "pending",
              contractAddress: ETH_BRIDGE,
              networkId: "ethereum",
              description: "Bridge wOCT to OCT (burn)",
            } as any,
          ]).catch(() => {});
        }
      } catch {
        /* history is best-effort */
      }
      await burnTx.wait();

      setBridgeStep(3);
      setBridgeStatus(
        "wOCT burned. OCT will be unlocked on Octra in ~2 min...",
      );

      const rpc = getRpcClient();
      const prevBalance = balance;
      let unlocked = false;
      for (let i = 0; i < 36; i++) {
        await sleep(5000);
        try {
          const data = await rpc.getBalance(address);
          if (data.balance > prevBalance) {
            unlocked = true;
            break;
          }
        } catch {
          /* retry */
        }
      }

      const burnStatus = unlocked
        ? "OCT unlocked successfully!"
        : "wOCT burned. OCT will arrive on Octra in ~2 min.";
      setCompletedInfo({ amount: fromAmount, dir: "e2o", status: burnStatus });
      setBridgeStep(4);
      setBridgeStatus(burnStatus);
      onRefresh("public");
    } catch (e: any) {
      const msg = String(e?.message || e?.data || e || "");
      if (msg.toLowerCase().includes("insufficient funds")) {
        setBridgeError(
          "Insufficient ETH for gas fee. Please deposit some ETH to bridge.",
        );
      } else {
        setBridgeError(msg.length > 100 ? msg.slice(0, 100) + "..." : msg);
      }
      setBridgeStep(0);
      setBridgeStatus("");
    }
  };

  const openBridgeConfirm = async () => {
    setClaimFeeSpeed("normal");
    setClaimGasOpts(null);
    setEthPriceUsd(null);
    setOctFeeSpeed("normal");
    setShowBridgeConfirm(true);

    if (bridgeDir === "o2e") {
      setIsFetchingClaimFee(true);
      try {
        const rpc = getRpcClient();
        const fees = await rpc.getFeeEstimate();
        setOctFeeEstimate({
          slow: fees.low,
          medium: fees.medium,
          fast: fees.high,
        });
        setCustomOctFee(fees.medium.toFixed(3));
      } finally {
        setIsFetchingClaimFee(false);
      }
    }

    if (bridgeDir === "e2o") {
      setIsFetchingClaimFee(true);
      try {
        const rawAmt = parseUnitsOct(fromAmount || "1");
        const burnSig = "0xe3e3aed0";
        const encoded = await abiEncodeStringUint(
          octRecipient || address,
          rawAmt,
        );
        const burnData = burnSig + encoded;

        const [opts, priceData] = await Promise.all([
          fetchGasOptions(
            { to: ETH_BRIDGE, from: wallet.evmAddress, data: burnData },
            180_000n,
          ),
          getTokenPrice("ETH"),
        ]);
        setClaimGasOpts(opts);
        setCustomClaimGasPriceGwei(
          (Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2),
        );
        setEthPriceUsd(priceData?.price ?? null);
      } catch {
        setClaimGasOpts(null);
      } finally {
        setIsFetchingClaimFee(false);
      }
    }
  };

  const resetBridge = () => {
    setBridgeStep(0);
    setBridgeStatus("");
    setBridgeError("");
    setPendingClaim(null);
    setPendingEpoch(null);
    setIsClaimSubmitting(false);
    setCompletedInfo(null);
    setFromAmount("");
    setLockTxHash("");
  };

  const fromSymbol = bridgeDir === "o2e" ? "OCT" : "wOCT";
  const toSymbol = bridgeDir === "o2e" ? "wOCT" : "OCT";

  return (
    <>
      {/* BridgeConfirmModal */}
      {((showClaimConfirm && pendingClaim) || showBridgeConfirm) && (
        <BridgeConfirmModal
          showClaimConfirm={showClaimConfirm}
          setShowClaimConfirm={setShowClaimConfirm}
          pendingClaim={pendingClaim}
          showBridgeConfirm={showBridgeConfirm}
          setShowBridgeConfirm={setShowBridgeConfirm}
          fromAmount={fromAmount}
          bridgeDir={bridgeDir}
          address={address}
          wallet={wallet}
          claimFeeSpeed={claimFeeSpeed}
          setClaimFeeSpeed={setClaimFeeSpeed}
          customClaimGasPriceGwei={customClaimGasPriceGwei}
          setCustomClaimGasPriceGwei={setCustomClaimGasPriceGwei}
          claimGasOpts={claimGasOpts}
          ethPriceUsd={ethPriceUsd}
          ethBalanceWei={ethBalanceWei}
          octFeeSpeed={octFeeSpeed}
          setOctFeeSpeed={setOctFeeSpeed}
          customOctFee={customOctFee}
          setCustomOctFee={setCustomOctFee}
          octFeeEstimate={octFeeEstimate}
          selectedOctFee={selectedOctFee}
          showClaimFeePopup={showClaimFeePopup}
          setShowClaimFeePopup={setShowClaimFeePopup}
          showOctFeePopup={showOctFeePopup}
          setShowOctFeePopup={setShowOctFeePopup}
          bridgeError={bridgeError}
          isFetchingClaimFee={isFetchingClaimFee}
          claimWoct={claimWoct}
          lockOctToEth={lockOctToEth}
          burnWoctToOct={burnWoctToOct}
        />
      )}

      {/* Bridge stepper overlay */}
      {bridgeStep > 0 && bridgeStep < 4 && (
        <div
          className="full-page-overlay animate-fade-in"
          style={{ padding: "16px", background: "#0D0D0D", zIndex: 1500 }}
        >
          <div className="complete-card animate-fade-in">
            <FeedbackLottie kind="pending" size={110} />
            <div className="complete-title">Bridging Assets</div>
            <div className="complete-subtitle-amount">
              {fromAmount} {fromSymbol} → {fromAmount} {toSymbol}
            </div>

            <div className="progress-steps-list">
              <div
                className={`progress-step-item ${bridgeStep >= 1 ? "completed" : ""}`}
              >
                <div className="step-icon-wrap">
                  {bridgeStep > 1 ? (
                    <CheckIcon size={14} />
                  ) : (
                    <div className="spinner-small" />
                  )}
                </div>
                <div className="step-text-label">
                  {bridgeDir === "o2e"
                    ? "Locking OCT on Octra"
                    : "Approving and Burning wOCT"}
                </div>
              </div>
              <div className="step-connector-line" />
              <div
                className={`progress-step-item ${bridgeStep >= 2 ? (bridgeStep > 2 ? "completed" : "active") : ""}`}
              >
                <div className="step-icon-wrap">
                  {bridgeStep > 2 ? (
                    <CheckIcon size={14} />
                  ) : bridgeStep === 2 ? (
                    <div className="spinner-small" />
                  ) : (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "currentColor",
                      }}
                    />
                  )}
                </div>
                <div className="step-text-label">
                  {bridgeDir === "o2e"
                    ? "Waiting for Bridge Header"
                    : "Decrypting and Unlocking OCT"}
                </div>
              </div>
              <div className="step-connector-line" />
              <div
                className={`progress-step-item ${bridgeStep === 3 ? "active" : ""}`}
              >
                <div className="step-icon-wrap">
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                </div>
                <div className="step-text-label">
                  {bridgeDir === "o2e" ? "Claim Ready on Ethereum" : "Complete"}
                </div>
              </div>
            </div>

            <div className="progress-notice-card">
              <div className="notice-text-content">
                {bridgeStatus}
                {lockTxHash && (
                  <div>
                    <a
                      href={`${import.meta.env.VITE_EXPLORER_URL}/tx.html?hash=${lockTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="explorer-link"
                    >
                      View Lock on OctraScan
                    </a>
                  </div>
                )}
              </div>
            </div>

            {bridgeStep === 3 && bridgeDir === "o2e" && pendingClaim && (
              <button
                className="claim-action-btn-compact"
                style={{ marginTop: "16px", maxWidth: "240px" }}
                disabled={isClaimSubmitting}
                onClick={() => openClaimConfirm()}
              >
                {isClaimSubmitting ? "Claiming..." : "Claim wOCT on Ethereum"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bridge success */}
      {bridgeStep === 4 && completedInfo && (
        <div
          className="full-page-overlay animate-fade-in"
          style={{ padding: "16px", background: "#0D0D0D", zIndex: 1500 }}
        >
          <div className="complete-card animate-fade-in">
            <div className="success-icon-wrap">
              <FeedbackLottie kind="swap" size={120} />
            </div>
            <div className="complete-title">Bridge Complete</div>
            <div className="success-amount-display">
              {completedInfo.amount}{" "}
              {completedInfo.dir === "o2e" ? "wOCT" : "OCT"}
            </div>
            <div className="success-route-container">
              <div className="success-chain-item">
                <img
                  src={
                    completedInfo.dir === "o2e"
                      ? "/octra-icon.svg"
                      : "/eth-icon.svg"
                  }
                  alt=""
                  style={{ width: 14, height: 14, borderRadius: "50%" }}
                />
                <span>
                  {completedInfo.dir === "o2e" ? "Octra" : "Ethereum"}
                </span>
              </div>
              <div className="success-arrow-label">to</div>
              <div className="success-chain-item">
                <img
                  src={
                    completedInfo.dir === "o2e"
                      ? "/eth-icon.svg"
                      : "/octra-icon.svg"
                  }
                  alt=""
                  style={{ width: 14, height: 14, borderRadius: "50%" }}
                />
                <span>
                  {completedInfo.dir === "o2e" ? "Ethereum" : "Octra"}
                </span>
              </div>
            </div>
            {completedInfo.dir === "e2o" &&
              !completedInfo.status.includes("successfully") && (
                <div
                  className="progress-notice-card"
                  style={{ marginBottom: "16px" }}
                >
                  <div className="notice-text-content">
                    {completedInfo.status}
                  </div>
                </div>
              )}
            <button className="done-action-btn" onClick={resetBridge}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bridge error */}
      {bridgeError && bridgeStep === 0 && (
        <div
          className="full-page-overlay animate-fade-in"
          style={{ padding: "16px", background: "#0D0D0D", zIndex: 1500 }}
        >
          <div className="complete-card animate-fade-in">
            <div className="success-icon-wrap">
              <FeedbackLottie kind="failed" size={120} />
            </div>
            <div
              className="complete-title"
              style={{ color: "var(--accent-red, #ef4444)" }}
            >
              Bridge Failed
            </div>
            <div
              className="progress-notice-card"
              style={{
                marginBottom: "16px",
                borderColor: "rgba(239, 68, 68, 0.2)",
                background: "rgba(239, 68, 68, 0.04)",
              }}
            >
              <div
                className="notice-text-content"
                style={{ color: "var(--accent-red, #f87171)" }}
              >
                {bridgeError}
              </div>
            </div>
            <button className="done-action-btn" onClick={resetBridge}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Main bridge form */}
      {bridgeStep === 0 && !completedInfo && !bridgeError && (
        <div className="octra-bridge-form animate-fade-in">
          <div className="swap-widget-card">
            {/* FROM section */}
            <div className="widget-section">
              <div className="section-header">
                <div className="section-label-group">
                  <span>Dari</span>
                  <img
                    src={
                      bridgeDir === "o2e" ? "/octra-icon.svg" : "/eth-icon.svg"
                    }
                    alt=""
                    className="inline-chain-icon"
                  />
                  <span className="chain-name-text">
                    {bridgeDir === "o2e" ? "Octra" : "Ethereum"}
                  </span>
                </div>
                <div
                  className="section-balance-group"
                  onClick={() => setFromAmount(String(fromBalance))}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="wallet-svg-icon"
                  >
                    <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span className="balance-num">{fromBalance.toFixed(6)}</span>
                  <span className="maks-button">Maks</span>
                </div>
              </div>
              <div className="token-input-row">
                <div
                  className="token-dropdown-trigger borderless-trigger"
                  style={{ cursor: "default" }}
                >
                  <img
                    src={
                      bridgeDir === "o2e"
                        ? "/octra-icon.svg"
                        : "/chains/ethereum/woct.svg"
                    }
                    alt={fromSymbol}
                    width={24}
                    height={24}
                    style={{ borderRadius: "50%", display: "block" }}
                  />
                  <span className="token-symbol-text">{fromSymbol}</span>
                </div>
                <div className="amount-input-container">
                  <input
                    type="number"
                    className="swap-input-large"
                    placeholder="0"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                  />
                  <div className="amount-fiat-val">$0.00</div>
                </div>
              </div>
            </div>

            {/* Direction toggle — same as SwapTab mid-swap-divider */}
            <div className="mid-swap-divider">
              <div className="divider-line" />
              <button
                className="swap-action-trigger"
                onClick={() => {
                  setBridgeDir((d) => (d === "o2e" ? "e2o" : "o2e"));
                  setFromAmount("");
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 20V4M7 4L3 8M7 4L11 8" />
                  <path d="M17 4v16M17 20l4-4M17 20l-4-4" />
                </svg>
              </button>
              <div className="divider-line" />
            </div>

            {/* TO section */}
            <div className="widget-section">
              <div className="section-header">
                <div className="section-label-group">
                  <span>Ke</span>
                  <img
                    src={
                      bridgeDir === "o2e" ? "/eth-icon.svg" : "/octra-icon.svg"
                    }
                    alt=""
                    className="inline-chain-icon"
                  />
                  <span className="chain-name-text">
                    {bridgeDir === "o2e" ? "Ethereum" : "Octra"}
                  </span>
                </div>
                <div className="section-balance-group">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="wallet-svg-icon"
                  >
                    <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span className="balance-num">
                    {(bridgeDir === "o2e" ? woctBalance : balance || 0).toFixed(
                      6,
                    )}
                  </span>
                </div>
              </div>
              <div className="token-input-row">
                <div
                  className="token-dropdown-trigger borderless-trigger"
                  style={{ cursor: "default" }}
                >
                  <img
                    src={
                      bridgeDir === "o2e"
                        ? "/chains/ethereum/woct.svg"
                        : "/octra-icon.svg"
                    }
                    alt={toSymbol}
                    width={24}
                    height={24}
                    style={{ borderRadius: "50%", display: "block" }}
                  />
                  <span className="token-symbol-text">{toSymbol}</span>
                </div>
                <div className="amount-input-container">
                  <input
                    type="number"
                    className="swap-input-large"
                    placeholder="0"
                    value={fromAmount}
                    readOnly
                  />
                  <div className="amount-fiat-val">
                    1 {fromSymbol} = 1 {toSymbol}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pending claim banner */}
          {pendingClaim && (
            <div className="bridge-claim-alert-banner animate-fade-in">
              <div className="claim-banner-top">
                <span className="claim-dot">!</span>
                <span>Unclaimed wOCT (Epoch #{pendingClaim.epochId})</span>
              </div>
              <button
                className="claim-action-btn-compact"
                onClick={() => {
                  setBridgeStep(3);
                  setBridgeDir("o2e");
                  openClaimConfirm();
                }}
              >
                Claim wOCT on Ethereum
              </button>
            </div>
          )}

          {/* Unclaimed proofs list */}
          {unclaimedProofs.length > 1 && (
            <div className="unclaimed-proofs-section animate-fade-in">
              <div className="unclaimed-proofs-title">
                {isFetchingUnclaimed
                  ? "Checking unclaimed..."
                  : `${unclaimedProofs.length} unclaimed bridge(s)`}
              </div>
              {unclaimedProofs.slice(0, 3).map((proof) => (
                <div key={proof.epochId} className="unclaimed-proof-item">
                  <span>
                    Epoch #{proof.epochId} — {proof.amount} wOCT
                  </span>
                  <button
                    className="claim-action-btn-compact"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
                    onClick={() => handleDirectClaim(proof)}
                  >
                    Claim
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          <button
            className="btn-swap-execute bridge-style"
            disabled={
              !fromAmount ||
              parseFloat(fromAmount) <= 0 ||
              parseFloat(fromAmount) > fromBalance
            }
            onClick={openBridgeConfirm}
          >
            {parseFloat(fromAmount) > fromBalance
              ? "Insufficient Balance"
              : "Bridge Assets"}
          </button>
        </div>
      )}
    </>
  );
}
