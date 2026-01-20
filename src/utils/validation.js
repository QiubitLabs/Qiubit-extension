/**
 * Octra Wallet Validation Utilities
 * Centralized regex and validation logic for addresses, keys, and inputs.
 */

export const ADDRESS_REGEX = /^oct[1-9A-HJ-NP-Za-km-z]{43,44}$/;
export const PRIVATE_KEY_REGEX = /^(0x)?[a-fA-F0-9]{64}$/;
export const MNEMONIC_LENGTHS = [12, 15, 18, 21, 24];

/**
 * Validate Octra Wallet Address
 */
export function isValidAddress(address) {
    if (!address) return false;
    return ADDRESS_REGEX.test(address);
}

/**
 * Validate Private Key
 */
export function isValidPrivateKey(pk) {
    if (!pk) return false;
    return PRIVATE_KEY_REGEX.test(pk);
}

/**
 * Validate Mnemonic Phrase
 */
export function isValidMnemonic(mnemonic) {
    if (!mnemonic) return false;
    const words = mnemonic.trim().split(/\s+/);
    return MNEMONIC_LENGTHS.includes(words.length);
}

/**
 * Validate Amount
 */
export function isValidAmount(amount) {
    const val = parseFloat(amount);
    return !isNaN(val) && val > 0;
}

/**
 * Get password strength
 * @returns {object} { level: 'weak'|'fair'|'good'|'strong', percent: number, label: string }
 */
export function calculatePasswordStrength(password) {
    if (!password || typeof password !== 'string') return { level: 'weak', percent: 0, label: 'Very Weak' };

    let score = 0;
    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[0-9]/.test(password)) score += 25;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;

    if (password.length < 8) {
        return { level: 'weak', percent: Math.max(5, Math.min(score, 20)), label: 'Too Short' };
    }

    if (score <= 25) return { level: 'weak', percent: 25, label: 'Weak' };
    if (score <= 50) return { level: 'fair', percent: 50, label: 'Fair' };
    if (score <= 75) return { level: 'good', percent: 75, label: 'Good' };
    return { level: 'strong', percent: 100, label: 'Strong' };
}
