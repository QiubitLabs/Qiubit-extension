import { useState, useEffect, useCallback } from "react";
import "./PrivacyFeatures.css";
import "./Privacy.css";
import "./PrivacySharedActions.css";
import { isValidAddress } from "../../../utils/validation";
import { privacyService } from "../../../services/features/PrivacyService";
import { ocs01Manager } from "../../../services/features/OCS01TokenService";
import { ChevronLeftIcon, RefreshIcon } from "../../shared/Icons";
import { getTokenPrice } from "../../../services/network/PriceService";

import { PrivacyDashboard } from "./Dashboard/PrivacyDashboard";
import { ShieldView } from "./Shield/ShieldView";
import { UnshieldView } from "./Unshield/UnshieldView";
import { TransferView } from "./Transfer/TransferView";
import { ClaimView } from "./Claim/ClaimView";

interface PrivacyToken {
  symbol: string;
  name: string;
  balance: number;
  encryptedBalance: number;
  isNative: boolean;
  verified: boolean;
  contractAddress?: string;
}

interface EncryptedBalanceResult {
  success: boolean;
  publicBalance: number;
  encryptedBalance: number;
  totalBalance: number;
  hasEncryptedFunds: boolean;
}

interface PrivacyViewProps {
  wallet: any;
  onBack: () => void;
  showToast?: (
    message: string,
    type: "info" | "success" | "warning" | "error",
  ) => void;
  publicBalance: number;
  onRefresh?: (mode?: "public" | "private" | "both") => void;
}

type ActiveView =
  | "dashboard"
  | "shield_list"
  | "unshield_list"
  | "transfer_list"
  | "shield_form"
  | "unshield_form"
  | "transfer_form"
  | "transfer_confirm"
  | "claim_list";

