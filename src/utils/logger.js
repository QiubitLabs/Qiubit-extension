/**
 * Secure Logging Utility
 * 
 * Prevents sensitive data leakage in production logs
 * Automatically redacts private keys, passwords, seeds, etc.
 */

const IS_PRODUCTION = import.meta.env.PROD;

// List of sensitive field names to redact
const SENSITIVE_FIELDS = [
    'privateKey',
    'private_key',
    'privateKeyB64',
    'password',
    'seed',
    'mnemonic',
    'secretKey',
    'secret_key',
    'tempPassword',
    'temp_password',
    'encryptedPassword',
    'from_private_key',
    'to_private_key'
];

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(data) {
    if (!data) return data;

    // Handle primitives
    if (typeof data !== 'object') {
        return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => redactSensitiveData(item));
    }

    // Handle objects
    const redacted = { ...data };

    for (const key in redacted) {
        // Check if field name is sensitive
        const isSensitive = SENSITIVE_FIELDS.some(field =>
            key.toLowerCase().includes(field.toLowerCase())
        );

        if (isSensitive) {
            redacted[key] = '[REDACTED]';
        } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
            // Recursively redact nested objects
            redacted[key] = redactSensitiveData(redacted[key]);
        }
    }

    return redacted;
}

/**
 * Log info message (only in development)
 */
export function logInfo(message, data) {
    if (!IS_PRODUCTION) {
        if (data !== undefined) {
            console.log(message, data);
        } else {
            console.log(message);
        }
    }
}

/**
 * Log sensitive data (always redacted, even in development)
 */
export function logSensitive(message, data) {
    if (!IS_PRODUCTION) {
        const redacted = redactSensitiveData(data);
        console.log(message, redacted);
    }
}

/**
 * Log warning (shown in production)
 */
export function logWarn(message, data) {
    if (data !== undefined) {
        const redacted = redactSensitiveData(data);
        console.warn(message, redacted);
    } else {
        console.warn(message);
    }
}

/**
 * Log error (shown in production, but redacted)
 */
export function logError(message, error) {
    if (error && typeof error === 'object') {
        const redacted = redactSensitiveData(error);
        console.error(message, redacted);
    } else {
        console.error(message, error);
    }
}

/**
 * Log security event (always logged, always redacted)
 */
export function logSecurity(event, details) {
    const redacted = redactSensitiveData(details);
    console.log(`[SECURE] [SECURITY] ${event}`, redacted);
}

/**
 * Development-only debug log
 */
export function logDebug(message, data) {
    if (!IS_PRODUCTION && import.meta.env.DEV) {
        console.debug(message, data);
    }
}
