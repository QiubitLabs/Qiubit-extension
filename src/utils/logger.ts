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
export function redactSensitiveData(data: any, visited = new WeakSet()): any {
    if (!data) return data;

    // Handle primitives
    if (typeof data !== 'object') {
        return data;
    }

    // Check for circular references
    if (visited.has(data)) {
        return '[CIRCULAR]';
    }
    visited.add(data);

    // Handle Error, DOMException, and related objects
    if (data instanceof Error || (typeof data === 'object' && ('name' in data || 'message' in data))) {
        const errObj: any = {
            name: data.name || (data.constructor ? data.constructor.name : 'Object'),
            message: data.message || String(data),
            stack: (data as any).stack
        };

        // Capture all enumerable and non-enumerable properties
        const props = Object.getOwnPropertyNames(data);
        props.forEach(prop => {
            if (prop !== 'name' && prop !== 'message' && prop !== 'stack') {
                try {
                    errObj[prop] = (data as any)[prop];
                } catch (e) { /* ignore */ }
            }
        });

        const redacted: any = {};
        for (const key in errObj) {
            const isSensitive = SENSITIVE_FIELDS.some(field =>
                key.toLowerCase().includes(field.toLowerCase())
            );
            if (isSensitive) {
                redacted[key] = '[REDACTED]';
            } else if (typeof errObj[key] === 'object' && errObj[key] !== null) {
                redacted[key] = redactSensitiveData(errObj[key], visited);
            } else {
                redacted[key] = errObj[key];
            }
        }
        return redacted;
    }

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => redactSensitiveData(item, visited));
    }

    // Handle objects
    const redacted: any = {};
    for (const key in data) {
        // Check if field name is sensitive
        const isSensitive = SENSITIVE_FIELDS.some(field =>
            key.toLowerCase().includes(field.toLowerCase())
        );

        if (isSensitive) {
            redacted[key] = '[REDACTED]';
        } else if (typeof data[key] === 'object' && data[key] !== null) {
            // Recursively redact nested objects
            redacted[key] = redactSensitiveData(data[key], visited);
        } else {
            redacted[key] = data[key];
        }
    }

    return redacted;
}

/**
 * Log info message (only in development)
 */
export function logInfo(message: string, data?: any) {
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
export function logSensitive(message: string, data: any) {
    if (!IS_PRODUCTION) {
        const redacted = redactSensitiveData(data);
        console.log(message, redacted);
    }
}

/**
 * Log warning (shown in production)
 */
export function logWarn(message: string, data?: any) {
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
export function logError(message: string, error: any) {
    if (error && typeof error === 'object') {
        const redacted = redactSensitiveData(error);
        try {
            // Stringify to ensure it doesn't log as [object Object] in restricted environments
            console.error(message, JSON.stringify(redacted, null, 2));
        } catch (e) {
            console.error(message, redacted); // Fallback
        }
    } else {
        console.error(message, error);
    }
}

/**
 * Log security event (always logged, always redacted)
 */
export function logSecurity(event: string, details: any) {
    const redacted = redactSensitiveData(details);
    console.log(`[SECURE] [SECURITY] ${event}`, redacted);
}

/**
 * Development-only debug log
 */
export function logDebug(message: string, data?: any) {
    if (!IS_PRODUCTION && import.meta.env.DEV) {
        console.debug(message, data);
    }
}
