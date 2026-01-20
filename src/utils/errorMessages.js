/**
 * User-friendly error message utility
 * Maps technical errors to human-readable messages
 */

export const ERROR_MESSAGES = {
    // Network errors
    'Failed to fetch': 'Unable to connect to the network. Please check your internet connection.',
    'Network request failed': 'Network error. Please check your connection and try again.',
    'ETIMEDOUT': 'Connection timeout. The network is not responding.',
    'ECONNREFUSED': 'Cannot connect to the server. Please try again later.',

    // RPC errors
    'Nonce too low': 'Transaction nonce is outdated. Please refresh and try again.',
    'Insufficient balance': 'Insufficient balance to complete this transaction.',
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
    'default': 'An unexpected error occurred. Please try again.'
};

/**
 * Get user-friendly error message
 * @param {Error|string} error - The error object or message
 * @returns {string} User-friendly error message
 */
export function getFriendlyErrorMessage(error) {
    if (!error) return ERROR_MESSAGES.default;

    const errorMessage = typeof error === 'string' ? error : error.message || error.toString();

    // Check for exact match
    if (ERROR_MESSAGES[errorMessage]) {
        return ERROR_MESSAGES[errorMessage];
    }

    // Check for partial match
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
        if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
            return value;
        }
    }

    // Return default if no match
    return ERROR_MESSAGES.default;
}

/**
 * Format error for display
 * @param {Error|string} error - The error
 * @param {boolean} showTechnical - Whether to show technical details (dev mode)
 * @returns {object} Formatted error with message and optional details
 */
export function formatError(error, showTechnical = false) {
    const friendlyMessage = getFriendlyErrorMessage(error);

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
