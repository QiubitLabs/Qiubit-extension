/**
 * LOGIC: Provides user-friendly error translation by mapping raw/technical blockchain errors to readable descriptions.
 * Dynamically resolves gas token symbols depending on active chain (EVM, Octra, Solana, etc.), extracts JSON-RPC error contents, and formats stack traces for debugging.
 * EXPORTS:
 *   - ERROR_MESSAGES (const object mapping error string to readable description)
 *   - getFriendlyErrorMessage (function)
 *   - FormattedError (interface)
 *   - formatError (function)
 * FUNCTIONS:
 *   - extractRpcError(msg): Attempts to parse raw JSON-RPC response error fields.
 *   - getFriendlyErrorMessage(error, networkIdOrChainId): Looks up mapped errors or dynamic native gas token symbol for balance/insufficient funds messages.
 *   - formatError(error, showTechnical, networkIdOrChainId): Prepares error payloads for UI display (friendly description plus optional developer details/stacks).
 */

import { getChainConfig } from "../config/chains";
import { resolveNetworkByChainId } from "../services/network/NetworkResolver";

export const ERROR_MESSAGES: Record<string, string> = {
  "Failed to fetch":
    "Unable to connect to the network. Please check your internet connection.",
  "Network request failed":
    "Network error. Please check your connection and try again.",
  ETIMEDOUT: "Connection timeout. The network is not responding.",
  ECONNREFUSED: "Cannot connect to the server. Please try again later.",

  "Nonce too low":
    "Transaction nonce is outdated. Please refresh and try again.",
  "Insufficient balance": "Insufficient balance to complete this transaction.",
  "insufficient funds":
    "Insufficient ETH balance for gas fee. Please deposit some ETH.",
  "Invalid signature": "Transaction signature is invalid. Please try again.",
  "Transaction failed":
    "Transaction failed. Please check the details and try again.",

  "Invalid password": "Incorrect password.",
  "Invalid mnemonic": "Invalid recovery phrase. Please check and try again.",
  "Invalid private key":
    "Invalid private key format. Please check and try again.",
  "Invalid address": "Invalid wallet address. Please check the format.",

  "Token not found": "This token could not be found.",
  "Invalid token address": "Invalid token contract address.",

  // ── Swap / Bridge (LI.FI) — humanize the raw API messages ──
  "no available quotes":
    "Amount is too low or no bridge route is available for this pair.",
  "no routes found":
    "Amount is too low or no bridge route is available for this pair.",
  "no route found":
    "Amount is too low or no bridge route is available for this pair.",
  "could not find token":
    "This token isn't supported for swaps on the selected network yet.",
  "out of acceptable range":
    "That amount is out of the acceptable range. Try a different amount.",
  "amount too low":
    "Amount is too low for this cross-chain swap & bridge.",
  "bridge fee exceeds amount":
    "Amount is too low to cover the bridge transaction fees.",
  "request failed with status code 429":
    "The swap service is busy right now. Please wait a moment and try again.",
  "request limit reached":
    "The network RPC server is temporarily busy. Please try again later.",
  "could not coalesce error":
    "Network connection error. Please try again or switch nodes.",
  "across does not send weth to eoas":
    "Across bridge does not support bridging WETH directly. Please swap to native ETH or another token instead.",
  "requires a signature on the destination chain":
    "Amount is too low or no bridge route is available for this pair.",
  "insufficient liquidity":
    "Not enough pool liquidity. Please try a smaller amount.",
  "slippage":
    "Price fluctuated too fast. Please increase your slippage tolerance and try again.",
  "price impact":
    "Price fluctuated too fast. Please increase your slippage tolerance and try again.",
  "allowance":
    "Token approval failed. Please approve the spending limit and try again.",
  "approve":
    "Token approval failed. Please approve the spending limit and try again.",
  "user rejected":
    "Transaction cancelled by user.",
  "action rejected":
    "Transaction cancelled by user.",
  "declined":
    "Transaction cancelled by user.",
  "gas":
    "Not enough native gas token to pay for this transaction.",

  default: "An unexpected error occurred. Please try again.",

  malformed_transaction: "Transaction data is malformed or corrupted.",
  "self transfer": "Cannot send to your own wallet address (Self Transfer).",
  self_transfer: "Cannot send to your own wallet address (Self Transfer).",
  sender_not_found: "Account not found on-chain (Try receiving funds first).",
  duplicate_transaction: "Transaction with this nonce already exists.",
  nonce_too_far:
    "Nonce gap detected. Your transaction sequence is out of sync.",
  internal_error: "Validators encountered an internal error. Please try again.",
  service_unavailable: "Service is temporarily unavailable (503).",
  gateway_timeout: "Gateway timeout (504). Network is busy.",
};

