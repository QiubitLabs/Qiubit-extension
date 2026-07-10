/**
 * LOGIC: Provides secure log routing. It automatically scans logs for private keys, recovery phrases, seeds, and passwords and replaces them with '[REDACTED]' before printout.
 * Includes circular reference checking, custom error object handling, and levels (info, warn, error, security, debug) aligned with environment execution (production vs development).
 * EXPORTS:
 *   - redactSensitiveData (function)
 *   - logInfo (function)
 *   - logSensitive (function)
 *   - logWarn (function)
 *   - logError (function)
 *   - logSecurity (function)
 *   - logDebug (function)
 * FUNCTIONS:
 *   - redactSensitiveData(data, visited): Recursively walks through arrays and objects, checking if keys are listed in a sensitive list, replacing matches with '[REDACTED]', while avoiding circular dependency loops.
 *   - logInfo(message, data) / logSensitive(message, data) / logDebug(message, data): Console logs details only in development.
 *   - logWarn(message, data) / logError(message, error) / logSecurity(event, details): Console logs warnings/errors/security details in all environments with automatic redaction applied.
 */

const IS_PRODUCTION = import.meta.env.PROD;

const SENSITIVE_FIELDS = [
  "privateKey",
  "private_key",
  "privateKeyB64",
  "password",
  "seed",
  "mnemonic",
  "secretKey",
  "secret_key",
  "tempPassword",
  "temp_password",
  "encryptedPassword",
  "from_private_key",
  "to_private_key",
];

/**
 * Redact sensitive data from objects
 */
export function redactSensitiveData(data: any, visited = new WeakSet()): any {
  if (!data) return data;

  if (typeof data !== "object") {
    return data;
  }

  if (visited.has(data)) {
    return "[CIRCULAR]";
  }
  visited.add(data);

  if (
    data instanceof Error ||
    (typeof data === "object" && ("name" in data || "message" in data))
  ) {
    const errObj: any = {
      name: data.name || (data.constructor ? data.constructor.name : "Object"),
      message: data.message || String(data),
      stack: (data as any).stack,
    };

    const props = Object.getOwnPropertyNames(data);
    props.forEach((prop) => {
      if (prop !== "name" && prop !== "message" && prop !== "stack") {
        try {
          errObj[prop] = (data as any)[prop];
        } catch (e) {
          /* ignore */
        }
      }
    });

    const redacted: any = {};
    for (const key in errObj) {
      const isSensitive = SENSITIVE_FIELDS.some((field) =>
        key.toLowerCase().includes(field.toLowerCase()),
      );
      if (isSensitive) {
        redacted[key] = "[REDACTED]";
      } else if (typeof errObj[key] === "object" && errObj[key] !== null) {
        redacted[key] = redactSensitiveData(errObj[key], visited);
      } else {
        redacted[key] = errObj[key];
      }
    }
    return redacted;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, visited));
  }

  const redacted: any = {};
  for (const key in data) {
    const isSensitive = SENSITIVE_FIELDS.some((field) =>
      key.toLowerCase().includes(field.toLowerCase()),
    );

    if (isSensitive) {
      redacted[key] = "[REDACTED]";
    } else if (typeof data[key] === "object" && data[key] !== null) {
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
  if (error && typeof error === "object") {
    const redacted = redactSensitiveData(error);
    try {
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
