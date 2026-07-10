/**
 * SolanaSendService — native SOL and SPL token transfers.
 *
 * Built directly on @solana/web3.js (no @solana/spl-token dependency):
 * associated token accounts are derived with findProgramAddressSync and the
 * TransferChecked / CreateAssociatedTokenAccount instructions are encoded
 * by hand. Supports both the classic Token program and Token-2022 (the mint
 * account's owner decides which program is used).
 */

import type { Token } from "../../types";
import { getSolanaEndpoints } from "./SolanaRpcService";

const SOLANA_RPC_URLS = getSolanaEndpoints();

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/** Decimal string → raw bigint without float precision loss ("1.5", 9 → 1500000000n). */
export function toRawAmount(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

async function getConnection() {
  const { Connection } = await import("@solana/web3.js");
  let lastErr: unknown;
  for (const url of SOLANA_RPC_URLS) {
    try {
      const conn = new Connection(url, "confirmed");
      await conn.getLatestBlockhash();
      return conn;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No Solana RPC endpoint reachable");
}

export async function sendSolanaTransaction(params: {
  privateKeyHex: string;
  recipient: string;
  amount: string;
  token: Token;
}): Promise<string> {
  const { privateKeyHex, recipient, amount, token } = params;
  const web3 = await import("@solana/web3.js");
  const { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = web3;

  const connection = await getConnection();
  const seedBytes = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  const keypair = Keypair.fromSeed(seedBytes);
  const fromPubkey = keypair.publicKey;
  const toPubkey = new PublicKey(recipient);

  const isNativeSol =
    token.isNative === true ||
    !token.contractAddress ||
    token.contractAddress === "solana";

  const tx = new Transaction();

  if (isNativeSol) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: toRawAmount(amount, 9),
      }),
    );
  } else {
    const mint = new PublicKey(token.contractAddress!);

    // The mint account's owner tells us which token program to use
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) throw new Error("Token mint account not found on Solana");
    const owner = mintInfo.owner.toBase58();
    if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) {
      throw new Error("Unsupported Solana token program: " + owner);
    }
    const tokenProgramId = new PublicKey(owner);
    const ataProgramId = new PublicKey(ASSOCIATED_TOKEN_PROGRAM);

    const getAta = (ownerKey: InstanceType<typeof PublicKey>) =>
      PublicKey.findProgramAddressSync(
        [ownerKey.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
        ataProgramId,
      )[0];

    const sourceAta = getAta(fromPubkey);
    const destAta = getAta(toPubkey);

    // Create the recipient's associated token account when it doesn't exist
    const destInfo = await connection.getAccountInfo(destAta);
    if (!destInfo) {
      tx.add(
        new TransactionInstruction({
          programId: ataProgramId,
          keys: [
            { pubkey: fromPubkey, isSigner: true, isWritable: true },
            { pubkey: destAta, isSigner: false, isWritable: true },
            { pubkey: toPubkey, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
          ],
          data: Buffer.alloc(0),
        }),
      );
    }

    const decimals = token.decimals ?? 9;
    const rawAmount = toRawAmount(amount, decimals);

    // TransferChecked: [12, u64 amount LE, u8 decimals]
    const data = Buffer.alloc(10);
    data.writeUInt8(12, 0);
    data.writeBigUInt64LE(rawAmount, 1);
    data.writeUInt8(decimals, 9);

    tx.add(
      new TransactionInstruction({
        programId: tokenProgramId,
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destAta, isSigner: false, isWritable: true },
          { pubkey: fromPubkey, isSigner: true, isWritable: false },
        ],
        data,
      }),
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  tx.feePayer = fromPubkey;
  tx.recentBlockhash = blockhash;
  tx.sign(keypair);

  return connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}
