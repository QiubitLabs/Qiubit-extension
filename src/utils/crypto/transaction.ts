import nacl from 'tweetnacl';
import { getRpcClient } from '../../services/network/RpcService';
import { base64ToBuffer, bufferToBase64, bufferToHex, sha256 } from './format';

export interface TransactionPayload {
    from: string;
    to_: string;
    amount: string;
    nonce: number;
    ou: string;
    timestamp: number;
    op_type: string;
    signature?: string;
    public_key?: string;
    encrypted_data?: string;
    message?: string | null;
}

/**
 * JSON escape - matches CLI json_escape() from tx_builder.hpp
 */
function jsonEscape(s: string): string {
    let r = '';
    for (const c of s) {
        switch (c) {
            case '"':  r += '\\"'; break;
            case '\\': r += '\\\\'; break;
            case '\b': r += '\\b'; break;
            case '\f': r += '\\f'; break;
            case '\n': r += '\\n'; break;
            case '\r': r += '\\r'; break;
            case '\t': r += '\\t'; break;
            default:   r += c;
        }
    }
    return r;
}

/**
 * Format timestamp to match CLI format_timestamp()
 * CLI uses: nlohmann::json j = ts; j.dump()
 * This outputs the double with full precision, no trailing zeros
 */
function formatTimestamp(ts: number): string {
    // nlohmann::json dumps doubles with enough precision
    // For example: 1715097600.123 becomes "1715097600.123"
    // Integer timestamps: 1715097600 becomes "1715097600.0"
    // We need to match this exactly
    const str = ts.toString();
    if (!str.includes('.')) {
        // nlohmann::json always adds .0 for integer doubles
        return str + '.0';
    }
    return str;
}

/**
 * Canonical JSON serialization - EXACT port of CLI canonical_json() from tx_builder.hpp
 * 
 * Field order MUST be:
 *   from, to_, amount, nonce, ou, timestamp, op_type, [encrypted_data], [message]
 * 
 * This is what gets signed - any deviation = signature mismatch = tx rejected
 */
export function canonicalJson(tx: TransactionPayload): string {
    let s = '{"from":"' + jsonEscape(tx.from) + '"'
        + ',"to_":"' + jsonEscape(tx.to_) + '"'
        + ',"amount":"' + jsonEscape(tx.amount) + '"'
        + ',"nonce":' + tx.nonce
        + ',"ou":"' + jsonEscape(tx.ou) + '"'
        + ',"timestamp":' + formatTimestamp(tx.timestamp)
        + ',"op_type":"' + jsonEscape(tx.op_type || 'standard') + '"';

    if (tx.encrypted_data) {
        s += ',"encrypted_data":"' + jsonEscape(tx.encrypted_data) + '"';
    }
    if (tx.message) {
        s += ',"message":"' + jsonEscape(tx.message) + '"';
    }
    s += '}';
    return s;
}

/**
 * Sign a message with private key (Ed25519 detached signature)
 * Matches CLI ed25519_sign_detached() from tx_builder.hpp
 */
export function signMessage(message: string | Uint8Array, privateKeyB64: string): string {
    const privateKey = base64ToBuffer(privateKeyB64);
    const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(privateKey));

    const messageBytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;

    const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
    return bufferToBase64(signature);
}

/**
 * Verify a signature
 */
export function verifySignature(message: string | Uint8Array, signature: string, publicKeyB64: string): boolean {
    const publicKey = base64ToBuffer(publicKeyB64);
    const signatureBytes = base64ToBuffer(signature);

    const messageBytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;

    return nacl.sign.detached.verify(messageBytes, new Uint8Array(signatureBytes), new Uint8Array(publicKey));
}

/**
 * Get current timestamp in seconds as double
 * Matches CLI now_ts() = chrono::system_clock seconds with fractional part
 */
function nowTimestamp(): number {
    return Date.now() / 1000;
}

/**
 * Parse amount string to raw micro-units (integer string)
 * Matches CLI parse_amount_raw() from main.cpp
 * 
 * "1.5" -> "1500000"
 * "0.001" -> "1000"
 * "100" -> "100000000"
 */