export function PrivacyView({
  wallet,
  onBack,
  showToast,
  publicBalance,
  onRefresh,
}: PrivacyViewProps) {
  const [encryptedBalance, setEncryptedBalance] =
    useState<EncryptedBalanceResult | null>(null);
  const [octPrice, setOctPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([]);
  const [tokenBalances, setTokenBalances] = useState<PrivacyToken[]>([]);

  const [activeView, setActiveView] = useState<ActiveView>("dashboard");
  const [selectedToken, setSelectedToken] = useState<PrivacyToken | null>(null);
  const [formData, setFormData] = useState<{
    amount: string;
    recipient: string;
    contractData: string;
  }>({ amount: "", recipient: "", contractData: "" });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchPrivacyData = useCallback(
    async (isInitial = false) => {
      if (!wallet?.address) return;

      if (isInitial) setIsLoading(true);
      setIsRefreshing(true);

      try {
        const cachedResult = await privacyService.getEncryptedBalance(
          wallet.address,
          false,
        );
        if (cachedResult.success) setEncryptedBalance(cachedResult);

        let finalResult = cachedResult;
        if (cachedResult.fromCache || isRefreshing) {
          const freshResult = await privacyService.getEncryptedBalance(
            wallet.address,
            true,
          );
          if (freshResult.success) {
            setEncryptedBalance(freshResult);
            finalResult = freshResult;
          }
        } else {
        }

        const result = finalResult; // alias for rest of logic

        const [transfers, tokens] = await Promise.all([
          privacyService.getPendingTransfers(wallet.address),
          ocs01Manager.getUserTokenBalances(wallet.address),
        ]);

        setPendingTransfers(transfers);

        const allTokens = [
          {
            symbol: "OCT",
            name: "Octra",
            balance: publicBalance || result.publicBalance || 0,
            encryptedBalance: result.encryptedBalance || 0,
            isNative: true,
            verified: true,
          },
          ...tokens.map((t: any) => ({
            symbol: t.contractName,
            name: t.contractName,
            balance: t.balance,
            encryptedBalance: 0,
            contractAddress: t.contractAddress,
            isNative: false,
            verified: t.verified,
          })),
        ];
        setTokenBalances(allTokens);
      } catch (error) {
        console.error("Failed to fetch privacy data:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [wallet?.address, publicBalance],
  );

  useEffect(() => {
    fetchPrivacyData(true);
    const fetchPrice = async () => {
      const priceData = await getTokenPrice("OCT");
      setOctPrice(priceData?.price || 0);
    };
    fetchPrice();
  }, [fetchPrivacyData]);

  const handleActionBack = () => {
    if (activeView === "dashboard") {
      onBack();
    } else if (activeView === "transfer_confirm") {
      setActiveView("transfer_form");
    } else if (activeView.endsWith("_form")) {
      const listType = activeView.replace("_form", "_list") as ActiveView;
      setActiveView(listType);
    } else {
      setActiveView("dashboard");
    }
  };

  const handleShieldSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsSubmitting(true);
    try {
      if (!privacyService.hasKey) {
        const pk = wallet?.privateKeyB64;
        if (pk) {
          privacyService.setPrivateKey(pk);
        } else {
          throw new Error("Wallet locked or key missing");
        }
      }

      if (activeView === "shield_form") {
        await privacyService.shieldBalance(wallet.address, amountNum);
      } else {
        await privacyService.unshieldBalance(wallet.address, amountNum);
      }
      showToast?.("Transaction submitted", "success");
      setActiveView("dashboard");
      onRefresh?.("both");
      setTimeout(() => fetchPrivacyData(), 2000);
    } catch (error: any) {
      showToast?.(error.message || "Operation failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amountNum = parseFloat(formData.amount);
    if (!isValidAddress(formData.recipient)) {
      showToast?.("Invalid recipient address", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!privacyService.hasKey) {
        const pk = wallet?.privateKeyB64;
        if (pk) {
          privacyService.setPrivateKey(pk);
        } else {
          throw new Error("Wallet locked or key missing");
        }
      }

      await privacyService.privacyTransfer(
        wallet.address,
        formData.recipient,
        amountNum,
      );
      showToast?.("Private transfer sent", "success");
      setActiveView("dashboard");
      onRefresh?.("private");
      setTimeout(() => fetchPrivacyData(), 2000);
    } catch (error: any) {
      showToast?.(error.message || "Transfer failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClaimTransfer = async (transferId: string) => {
    setIsSubmitting(true);
    try {
      if (!privacyService.hasKey) {
        const pk = wallet?.privateKeyB64;
        if (pk) {
          privacyService.setPrivateKey(pk);
        } else {
          throw new Error("Wallet locked or key missing");
        }
      }

      await privacyService.claimPrivateTransfer(wallet.address, transferId);
      showToast?.("Funds claimed successfully", "success");
      onRefresh?.("both");
      setTimeout(() => fetchPrivacyData(), 2000);
    } catch (error) {
      showToast?.("Claim failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectTokenForAction = (
    token: PrivacyToken,
    action: "shield" | "unshield" | "transfer",
  ) => {
    setSelectedToken(token);
    setFormData({ amount: "", recipient: "", contractData: "" });
    setActiveView(`${action}_form` as ActiveView);
  };

  const renderCurrentView = () => {
    switch (activeView) {
      case "dashboard":
        return (
          <PrivacyDashboard
            totalEncryptedUsd={
              (encryptedBalance?.encryptedBalance || 0) * octPrice
            }
            shieldedPercent={
              (encryptedBalance?.totalBalance || 0) > 0
                ? Math.round(
                    ((encryptedBalance?.encryptedBalance || 0) /
                      (encryptedBalance?.totalBalance || 1)) *
                      100,
                  )
                : 0
            }
            isRefreshing={isRefreshing}
            isLoading={isLoading}
            activeTransfersCount={pendingTransfers.length}
            onAction={(action: string) => setActiveView(action as ActiveView)}
          />
        );
      case "shield_list":
      case "shield_form":
        return (
          <ShieldView
            activeView={activeView}
            tokenBalances={tokenBalances}
            selectedToken={selectedToken}
            formData={formData}
            isSubmitting={isSubmitting}
            onTokenSelect={(token: PrivacyToken) =>
              selectTokenForAction(token, "shield")
            }
            onAmountChange={(val: string) =>
              setFormData({ ...formData, amount: val })
            }
            onSetMax={(val: string) =>
              setFormData({ ...formData, amount: val })
            }
            onSubmit={handleShieldSubmit}
          />
        );
      case "unshield_list":
      case "unshield_form":
        return (
          <UnshieldView
            activeView={activeView}
            tokenBalances={tokenBalances}
            selectedToken={selectedToken}
            formData={formData}
            isSubmitting={isSubmitting}
            onTokenSelect={(token: PrivacyToken) =>
              selectTokenForAction(token, "unshield")
            }
            onAmountChange={(val: string) =>
              setFormData({ ...formData, amount: val })
            }
            onSetMax={(val: string) =>
              setFormData({ ...formData, amount: val })
            }
            onSubmit={handleShieldSubmit}
          />
        );
      case "transfer_list":
      case "transfer_form":
      case "transfer_confirm":
        return (
          <TransferView
            activeView={activeView}
            wallet={wallet}
            tokenBalances={tokenBalances}
            selectedToken={selectedToken}
            formData={formData}
            isSubmitting={isSubmitting}
            onTokenSelect={(token: PrivacyToken) =>
              selectTokenForAction(token, "transfer")
            }
            onFormChange={(key: string, val: string) =>
              setFormData({ ...formData, [key]: val })
            }
            onSetMax={(val: string) =>
              setFormData({ ...formData, amount: val })
            }
            onReview={(e) => {
              e?.preventDefault();
              setActiveView("transfer_confirm");
            }}
            onSubmit={handleTransferSubmit}
            onBack={() => setActiveView("transfer_form")}
          />
        );
      case "claim_list":
        return (
          <ClaimView
            pendingTransfers={pendingTransfers}
            isSubmitting={isSubmitting}
            onClaim={handleClaimTransfer}
          />
        );
      default:
        return null;
    }
  };

  const getViewTitle = () => {
    switch (activeView) {
      case "dashboard":
        return "Privacy";
      case "shield_list":
      case "shield_form":
        return "Shield Fund";
      case "unshield_list":
      case "unshield_form":
        return "Unshield Fund";
      case "transfer_list":
      case "transfer_form":
        return "Private Transfer";
      case "claim_list":
        return "Claim Funds";
      default:
        return "Privacy";
    }
  };

  return (
    <div className="privacy-view animate-fade-in h-full flex flex-col">
      {activeView !== "transfer_confirm" && (
        <div className="flex items-center gap-md mb-xl p-0">
          <button className="header-icon-btn" onClick={handleActionBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <h2 className="text-lg font-semibold flex-1">{getViewTitle()}</h2>
          {activeView === "dashboard" && (
            <button
              className="header-icon-btn"
              onClick={() => fetchPrivacyData()}
              disabled={isRefreshing}
            >
              <RefreshIcon
                size={20}
                className={isRefreshing ? "animate-spin" : ""}
              />
            </button>
          )}
        </div>
      )}

      <div className="privacy-content-scroll flex-1 overflow-y-auto pr-xs">
        {renderCurrentView()}
      </div>

      {(isLoading || isRefreshing) && activeView === "dashboard" && (
        <div className="refresh-status text-xs text-center mt-xl opacity-50">
          {isLoading ? "Loading privacy data..." : "Updating balance..."}
        </div>
      )}
    </div>
  );
}
