import { ethers } from 'ethers';

/**
 * Derive EVM address from mnemonic
 * Path: m/44'/60'/0'/0/index
 */
export function deriveEvmAddressFromMnemonic(mnemonic: string, index: number = 0): string {
    try {
        const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
        return wallet.address;
    } catch (e) {
        console.error('Failed to derive EVM address:', e);
        return '';
    }
}

/**
 * Derive both EVM address AND private key from mnemonic via BIP44.
 * Returns null on failure — callers should fall back gracefully.
 */
export function deriveEvmKeyFromMnemonic(mnemonic: string, index: number = 0): { address: string; privateKeyHex: string } | null {
    try {
        const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
        return {
            address: wallet.address,
            privateKeyHex: wallet.privateKey.startsWith('0x') ? wallet.privateKey.slice(2) : wallet.privateKey,
        };
    } catch {
        return null;
    }
}
