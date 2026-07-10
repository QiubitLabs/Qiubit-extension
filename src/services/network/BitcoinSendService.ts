/**
 * BitcoinSendService — real P2WPKH (BIP-84) transfers without bitcoinjs-lib.
 *
 * UTXOs and fee rates come from mempool.space (blockstream.info fallback).
 * The transaction is serialized by hand: BIP-143 sighash per input, ECDSA
 * via ethers.SigningKey (low-s), DER encoding, SegWit witness. Recipient
 * outputs support bech32 v0 (P2WPKH/P2WSH), bech32m v1 (P2TR), and legacy
 * base58 (P2PKH/P2SH).
 */

import { ethers } from "ethers";
import { sha256 } from "@noble/hashes/sha256";
import { ripemd160 } from "@noble/hashes/ripemd160";

const API_BASES = ["https://mempool.space/api", "https://blockstream.info/api"];

const DUST_LIMIT = 546n; // sats
const DEFAULT_FEE_RATE = 10; // sat/vB when estimators are unreachable
const SEQUENCE_RBF = 0xfffffffd;

// ─── small helpers ──────────────────────────────────────────────────────────

function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex.replace(/^0x/i, ""), "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, n >> 8]);
  throw new Error("varint too large for a wallet transaction");
}

/** BTC decimal string → satoshis without float drift. */
export function btcToSats(amount: string): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "00000000").slice(0, 8);
  return BigInt(whole || "0") * 100_000_000n + BigInt(fracPadded || "0");
}

// ─── address decoding → output script ───────────────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1)
        chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function decodeBech32(address: string): { version: number; program: Uint8Array } {
  const lower = address.toLowerCase();
  const sep = lower.lastIndexOf("1");
  if (sep < 1 || sep + 7 > lower.length) throw new Error("Malformed bech32 address");
  const hrp = lower.slice(0, sep);
  if (hrp !== "bc") throw new Error("Not a Bitcoin mainnet address");
  const data: number[] = [];
  for (const ch of lower.slice(sep + 1)) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v === -1) throw new Error("Invalid bech32 character");
    data.push(v);
  }
  const checksum = bech32Polymod(bech32HrpExpand(hrp).concat(data));
  const version = data[0];
  const expected = version === 0 ? 1 : 0x2bc830a3; // bech32 vs bech32m
  if (checksum !== expected) throw new Error("Invalid bech32 checksum");

  const words = data.slice(1, -6);
  let acc = 0;
  let bits = 0;
  const program: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      program.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc << (8 - bits)) & 0xff)
    throw new Error("Invalid bech32 padding");
  return { version, program: new Uint8Array(program) };
}

function decodeBase58Check(address: string): { prefix: number; hash: Uint8Array } {
  let num = 0n;
  for (const ch of address) {
    const v = BASE58_ALPHABET.indexOf(ch);
    if (v === -1) throw new Error("Invalid base58 character");
    num = num * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const ch of address) {
    if (ch === "1") bytes.unshift(0);
    else break;
  }
  const full = new Uint8Array(bytes);
  if (full.length !== 25) throw new Error("Invalid base58 address length");
  const payload = full.slice(0, 21);
  const checksum = full.slice(21);
  const expect = sha256d(payload).slice(0, 4);
  if (!checksum.every((b, i) => b === expect[i]))
    throw new Error("Invalid base58 checksum");
  return { prefix: payload[0], hash: payload.slice(1) };
}

function addressToScript(address: string): Uint8Array {
  if (address.toLowerCase().startsWith("bc1")) {
    const { version, program } = decodeBech32(address);
    if (version === 0 && (program.length === 20 || program.length === 32)) {
      return concat(new Uint8Array([0x00, program.length]), program);
    }
    if (version === 1 && program.length === 32) {
      return concat(new Uint8Array([0x51, 0x20]), program); // P2TR
    }
    throw new Error("Unsupported witness program");
  }
  const { prefix, hash } = decodeBase58Check(address);
  if (prefix === 0x00) {
    // P2PKH: OP_DUP OP_HASH160 <20> OP_EQUALVERIFY OP_CHECKSIG
    return concat(new Uint8Array([0x76, 0xa9, 0x14]), hash, new Uint8Array([0x88, 0xac]));
  }
  if (prefix === 0x05) {
    // P2SH: OP_HASH160 <20> OP_EQUAL
    return concat(new Uint8Array([0xa9, 0x14]), hash, new Uint8Array([0x87]));
  }
  throw new Error("Unsupported Bitcoin address type");
}

// ─── network I/O ────────────────────────────────────────────────────────────

interface Utxo {
  txid: string;
  vout: number;
  value: number; // sats
}

