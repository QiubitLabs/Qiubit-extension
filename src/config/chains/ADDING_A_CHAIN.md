# How to Add a New Chain

## 1. EVM Chain (uses LI.FI automatically)

Example: adding Optimism.

### Step 1 — Chain config
```ts
// src/config/chains/OptimismChain.ts
import { BaseChainConfig } from './BaseChainConfig';
export class OptimismChain extends BaseChainConfig {
    id = 'optimism';
    displayName = 'Optimism';
    shortName = 'OP';
    chainId = 10;
    isEVM = true;
    isTestnet = false;
    rpcUrl = 'https://mainnet.optimism.io';
    rpcUrls = ['https://mainnet.optimism.io'];
    iconUrl = 'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg';
    badgeColor = '#FF0420';
    nativeSymbol = 'ETH';
    nativeDecimals = 18;
}
```

### Step 2 — Register it
```ts
// src/config/chains/index.ts
import { OptimismChain } from './OptimismChain';
export const CHAINS = {
    // ...existing...
    optimism: new OptimismChain(),
};
```

### Step 3 — Add to NETWORK_REGISTRY
```ts
// src/constants/networks/registry.ts
optimism: {
    id: 'optimism',
    displayName: 'Optimism',
    shortName: 'OP',
    chainId: 10,
    isEVM: true,
    isTestnet: false,
    rpcUrl: getPrimaryRpc(10),
    iconUrl: 'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg',
    badgeColor: '#FF0420',
    addressType: 'evm',
    nativeToken: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: '...' },
    erc20Tokens: [], // add default ERC20s here
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    historyApi: { type: 'none' },
},
```

### Step 4 — Add RPC endpoint
```ts
// src/config/rpcEndpoints.ts — add chainId 10 entry
```

That's it. LI.FI swap, token discovery, and balance fetching all pick it up automatically.

---

## 2. Non-EVM Chain with custom VM (needs its own bridge)

Example: adding TON.

### Step 1 — Extend VMType
```ts
// src/types/index.ts
export type VMType = 'evm' | 'solana' | 'sui' | 'bitcoin' | 'octra' | 'ton'; // add 'ton'
```

### Step 2 — Chain service
```ts
// src/services/network/chains/ton.ts
export const TON_CHAIN_ID = 607;
export async function fetchTonBalance(address: string): Promise<string> { ... }
export function buildTonToken(ownerAddress: string, balance = '0') {
    return { symbol: 'TON', name: 'TON', balance, vm: 'ton' as const,
             isTon: true, chainId: TON_CHAIN_ID, decimals: 9, ownerAddress };
}
```

### Step 3 — Add to wallet address map in useWalletData.ts
```ts
const WALLET_ADDR_BY_VM = {
    // ...existing...
    ton: (w: Wallet) => w.tonAddress,
};
```

### Step 4 — Add to NETWORK_REGISTRY
```ts
ton: {
    id: 'ton', displayName: 'TON', chainId: 607,
    isEVM: false, addressType: 'ton',
    nativeToken: { symbol: 'TON', ... },
    ...
}
```

### Step 5 — Native bridge (if TON has its own bridge like OCT↔wOCT)
```ts
// src/components/dashboard/Swap/TonBridge/TonBridgeView.tsx  (copy OctraBridgeView pattern)
// src/utils/ton/bridge.ts  (copy utils/octra/bridge.ts pattern)

// src/components/dashboard/Swap/SwapView.tsx — add to NATIVE_BRIDGES:
const NATIVE_BRIDGES = {
    octra: { ... },
    ton: { label: 'TON ↔ ETH Bridge', networks: ['all', 'ton', 'ethereum'] },
};
// Add to the if-chain:
if (nativeBridge === 'ton') return <TonBridgeView ... />;
```