/**
 * Extracts inner message from stringified JSON-RPC error if present
 */
function extractRpcError(msg: string): string {
  try {
    if (msg.startsWith("{") && msg.includes('"jsonrpc"')) {
      const parsed = JSON.parse(msg);
      if (parsed.error && parsed.error.message) {
        return parsed.error.message;
      }
    }
  } catch (e) {}
  return msg;
}

/**
 * Get user-friendly error message
 * @param {Error|string} error - The error object or message
 * @param {string|number|null} networkIdOrChainId - Optional chain or network identifier for dynamic gas token symbols
 * @returns {string} User-friendly error message
 */
export function getFriendlyErrorMessage(
  error: any,
  networkIdOrChainId?: string | number | null,
): string {
  if (!error) return ERROR_MESSAGES.default;

  let errorMessage =
    typeof error === "string" ? error : error.message || error.toString();
  errorMessage = extractRpcError(errorMessage);

  const errorMessageLower = errorMessage.toLowerCase();

  if (
    errorMessageLower.includes("insufficient funds") ||
    errorMessageLower.includes("insufficient balance") ||
    errorMessageLower.includes("transfer amount exceeds balance")
  ) {
    // Prefer resolveNetworkByChainId so user-added custom networks also resolve
    // to the correct native symbol (e.g. SEI, not OCT).
    const chainIdNum =
      typeof networkIdOrChainId === "number"
        ? networkIdOrChainId
        : typeof networkIdOrChainId === "string" && /^\d+$/.test(networkIdOrChainId)
          ? Number(networkIdOrChainId)
          : null;
    const userNet = chainIdNum !== null ? resolveNetworkByChainId(chainIdNum) : null;
    const builtinChain = userNet ? null : getChainConfig(networkIdOrChainId ?? null);
    const nativeSymbol =
      userNet?.nativeToken?.symbol ??
      builtinChain?.nativeSymbol ??
      "ETH";
    return `Insufficient ${nativeSymbol} balance for gas fee. Please deposit some ${nativeSymbol}.`;
  }

  if (ERROR_MESSAGES[errorMessage]) {
    return ERROR_MESSAGES[errorMessage];
  }

  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessageLower.includes(key.toLowerCase())) {
      return value;
    }
  }

  return ERROR_MESSAGES.default;
}

export interface FormattedError {
  message: string;
  technical?: string;
  stack?: string;
}

/**
 * Format error for display
 * @param {Error|string} error - The error
 * @param {boolean} showTechnical - Whether to show technical details (dev mode)
 * @param {string|number|null} networkIdOrChainId - Optional chain/network identifier
 * @returns {object} Formatted error with message and optional details
 */
export function formatError(
  error: any,
  showTechnical: boolean = false,
  networkIdOrChainId?: string | number | null,
): FormattedError {
  const friendlyMessage = getFriendlyErrorMessage(error, networkIdOrChainId);

  if (!showTechnical) {
    return { message: friendlyMessage };
  }

  const technicalMessage = typeof error === "string" ? error : error.message;
  return {
    message: friendlyMessage,
    technical: technicalMessage,
    stack: error?.stack,
  };
}

/**
 * Strip ethers/RPC noise (the "(request=… version=…)" tails), collapse
 * whitespace, and cap length so a raw error never renders as a wall of text.
 * Prefers a mapped friendly message when one exists, otherwise returns the
 * cleaned raw text (more specific but bounded).
 */
export function cleanErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
  max = 140,
  networkIdOrChainId?: string | number | null,
): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const friendly = getFriendlyErrorMessage(raw, networkIdOrChainId);
  if (friendly && friendly !== ERROR_MESSAGES.default) return friendly;
  const clean = raw
    .replace(/\(.*\)/gs, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return clean || fallback;
}
