import { DEFAULT_TOKENS as STATIC_DEFAULT_TOKENS } from "./tokenLists/index";

export interface DefaultToken {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  logoUrl: string;
}

export const DEFAULT_TOKENS: Record<number, DefaultToken[]> =
  STATIC_DEFAULT_TOKENS;
