# Qiubit Wallet - Multichain Browser Extension
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Status](https://img.shields.io/badge/status-production--ready-green)
[![X: QiubitLabs](https://img.shields.io/badge/X-QiubitLabs-black.svg?logo=x)](https://x.com/qiubitlabs)

## Overview

Qiubit Wallet is a secure, non-custodial **multichain** cryptocurrency wallet extension for Chrome, Edge, Brave, and Firefox. It supports the Octra Network, all major EVM chains, Solana, Sui, and Bitcoin — all from a single interface. Manage assets across 20+ networks, swap tokens cross-chain, and bridge OCT to Ethereum, with full privacy and security built in.

## Supported Networks

| Network | Type | Native Token |
|---|---|---|
| **Octra** | Octra | OCT |
| **Ethereum** | EVM | ETH |
| **BNB Smart Chain** | EVM | BNB |
| **Polygon** | EVM | POL |
| **Base** | EVM | ETH |
| **Arbitrum One** | EVM | ETH |
| **Monad** | EVM | MON |
| **Hyperliquid EVM** | EVM | HYPE |
| **Arc** | EVM | ARC |
| **Pharos** | EVM | GAS |
| **Gravity** | EVM | G |
| **Robinhood Chain** | EVM | HOOD |
| **MegaETH** | EVM | ETH |
| **Tempo** | EVM | TEMPO |
| **Somnia** | EVM | STT |
| **0G** | EVM | A0GI |
| **Plasma** | EVM | ETH |
| **Solana** | Solana | SOL |
| **Sui** | Sui | SUI |
| **Bitcoin** | Bitcoin | BTC |

> Custom EVM networks can also be added manually via the Chainlist integration in Settings.

## Features

### Multichain
- **20+ Networks** built-in — Octra, Ethereum, BSC, Polygon, Base, Arbitrum, Monad, Hyperliquid, Solana, Sui, Bitcoin, and more.
- **Add Custom EVM Networks** via integrated Chainlist database with 1-click import.
- **Unified Dashboard** — view and manage all assets across every chain in one place.

### Swap & Bridge
- **Cross-Chain Swap** — swap tokens across EVM chains powered by LI.FI aggregation.
- **OCT Bridge** — native bridge between Octra and Ethereum (OCT to wOCT and back).
- **Token Discovery** — search and import any EVM token by contract address.

### Security & Privacy
- **Non-Custodial** — your keys never leave your device.
- **AES-256-GCM Encryption** — all sensitive data encrypted locally with PBKDF2-derived keys.
- **No Tracking** — zero analytics, zero telemetry, zero data collection.
- **Transaction Simulation** — preview transaction effects before signing.
- **Keystore Export** — export encrypted keystore files for backup.

### Wallet Management
- **Multiple Wallets** — create and manage multiple wallets with HD derivation.
- **Import Options** — seed phrase (12/24 word), private key, or keystore file.
- **Address Book** — save and label frequently used addresses.
- **Display Currency** — view portfolio value in USD, EUR, GBP, JPY, IDR, and more.

### dApp Integration
- **EVM dApp Support** — full EIP-1193 provider injection (MetaMask-compatible).
- **Solana dApp Support** — Phantom-compatible wallet adapter.
- **Sui dApp Support** — Sui Wallet Standard integration.
- **Transaction Approval** — review and approve dApp transactions with decoded details.

## Installation (Developer Mode)

### 1. Build the Extension

**Prerequisites:**
- Node.js (v18+)
- npm (v9+)

**Steps:**
1. Clone the repository:
    ```bash
    git clone https://github.com/irhamuba/wallet.git
    cd wallet
    ```
2. Install dependencies:
    ```bash
    npm install
    ```
3. Build the project:
    ```bash
    npm run build
    ```
    This creates a `dist/` folder containing the compiled extension.

### 2. Load into Browser

#### Chrome / Brave / Edge
1. Navigate to the Extensions page:
    - Chrome: `chrome://extensions`
    - Edge: `edge://extensions`
    - Brave: `brave://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist` folder.
5. The Qiubit Wallet icon should appear in your browser toolbar.

## Development

```bash
# Development server
npm run dev

# Lint
npm run lint

# Type check
npx tsc --noEmit

# Run tests
npm test
```

> Note: Extension APIs like `chrome.storage` require loading the built extension into the browser for accurate testing.

## Security Architecture

- **Local Storage** — all sensitive data encrypted with AES-256-GCM and stored locally via browser storage APIs and IndexedDB.
- **Key Derivation** — PBKDF2 with 600,000 iterations derives encryption keys from your password.
- **Signing** — transaction signing happens entirely client-side; private keys are never sent to any server.
- **Session Management** — auto-lock after configurable timeout with secure session handling.

## Support

If you find this project helpful and want to support its development:

**Octra Address:**
```
octHSp2A5VdWZYTCgts4voPPmdDSEwwKaqJzbxrFJeP3n1E
```

**Ethereum / EVM Address:**
```
0x742d35Cc6634C0532925a3b844Bc9e7595f5bA16
```

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for more information.