export function parseAmountToRaw(amount: string | number): string {
    let s = typeof amount === 'number' ? amount.toString() : amount;

    // Handle scientific notation
    if (s.includes('e') || s.includes('E')) {
        s = Number(amount).toFixed(20);
    }

    const dot = s.indexOf('.');
    if (dot === -1) {
        // Integer: multiply by 1,000,000
        for (const c of s) {
            if (c < '0' || c > '9') throw new Error('Invalid amount character');
        }
        const v = BigInt(s);
        return (v * 1000000n).toString();
    }

    let integerPart = s.substring(0, dot);
    let fracPart = s.substring(dot + 1);

    // Validate characters
    for (const c of integerPart) {
        if (c < '0' || c > '9') throw new Error('Invalid amount character');
    }
    for (const c of fracPart) {
        if (c < '0' || c > '9') throw new Error('Invalid amount character');
    }

    // Truncate or pad fractional part to 6 digits
    if (fracPart.length > 6) {
        fracPart = fracPart.substring(0, 6);
    }
    while (fracPart.length < 6) {
        fracPart += '0';
    }

    const ip = integerPart === '' ? 0n : BigInt(integerPart);
    const fp = BigInt(fracPart);
    return (ip * 1000000n + fp).toString();
}

/**
 * Create and sign a transaction
 * Matches CLI /api/send handler from main.cpp:
 *   1. Parse amount to raw micro-units
 *   2. Get nonce from RPC
 *   3. Build Transaction struct with op_type="standard"
 *   4. canonical_json(tx) -> sign -> submit
 */
export async function createTransaction(
    from: string,
    to: string,
    amount: string | number,
    nonce: number | string,
    privateKeyB64: string,
    message: string | null = null,
    fee: string | null = null,
    opType: string = 'standard',
    encryptedData: string | null = null
): Promise<TransactionPayload> {
    // Convert amount to raw micro-units string
    const amountRaw = parseAmountToRaw(amount);

    // Operation Unit (ou) calculation
    const microUnits = 1_000_000;
    let ouValue: string;

    if (fee !== null) {
        ouValue = String(Math.floor(parseFloat(fee) * microUnits));
    } else {
        try {
            const rpc = getRpcClient();
            const estimates = await rpc.getFeeEstimate(parseFloat(String(amount)));
            ouValue = String(Math.floor(estimates.medium * microUnits));
        } catch {
            // Fallback matches CLI: 10000 for small, 30000 for large
            const rawNum = BigInt(amountRaw);
            ouValue = rawNum < 1000000000n ? '10000' : '30000';
        }
    }

    const tx: TransactionPayload = {
        from,
        to_: to,
        amount: amountRaw,
        nonce: typeof nonce === 'string' ? parseInt(nonce) : nonce,
        ou: ouValue,
        timestamp: nowTimestamp(),
        op_type: opType,
    };

    if (encryptedData) {
        tx.encrypted_data = encryptedData;
    }
    if (message) {
        tx.message = message;
    }

    // Create canonical JSON and sign it
    const canonicalMsg = canonicalJson(tx);
    const signature = signMessage(canonicalMsg, privateKeyB64);

    // Get public key
    const privateKey = base64ToBuffer(privateKeyB64);
    const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(privateKey));
    const publicKeyB64 = bufferToBase64(keyPair.publicKey);

    return {
        ...tx,
        signature,
        public_key: publicKeyB64
    };
}

/**
 * Compute transaction hash
 * Matches CLI tx_hash(): sha256(canonical_json(tx)) -> hex
 */
export async function computeTxHash(tx: TransactionPayload): Promise<string> {
    const canonical = canonicalJson(tx);
    const hash = await sha256(canonical);
    return bufferToHex(hash);
}

/**
 * Sign a balance request
 * Matches CLI sign_balance_request(): sign("octra_encryptedBalance|{addr}")
 */
export function signBalanceRequest(address: string, privateKeyB64: string): string {
    const msg = 'octra_encryptedBalance|' + address;
    return signMessage(msg, privateKeyB64);
}

/**
 * Sign a register pubkey request
 * Matches CLI: sign("register_pubkey:{addr}")
 */
export function signRegisterPubkeyRequest(address: string, privateKeyB64: string): string {
    const msg = 'register_pubkey:' + address;
    return signMessage(msg, privateKeyB64);
}
