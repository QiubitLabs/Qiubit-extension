/**
 * pvacWasm.ts — lazy loader for the pvac FHE WASM module.
 *
 * All binary data crosses the JS/WASM boundary as lowercase hex strings.
 * The module is loaded once and cached for the lifetime of the page.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PvacModule = any;

let _modulePromise: Promise<PvacModule> | null = null;

function loadModule(): Promise<PvacModule> {
    if (!_modulePromise) {
        _modulePromise = new Promise((resolve, reject) => {
            // PvacModule is injected by pvac_wasm.js via MODULARIZE=1
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const global = globalThis as any;
            if (typeof global.PvacModule !== 'function') {
                reject(new Error('pvac_wasm.js not loaded — add <script src="pvac_wasm.js"> first'));
                return;
            }
            global.PvacModule().then(resolve).catch(reject);
        });
    }
    return _modulePromise;
}

export interface PvacKeyPair {
    pk: string;
    sk: string;
}

function randomSeedHex(): string {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Generate a key pair from a 32-byte random seed (hex). Deterministic. */
export async function pvacKeygen(seedHex?: string): Promise<PvacKeyPair> {
    const m = await loadModule();
    const seed = seedHex ?? randomSeedHex();
    const raw = m.keygen(seed) as string;
    return JSON.parse(raw) as PvacKeyPair;
}

/** Encrypt a uint64 value (passed as number, safe up to 2^53). Returns ciphertext hex. */
export async function pvacEncrypt(
    pk: string,
    sk: string,
    value: number,
    seedHex?: string,
): Promise<string> {
    const m = await loadModule();
    const seed = seedHex ?? randomSeedHex();
    return m.encrypt(pk, sk, value, seed) as string;
}

/** Decrypt a ciphertext hex. Returns the plaintext as a number. */
export async function pvacDecrypt(
    pk: string,
    sk: string,
    ciphertextHex: string,
): Promise<number> {
    const m = await loadModule();
    return m.decrypt(pk, sk, ciphertextHex) as number;
}

/**
 * Homomorphic add: enc(a) + enc(b) → enc(a+b).
 * Used for transfer: recipient's new balance = old balance + transfer amount.
 */
export async function pvacAdd(
    pk: string,
    aHex: string,
    bHex: string,
): Promise<string> {
    const m = await loadModule();
    return m.addCiphers(pk, aHex, bHex) as string;
}

/**
 * Homomorphic sub: enc(a) - enc(b) → enc(a-b).
 * Used for transfer: sender's new balance = old balance - transfer amount.
 */
export async function pvacSub(
    pk: string,
    aHex: string,
    bHex: string,
): Promise<string> {
    const m = await loadModule();
    return m.subCiphers(pk, aHex, bHex) as string;
}

/** Create a zero-knowledge proof that the encrypted value equals zero. */
export async function pvacMakeZeroProof(
    pk: string,
    sk: string,
    ciphertextHex: string,
): Promise<string> {
    const m = await loadModule();
    return m.makeZeroProof(pk, sk, ciphertextHex) as string;
}

/** Verify a zero-proof without revealing the plaintext. */
export async function pvacVerifyZero(
    pk: string,
    ciphertextHex: string,
    proofHex: string,
): Promise<boolean> {
    const m = await loadModule();
    return m.verifyZero(pk, ciphertextHex, proofHex) as boolean;
}

/** Create a range proof proving value ∈ [0, 2^64) without revealing it. */
export async function pvacMakeRangeProof(
    pk: string,
    sk: string,
    ciphertextHex: string,
    value: number,
): Promise<string> {
    const m = await loadModule();
    return m.makeRangeProof(pk, sk, ciphertextHex, value) as string;
}

/** Verify a range proof. Accepts both legacy and aggregated formats. */
export async function pvacVerifyRange(
    pk: string,
    ciphertextHex: string,
    proofHex: string,
): Promise<boolean> {
    const m = await loadModule();
    return m.verifyRange(pk, ciphertextHex, proofHex) as boolean;
}

/**
 * High-level helper: encrypt a transfer amount and produce updated balances.
 *
 * @param senderPk     Sender's public key hex
 * @param senderSk     Sender's secret key hex
 * @param encBalance   Sender's current encrypted balance (ciphertext hex)
 * @param amount       Transfer amount (plaintext, will be encrypted)
 * @returns            { encNewSenderBalance, encAmount, rangeProof }
 */
export async function pvacBuildTransfer(
    senderPk: string,
    senderSk: string,
    encBalance: string,
    amount: number,
): Promise<{
    encNewSenderBalance: string;
    encAmount: string;
    rangeProof: string;
}> {
    const encAmount = await pvacEncrypt(senderPk, senderSk, amount);
    const encNewSenderBalance = await pvacSub(senderPk, encBalance, encAmount);
    const rangeProof = await pvacMakeRangeProof(senderPk, senderSk, encNewSenderBalance, 0);
    return { encNewSenderBalance, encAmount, rangeProof };
}
