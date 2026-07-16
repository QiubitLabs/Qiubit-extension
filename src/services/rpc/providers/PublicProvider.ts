const PUBLIC_ENDPOINTS: Record<number, string[]> = {
  1: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
  ],
  11155111: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
  ],
  56: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-rpc.publicnode.com",
    "https://1rpc.io/bnb",
  ],
  137: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
    "https://polygon.llamarpc.com",
  ],
  8453: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
  ],
  42161: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://1rpc.io/arb",
  ],
  10: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://1rpc.io/op",
  ],
  43114: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://1rpc.io/avax/c",
  ],
  143: [
    "https://rpc.monad.xyz",
    "https://monad.drpc.org", // dRPC public keyless gateway (verified live)
    "https://rpc1.monad.xyz",
    "https://rpc2.monad.xyz",
    "https://rpc3.monad.xyz",
    "https://rpc-mainnet.monadinfra.com",
  ],
  // Hyperliquid EVM — multiple public endpoints (all verified live → 999) so a
  // single node outage doesn't take balances/sends down.
  999: [
    "https://rpc.hyperliquid.xyz/evm",
    "https://hyperliquid.drpc.org",
    "https://rpc.hypurrscan.io",
    "https://hyperliquid-json-rpc.stakely.io",
    "https://rpc.hyperlend.finance",
  ],

  // Circle Arc mainnet — public RPCs only. The first two are verified live
  // (→ chainId 5042). arc.drpc.org's domain already resolves but isn't serving
  // Arc mainnet yet; it fails fast today and auto-activates when dRPC launches
  // Arc mainnet — kept LAST so it never delays the working endpoints.
  5042: [
    "https://5042.rpc.thirdweb.com",
    "https://rpc.blockdaemon.mainnet.arc.io",
    "https://arc.drpc.org",
  ],

  // Arc Testnet — public RPCs only (all verified live → chainId 5042002),
  // including dRPC's keyless public gateway.
  5042002: [
    "https://rpc.testnet.arc.network",
    "https://arc-testnet.drpc.org",
    "https://rpc.drpc.testnet.arc.network",
    "https://rpc.blockdaemon.testnet.arc.network",
    "https://5042002.rpc.thirdweb.com",
  ],

  // ── Additional EVM L1s — public RPCs only (every URL verified live). ──
  // Pharos & Robinhood are brand-new and only expose 1-2 public nodes today.
  1672: [
    "https://rpc.pharos.xyz",
    "https://pharos.drpc.org",
  ], // Pharos
  1625: [
    "https://rpc.gravity.xyz",
    "https://1625.rpc.thirdweb.com",
    "https://rpc.ankr.com/gravity",
  ], // Gravity
  4663: ["https://rpc.mainnet.chain.robinhood.com"], // Robinhood Chain
  4326: [
    "https://mainnet.megaeth.com/rpc",
    "https://4326.rpc.thirdweb.com",
    "https://megaeth.drpc.org",
  ], // MegaETH
  4217: [
    "https://rpc.tempo.xyz",
    "https://tempo.drpc.org",
    "https://1rpc.io/tempo",
    "https://tempo-rpc.publicnode.com",
    "https://rpc.mainnet.tempo.xyz",
  ], // Tempo (stablecoin gas)
  5031: [
    "https://api.infra.mainnet.somnia.network",
    "https://somnia-rpc.publicnode.com",
    "https://5031.rpc.thirdweb.com",
  ], // Somnia
  16661: [
    "https://evmrpc.0g.ai",
    "https://16661.rpc.thirdweb.com",
    "https://0g.drpc.org",
    "https://0g-rpc.publicnode.com",
  ], // 0G
  9745: [
    "https://rpc.plasma.to",
    "https://9745.rpc.thirdweb.com",
    "https://plasma.drpc.org",
  ], // Plasma
};

export const PublicProvider = {
  name: "Public Nodes",
  getRpcUrls(chainId: number): string[] {
    return PUBLIC_ENDPOINTS[chainId] || [];
  },
};
