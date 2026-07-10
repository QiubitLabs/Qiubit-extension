import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ConnectApproval } from "../ConnectApproval";
import { Wallet } from "../../../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("ConnectApproval Component", () => {
  const mockRequest = {
    origin: "https://example.com",
    action: "connect",
  };

  const mockWallets: Wallet[] = [
    {
      id: "1",
      name: "Wallet 1",
      address: "oct1qtr9877a7b0d9e8603169ddbd7836e478b4624789",
      publicKey: "pubkey1",
      evmAddress: "0x123",
      type: "octra",
      privateKeyHex: "privkeyhex1",
      publicKeyHex: "pubkeyhex1",
      privateKeyB64: "privkeyb64_1",
      publicKeyB64: "pubkeyb64_1",
    },
    {
      id: "2",
      name: "Wallet 2",
      address: "oct2abc1234567890abcdef1234567890abcdef123",
      publicKey: "pubkey2",
      evmAddress: "0x456",
      type: "octra",
      privateKeyHex: "privkeyhex2",
      publicKeyHex: "pubkeyhex2",
      privateKeyB64: "privkeyb64_2",
      publicKeyB64: "pubkeyb64_2",
    },
  ];

  it("should render origin and title correctly", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const getDisplayAddress = (addr: string) => addr;
    const onWalletSelectClick = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ConnectApproval
          request={mockRequest}
          wallets={mockWallets}
          selectedOctraAddr={mockWallets[0].address}
          getDisplayAddress={getDisplayAddress}
          onWalletSelectClick={onWalletSelectClick}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("https://example.com");
    expect(container.textContent).toContain(
      "Requesting connection to your wallet",
    );
    expect(container.textContent).toContain("Wallet 1");

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("should call onWalletSelectClick when wallet item is clicked and multiple wallets exist", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const getDisplayAddress = (addr: string) => addr;
    const onWalletSelectClick = vi.fn();

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ConnectApproval
          request={mockRequest}
          wallets={mockWallets}
          selectedOctraAddr={mockWallets[0].address}
          getDisplayAddress={getDisplayAddress}
          onWalletSelectClick={onWalletSelectClick}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const button = container.querySelector(
      ".da-connect-wallet-btn",
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    await act(async () => {
      button.click();
    });

    expect(onWalletSelectClick).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
