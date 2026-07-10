/**
 * LOGIC: Coordinates the database and settings migration pipeline.
 * Keeps an registry index of migration files, tracks the current schema execution version, and runs pending migrations in order (aborting early on error).
 * EXPORTS:
 *   - Migration (interface)
 *   - runMigrations (async function)
 * FUNCTIONS:
 *   - getCurrentVersion(): Reads the applied migration version integer from storage.
 *   - setCurrentVersion(version): Writes the new migration version integer to storage.
 *   - runMigrations(): Determines which migrations in the registry have versions larger than the stored version, runs them in sequence, and updates the version tracker.
 */

import { storage } from "../utils/storage/adapter";
import migration001 from "./001_localstorage_to_indexeddb";
import migration002 from "./002_evm_hist_v0_cleanup";
import migration003 from "./003_eth_lastblock_reset";
import migration004 from "./004_fix_pending_txs";

const MIGRATION_VERSION_KEY = "migration_version";

export interface Migration {
  version: number;
  name: string;
  up(): Promise<void>;
}

const ALL_MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
];

async function getCurrentVersion(): Promise<number> {
  try {
    const result = await storage.get(MIGRATION_VERSION_KEY);
    const stored = result[MIGRATION_VERSION_KEY];
    return typeof stored === "number" ? stored : 0;
  } catch {
    return 0;
  }
}

async function setCurrentVersion(version: number): Promise<void> {
  await storage.set({ [MIGRATION_VERSION_KEY]: version });
}

/**
 * Run all pending migrations in order.
 * Safe to call on every app start — already-applied migrations are skipped.
 */
export async function runMigrations(): Promise<void> {
  const currentVersion = await getCurrentVersion();
  const pending = ALL_MIGRATIONS.filter((m) => m.version > currentVersion);

  if (pending.length === 0) return;

  for (const migration of pending) {
    try {
      await migration.up();
      await setCurrentVersion(migration.version);
    } catch (err) {
      console.error(
        `[Migration] Failed at v${migration.version} (${migration.name}):`,
        err,
      );
      break;
    }
  }
}