async function fetchUtxos(address: string): Promise<Utxo[]> {
  let lastErr: unknown;
  for (const base of API_BASES) {
    try {
      const resp = await fetch(`${base}/address/${address}/utxo`);
      if (!resp.ok) throw new Error(`UTXO fetch HTTP ${resp.status}`);
      return (await resp.json()) as Utxo[];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Unable to fetch Bitcoin UTXOs");
}

async function fetchFeeRate(): Promise<number> {
  try {
    const resp = await fetch("https://mempool.space/api/v1/fees/recommended");
    if (resp.ok) {
      const fees = await resp.json();
      if (typeof fees.halfHourFee === "number") return fees.halfHourFee;
    }
  } catch {}
  try {
    const resp = await fetch("https://blockstream.info/api/fee-estimates");
    if (resp.ok) {
      const fees = await resp.json();
      if (typeof fees["3"] === "number") return Math.ceil(fees["3"]);
    }
  } catch {}
  return DEFAULT_FEE_RATE;
}

async function broadcast(txHex: string): Promise<string> {
  let lastErr: unknown;
  for (const base of API_BASES) {
    try {
      const resp = await fetch(`${base}/tx`, { method: "POST", body: txHex });
      const text = await resp.text();
      if (!resp.ok) throw new Error(text || `Broadcast HTTP ${resp.status}`);
      return text.trim(); // txid
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Unable to broadcast Bitcoin transaction");
}

// ─── signing ────────────────────────────────────────────────────────────────

function derEncode(rHex: string, sHex: string): Uint8Array {
  const trim = (hex: string): Uint8Array => {
    let b = hexToBytes(hex);
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    return b[0] & 0x80 ? concat(new Uint8Array([0]), b) : b;
  };
  const r = trim(rHex);
  const s = trim(sHex);
  return concat(
    new Uint8Array([0x30, r.length + s.length + 4, 0x02, r.length]),
    r,
    new Uint8Array([0x02, s.length]),
    s,
  );
}

export async function sendBitcoinTransaction(params: {
  privateKeyHex: string;
  sender: string;
  recipient: string;
  amount: string;
}): Promise<string> {
  const { privateKeyHex, sender, recipient, amount } = params;
  const amountSats = btcToSats(amount);
  if (amountSats < DUST_LIMIT)
    throw new Error("Amount is below the Bitcoin dust limit (546 sats).");

  const signingKey = new ethers.SigningKey("0x" + privateKeyHex.replace(/^0x/i, ""));
  const pubkey = hexToBytes(signingKey.compressedPublicKey);
  const pubkeyHash = ripemd160(sha256(pubkey));
  const senderScript = concat(new Uint8Array([0x00, 0x14]), pubkeyHash);

  // Sanity check: the derived key must control the sender address
  const derived = bytesToHex(pubkeyHash);
  const senderProgram = bytesToHex(decodeBech32(sender).program);
  if (derived !== senderProgram)
    throw new Error("Bitcoin key does not match the sender address.");

  const recipientScript = addressToScript(recipient);
  const [utxos, feeRate] = await Promise.all([fetchUtxos(sender), fetchFeeRate()]);
  if (utxos.length === 0) throw new Error("No spendable Bitcoin UTXOs found.");

  // Largest-first selection; fee grows with each input (P2WPKH ≈ 68 vB)
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const outVBytes = 11 + recipientScript.length + 9 + senderScript.length + 9;
  const feeFor = (nIn: number) => BigInt(Math.ceil((outVBytes + nIn * 68) * feeRate));

  const selected: Utxo[] = [];
  let inputSum = 0n;
  for (const u of sorted) {
    selected.push(u);
    inputSum += BigInt(u.value);
    if (inputSum >= amountSats + feeFor(selected.length)) break;
  }
  const fee = feeFor(selected.length);
  if (inputSum < amountSats + fee)
    throw new Error("Insufficient Bitcoin balance to cover amount plus network fee.");

  const change = inputSum - amountSats - fee;
  const outputs: { value: bigint; script: Uint8Array }[] = [
    { value: amountSats, script: recipientScript },
  ];
  if (change >= DUST_LIMIT) outputs.push({ value: change, script: senderScript });

  // ── BIP-143 shared hashes ──
  const outpoints = selected.map((u) =>
    concat(hexToBytes(u.txid).reverse(), u32le(u.vout)),
  );
  const hashPrevouts = sha256d(concat(...outpoints));
  const hashSequence = sha256d(concat(...selected.map(() => u32le(SEQUENCE_RBF))));
  const serializedOutputs = concat(
    ...outputs.map((o) => concat(u64le(o.value), varint(o.script.length), o.script)),
  );
  const hashOutputs = sha256d(serializedOutputs);
  // scriptCode for P2WPKH: standard P2PKH template around the pubkey hash
  const scriptCode = concat(
    new Uint8Array([0x19, 0x76, 0xa9, 0x14]),
    pubkeyHash,
    new Uint8Array([0x88, 0xac]),
  );

  const witnesses: Uint8Array[] = selected.map((u, i) => {
    const preimage = concat(
      u32le(2),
      hashPrevouts,
      hashSequence,
      outpoints[i],
      scriptCode,
      u64le(BigInt(u.value)),
      u32le(SEQUENCE_RBF),
      hashOutputs,
      u32le(0), // locktime
      u32le(1), // SIGHASH_ALL
    );
    const digest = sha256d(preimage);
    const sig = signingKey.sign("0x" + bytesToHex(digest));
    const der = concat(derEncode(sig.r, sig.s), new Uint8Array([0x01]));
    return concat(
      new Uint8Array([0x02]), // two witness items
      varint(der.length),
      der,
      varint(pubkey.length),
      pubkey,
    );
  });

  // ── final serialization (SegWit) ──
  const tx = concat(
    u32le(2),
    new Uint8Array([0x00, 0x01]), // marker + flag
    varint(selected.length),
    ...selected.map((_, i) =>
      concat(outpoints[i], new Uint8Array([0x00]), u32le(SEQUENCE_RBF)),
    ),
    varint(outputs.length),
    serializedOutputs,
    ...witnesses,
    u32le(0), // locktime
  );

  return broadcast(bytesToHex(tx));
}
