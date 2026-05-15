const { ethers } = require('ethers');

// Mock mnemonic
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const index = 0;

try {
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
    console.log("Derived EVM Address:", wallet.address);
    console.log("Expected EVM Address for 'abandon...about': 0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    if (wallet.address.toLowerCase() === "0x9858EfFD232B4033E47d90003D41EC34EcaEda94".toLowerCase()) {
        console.log("SUCCESS: EVM address derivation is correct according to BIP44.");
    } else {
        console.log("ERROR: Address mismatch.");
    }
} catch (e) {
    console.error('Failed to derive EVM address:', e);
}