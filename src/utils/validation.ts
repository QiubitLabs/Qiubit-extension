/**
 * LOGIC: Provides validation checks for UI input screens, checking formatting rules for addresses, keys, recovery phrases, transfer amounts, and measuring password strength.
 * EXPORTS:
 *   - ADDRESS_REGEX (const RegExp)
 *   - EVM_ADDRESS_REGEX (const RegExp)
 *   - PRIVATE_KEY_REGEX (const RegExp)
 *   - MNEMONIC_LENGTHS (const number[])
 *   - isValidAddress (function)
 *   - isValidEvmAddress (function)
 *   - isValidPrivateKey (function)
 *   - isValidMnemonic (function)
 *   - isValidAmount (function)
 *   - PasswordStrength (interface)
 *   - calculatePasswordStrength (function)
 * FUNCTIONS:
 *   - isValidAddress(address) / isValidEvmAddress(address): Regex validation tests.
 *   - isValidPrivateKey(pk): Tests if a private key matches EVM hex style.
 *   - isValidMnemonic(mnemonic): Splits words by whitespace and checks if total count matches standard counts.
 *   - isValidAmount(amount): Evaluates if value parses to a number greater than zero.
 *   - calculatePasswordStrength(password): Evaluates lengths and presence of uppercase, numbers, and special symbols to categorize password strength.
 */

export const ADDRESS_REGEX = /^oct[1-9A-HJ-NP-Za-km-z]{43,44}$/;
export const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const SUI_ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;
export const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const BITCOIN_ADDRESS_REGEX =
  /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,62})$/;
export const PRIVATE_KEY_REGEX = /^(0x)?[a-fA-F0-9]{64}$/;
export const MNEMONIC_LENGTHS = [12, 15, 18, 21, 24];

/**
 * Validate Qiubit Wallet Address
 */
export function isValidAddress(address: string): boolean {
  if (!address) return false;
  return ADDRESS_REGEX.test(address);
}

/**
 * Validate EVM Address
 */
export function isValidEvmAddress(address: string): boolean {
  if (!address) return false;
  return EVM_ADDRESS_REGEX.test(address);
}

/** Validate Solana address (base58, 32-44 chars). */
export function isValidSolanaAddress(address: string): boolean {
  if (!address) return false;
  return SOLANA_ADDRESS_REGEX.test(address);
}

/** Validate Sui address (0x + 64 hex). */
export function isValidSuiAddress(address: string): boolean {
  if (!address) return false;
  return SUI_ADDRESS_REGEX.test(address);
}

/** Validate Bitcoin address (P2PKH, P2SH, or bech32). */
export function isValidBitcoinAddress(address: string): boolean {
  if (!address) return false;
  return BITCOIN_ADDRESS_REGEX.test(address);
}

export type AddressNetwork = "octra" | "evm" | "solana" | "sui" | "bitcoin";

/**
 * Detect which network an address belongs to, or null if unrecognized.
 * Order matters: Octra ("oct…") and the two 0x formats (EVM 40-hex vs Sui
 * 64-hex) are unambiguous; Bitcoin's prefixes are checked before Solana
 * because short base58 strings can overlap.
 */
export function detectAddressNetwork(address: string): AddressNetwork | null {
  const a = (address || "").trim();
  if (!a) return null;
  if (isValidAddress(a)) return "octra";
  if (isValidEvmAddress(a)) return "evm";
  if (isValidSuiAddress(a)) return "sui";
  if (isValidBitcoinAddress(a)) return "bitcoin";
  if (isValidSolanaAddress(a)) return "solana";
  return null;
}

/**
 * Validate Private Key
 */
export function isValidPrivateKey(pk: string): boolean {
  if (!pk) return false;
  return PRIVATE_KEY_REGEX.test(pk);
}

/**
 * Validate Mnemonic Phrase
 */
export function isValidMnemonic(mnemonic: string): boolean {
  if (!mnemonic) return false;
  const words = mnemonic.trim().split(/\s+/);
  return MNEMONIC_LENGTHS.includes(words.length);
}

/**
 * Validate Amount
 */
export function isValidAmount(amount: string | number): boolean {
  const val = typeof amount === "string" ? parseFloat(amount) : amount;
  return !isNaN(val) && val > 0;
}

export interface PasswordStrength {
  level: "weak" | "fair" | "good" | "strong";
  percent: number;
  label: string;
}

/**
 * Get password strength
 * @returns {object} { level: 'weak'|'fair'|'good'|'strong', percent: number, label: string }
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password || typeof password !== "string")
    return { level: "weak", percent: 0, label: "Very Weak" };

  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 25;
  if (/[0-9]/.test(password)) score += 25;
  if (/[^A-Za-z0-9]/.test(password)) score += 25;

  if (password.length < 8) {
    return {
      level: "weak",
      percent: Math.max(5, Math.min(score, 20)),
      label: "Too Short",
    };
  }

  if (score <= 25) return { level: "weak", percent: 25, label: "Weak" };
  if (score <= 50) return { level: "fair", percent: 50, label: "Fair" };
  if (score <= 75) return { level: "good", percent: 75, label: "Good" };
  return { level: "strong", percent: 100, label: "Strong" };
}
