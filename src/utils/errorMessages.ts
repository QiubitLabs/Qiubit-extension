/**
 * User-friendly error message utility
 * Maps technical errors to human-readable messages
 */
import { getChainConfig } from '../config/chains';

export const ERROR_MESSAGES: Record<string, string> = {
    // Network errors
    'Failed to fetch': 'Unable to connect to the network. Please check your internet connection.',
    'Network request failed': 'Network error. Please check your connection and try again.',
    'ETIMEDOUT': 'Connection timeout. The network is not responding.',
    'ECONNREFUSED': 'Cannot connect to the server. Please try again later.',

    // RPC errors
    'Nonce too low': 'Transaction nonce is outdated. Please refresh and try again.',
    'Insufficient balance': 'Insufficient balance to complete this transaction.',
    'insufficient funds': 'Insufficient ETH balance for gas fee. Please deposit some ETH.',
    'Invalid signature': 'Transaction signature is invalid. Please try again.',
    'Transaction failed': 'Transaction failed. Please check the details and try again.',

    // Wallet errors
    'Invalid password': 'Incorrect password. Please try again.',
    'Invalid mnemonic': 'Invalid recovery phrase. Please check and try again.',
    'Invalid private key': 'Invalid private key format. Please check and try again.',
    'Invalid address': 'Invalid wallet address. Please check the format.',

    // Token errors
    'Token not found': 'This token could not be found.',
    'Invalid token address': 'Invalid token contract address.',

    // Generic fallback
    'default': 'An unexpected error occurred. Please try again.',

    // New RPC v2 Errors
    'malformed_transaction': 'Transaction data is malformed or corrupted.',
    'self transfer': 'Tidak bisa mengirim ke alamat wallet sendiri (Self Transfer).',
    'self_transfer': 'Tidak bisa mengirim ke alamat wallet sendiri (Self Transfer).',
    'sender_not_found': 'Account not found on-chain (Try receiving funds first).',
    'duplicate_transaction': 'Transaction with this nonce already exists.',
    'nonce_too_far': 'Nonce gap detected. Your transaction sequence is out of sync.',
    'internal_error': 'Validators encountered an internal error. Please try again.',
    'service_unavailable': 'Service is temporarily unavailable (503).',
    'gateway_timeout': 'Gateway timeout (504). Network is busy.'
};

/**
 * Extracts inner message from stringified JSON-RPC error if present
 */
function extractRpcError(msg: string): string {
    try {
        if (msg.startsWith('{') && msg.includes('"jsonrpc"')) {
            const parsed = JSON.parse(msg);
            if (parsed.error && parsed.error.message) {
                return parsed.error.message;
            }
        }
    } catch (e) {
        // ignore JSON parse error
    }
    return msg;
}

/**
 * Get user-friendly error message
 * @param {Error|string} error - The error object or message
 * @param {string|number|null} networkIdOrChainId - Optional chain or network identifier for dynamic gas token symbols
 * @returns {string} User-friendly error message
 */
export function getFriendlyErrorMessage(error: any, networkIdOrChainId?: string | number | null): string {
    if (!error) return ERROR_MESSAGES.default;

    let errorMessage = typeof error === 'string' ? error : (error.message || error.toString());
    errorMessage = extractRpcError(errorMessage);

    const errorMessageLower = errorMessage.toLowerCase();

    // Check if it's an insufficient funds/balance error to dynamically inject the correct native token symbol
    if (
        errorMessageLower.includes('insufficient funds') ||
        errorMessageLower.includes('insufficient balance') ||
        errorMessageLower.includes('transfer amount exceeds balance')
    ) {
        const chain = getChainConfig(networkIdOrChainId ?? null);
        const nativeSymbol = chain?.nativeSymbol ?? 'ETH';
        return `Insufficient ${nativeSymbol} balance for gas fee. Please deposit some ${nativeSymbol}.`;
    }

    // Check for exact match
    if (ERROR_MESSAGES[errorMessage]) {
        return ERROR_MESSAGES[errorMessage];
    }

    // Check for partial match
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
        if (errorMessageLower.includes(key.toLowerCase())) {
            return value;
        }
    }

    // Return default if no match
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
    networkIdOrChainId?: string | number | null
): FormattedError {
    const friendlyMessage = getFriendlyErrorMessage(error, networkIdOrChainId);

    if (!showTechnical) {
        return { message: friendlyMessage };
    }

    const technicalMessage = typeof error === 'string' ? error : error.message;
    return {
        message: friendlyMessage,
        technical: technicalMessage,
        stack: error?.stack
    };
}
