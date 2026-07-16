import { ETHEREUM_TOKENS } from "./ethereum";
import { BSC_TOKENS } from "./bsc";
import { POLYGON_TOKENS } from "./polygon";
import { BASE_TOKENS } from "./base";
import { ARBITRUM_TOKENS } from "./arbitrum";
import { MONAD_TOKENS } from "./monad";
import { HYPERLIQUID_TOKENS } from "./hyperliquid";
import { ARC_TOKENS } from "./arc";
import { PHAROS_TOKENS } from "./pharos";
import { GRAVITY_TOKENS } from "./gravity";
import { ROBINHOOD_TOKENS } from "./robinhood";
import { MEGAETH_TOKENS } from "./megaeth";
import { TEMPO_TOKENS } from "./tempo";
import { SOMNIA_TOKENS } from "./somnia";
import { ZEROG_TOKENS } from "./zerog";
import { PLASMA_TOKENS } from "./plasma";
import { SOLANA_TOKENS, SOLANA_CHAIN_ID } from "./solana";
import { SUI_TOKENS, SUI_CHAIN_ID } from "./sui";
import { BITCOIN_TOKENS, BITCOIN_CHAIN_ID } from "./bitcoin";
import { OCTRA_CHAIN_ID, OCTRA_TOKENS } from "./octra";

export { ETHEREUM_TOKENS } from "./ethereum";
export { BSC_TOKENS } from "./bsc";
export { POLYGON_TOKENS } from "./polygon";
export { BASE_TOKENS } from "./base";
export { ARBITRUM_TOKENS } from "./arbitrum";
export { MONAD_TOKENS } from "./monad";
export { HYPERLIQUID_TOKENS } from "./hyperliquid";
export { SOLANA_TOKENS, SOLANA_CHAIN_ID } from "./solana";
export { SUI_TOKENS, SUI_CHAIN_ID } from "./sui";
export { BITCOIN_TOKENS, BITCOIN_CHAIN_ID } from "./bitcoin";
export { OCT_TOKEN, WOCT_TOKEN, OCTRA_TOKENS, OCTRA_CHAIN_ID } from "./octra";

export type TokenEntry = {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  logoUrl: string;
  chainId: number;
};

export const DEFAULT_TOKENS: Record<number, TokenEntry[]> = {
  1: ETHEREUM_TOKENS,
  56: BSC_TOKENS,
  137: POLYGON_TOKENS,
  8453: BASE_TOKENS,
  42161: ARBITRUM_TOKENS,
  143: MONAD_TOKENS,
  999: HYPERLIQUID_TOKENS,
  5042: ARC_TOKENS,
  1672: PHAROS_TOKENS,
  1625: GRAVITY_TOKENS,
  4663: ROBINHOOD_TOKENS,
  4326: MEGAETH_TOKENS,
  4217: TEMPO_TOKENS,
  5031: SOMNIA_TOKENS,
  16661: ZEROG_TOKENS,
  9745: PLASMA_TOKENS,
  [SOLANA_CHAIN_ID]: SOLANA_TOKENS,
  [SUI_CHAIN_ID]: SUI_TOKENS,
  [BITCOIN_CHAIN_ID]: BITCOIN_TOKENS,
  [OCTRA_CHAIN_ID]: OCTRA_TOKENS,
};
