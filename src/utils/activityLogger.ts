/**
 * LOGIC: Activity Logger for Qiubit Wallet. Handles structured logging, database persistence, log retention, log exporting, and specific helper methods for tracking session and transactions.
 * EXPORTS:
 *   - LOG_LEVELS (const)
 *   - LogLevelString (type)
 *   - logActivity (async function)
 *   - getRecentActivities (async function)
 *   - getActivityStats (async function)
 *   - cleanupOldLogs (async function)
 *   - exportLogs (async function)
 *   - clearAllLogs (async function)
 *   - logWalletUnlock (async function)
 *   - logWalletLock (async function)
 *   - logTransactionInit (async function)
 *   - logTransactionSuccess (async function)
 *   - logTransactionFailed (async function)
 *   - logRPCCall (async function)
 *   - logRPCError (async function)
 *   - default (object containing all exports)
 * FUNCTIONS:
 *   - logActivity(action, metadata, level): Logs an event to IndexedDB, falling back to local storage if IndexedDB fails, and cleans up older logs.
 *   - getRecentActivities(limit, type, level): Retrieves logs filtered by type or level, sorted chronologically, with fallback support.
 *   - getActivityStats(): Computes statistics of logged actions (total logs, counts by type/level, and time range).
 *   - cleanupOldLogs(olderThanDays): Limits log volume and removes old logs (based on age or log limit count).
 *   - exportLogs(limit): Converts logs into JSON and prompts file download.
 *   - clearAllLogs(): Wipes logs from both IndexedDB and local storage.
 *   - logWalletUnlock, logWalletLock, logTransactionInit, logTransactionSuccess, logTransactionFailed, logRPCCall, logRPCError: Specialized logger wrappers for ease of use.
 */

import { putData, getDataByIndex, getAllData } from "./indexedDB";
import { clearStore } from "./indexedDB";
import { storage } from "./storage/adapter";
import { redactSensitiveData, logInfo } from "./logger";

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export type LogLevelString = "DEBUG" | "INFO" | "WARN" | "ERROR";

const MAX_LOGS = 1000; // Keep last 1000 entries
const LOG_RETENTION_DAYS = 30; // Auto-delete logs older than 30 days

interface LogEntry {
  id: string;
  timestamp: number;
  datetime: string;
  action: string;
  type: string;
  level: string;
  metadata: any;
  userAgent: string;
  url: string;
}

interface ActivityStats {
  total: number;
  byType: Record<string, number>;
  byLevel: Record<string, number>;
  oldest: number | null;
  newest: number | null;
}

/**
 * Log an activity
 */
export async function logActivity(
  action: string,
  metadata: any = {},
  level: LogLevelString | string = "INFO",
): Promise<void> {
  const log: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    datetime: new Date().toISOString(),
    action: action,
    type: action.split("_")[0], // e.g., "wallet" from "wallet_unlock"
    level: level,
    metadata: redactSensitiveData(metadata),
    userAgent:
      typeof navigator !== "undefined" && navigator.userAgent
        ? navigator.userAgent.substring(0, 100)
        : "background",
    url:
      typeof window !== "undefined" && window.location
        ? window.location.href.substring(0, 100)
        : "extension",
  };

  try {
    await putData("logs", log);

    const isDev = import.meta.env?.DEV;
    if (isDev) {
      console.log(`[${level}] ${action}`, metadata);
    }

    cleanupOldLogs().catch((err) => {
      console.warn("[ActivityLogger] Cleanup failed:", err);
    });
  } catch (error) {
    console.warn(
      "[ActivityLogger] IndexedDB failed, using StorageAdapter fallback",
      error,
    );
    try {
      const data = await storage.get("__activity_logs");
      const fallbackLogs: LogEntry[] = JSON.parse(
        data["__activity_logs"] || "[]",
      );
      fallbackLogs.push(log);

      if (fallbackLogs.length > MAX_LOGS) {
        fallbackLogs.splice(0, fallbackLogs.length - MAX_LOGS);
      }

      await storage.set({ __activity_logs: JSON.stringify(fallbackLogs) });
    } catch (fallbackError) {
      console.error("[ActivityLogger] All logging failed:", fallbackError);
    }
  }
}

/**
 * Get recent activities
 */
export async function getRecentActivities(
  limit: number = 50,
  type: string | null = null,
  level: string | null = null,
): Promise<LogEntry[]> {
  try {
    let logs: LogEntry[];

    if (type) {
      logs = await getDataByIndex("logs", "type", type);
    } else if (level) {
      logs = await getDataByIndex("logs", "level", level);
    } else {
      logs = await getAllData("logs");
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  } catch (error) {
    console.warn(
      "[ActivityLogger] Failed to load from IndexedDB, trying StorageAdapter",
      error,
    );

    try {
      const data = await storage.get("__activity_logs");
      const fallbackLogs: LogEntry[] = JSON.parse(
        data["__activity_logs"] || "[]",
      );
      return fallbackLogs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (fallbackError) {
      console.error("[ActivityLogger] Failed to load logs:", fallbackError);
      return [];
    }
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStats(): Promise<ActivityStats> {
  const logs: LogEntry[] = await getAllData("logs");

  const stats: ActivityStats = {
    total: logs.length,
    byType: {},
    byLevel: {},
    oldest: null,
    newest: null,
  };

  logs.forEach((log) => {
    stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;

    stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

    if (!stats.oldest || log.timestamp < stats.oldest) {
      stats.oldest = log.timestamp;
    }
    if (!stats.newest || log.timestamp > stats.newest) {
      stats.newest = log.timestamp;
    }
  });

  return stats;
}

/**
 * Clear old logs (privacy + storage management)
 */
export async function cleanupOldLogs(
  olderThanDays: number = LOG_RETENTION_DAYS,
): Promise<void> {
  try {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const allLogs: LogEntry[] = (await getAllData("logs")) || [];

    let deletedCount = 0;

    for (const log of allLogs) {
      if (log.timestamp < cutoffTime) {
        deletedCount++;
      }
    }

    if (allLogs.length > MAX_LOGS) {
      deletedCount += allLogs.length - MAX_LOGS;
    }

    if (deletedCount > 0) {
      logInfo(`[ActivityLogger] Cleaned up ${deletedCount} old logs`);
    }
  } catch (error) {
    console.warn("[ActivityLogger] Cleanup failed:", error);
  }
}

/**
 * Export logs to JSON file (for debugging/support)
 */
export async function exportLogs(limit: number = 1000): Promise<number> {
  try {
    const logs = await getRecentActivities(limit);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      totalLogs: logs.length,
      logs: logs,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qiubit-logs-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    logInfo("[ActivityLogger] [OK] Logs exported");
    return logs.length;
  } catch (error) {
    console.error("[ActivityLogger] Export failed:", error);
    throw error;
  }
}

/**
 * Clear all logs (for privacy/reset)
 */
export async function clearAllLogs(): Promise<void> {
  try {
    await clearStore("logs");

    await storage.remove("__activity_logs");

    logInfo("[ActivityLogger] [OK] All logs cleared");
  } catch (error) {
    console.error("[ActivityLogger] Failed to clear logs:", error);
    throw error;
  }
}

/**
 * Log wallet unlock
 */
export async function logWalletUnlock(walletCount: number): Promise<void> {
  return await logActivity("wallet_unlock", { walletCount }, "INFO");
}

/**
 * Log wallet lock
 */
export async function logWalletLock(sessionDuration: number): Promise<void> {
  return await logActivity("wallet_lock", { sessionDuration }, "INFO");
}

/**
 * Log transaction initiation
 */
export async function logTransactionInit(
  to: string,
  amount: string | number,
  network: string,
): Promise<void> {
  return await logActivity(
    "transaction_init",
    {
      to: to.substring(0, 10) + "...",
      amount,
      network,
    },
    "INFO",
  );
}

/**
 * Log transaction success
 */
export async function logTransactionSuccess(
  hash: string,
  network: string,
): Promise<void> {
  return await logActivity("transaction_success", { hash, network }, "INFO");
}

/**
 * Log transaction failure
 */
export async function logTransactionFailed(
  error: Error | string,
  network: string,
): Promise<void> {
  return await logActivity(
    "transaction_failed",
    {
      error: typeof error === "string" ? error : error.message,
      network,
    },
    "ERROR",
  );
}

/**
 * Log RPC call
 */
export async function logRPCCall(
  method: string,
  endpoint: string,
): Promise<void> {
  return await logActivity(
    "rpc_call",
    {
      method,
      endpoint: endpoint.substring(0, 50),
    },
    "DEBUG",
  );
}

/**
 * Log RPC error
 */
export async function logRPCError(
  method: string,
  error: Error | any,
): Promise<void> {
  return await logActivity(
    "rpc_error",
    {
      method,
      error: error.message || error,
    },
    "ERROR",
  );
}

export default {
  logActivity,
  getRecentActivities,
  getActivityStats,
  cleanupOldLogs,
  exportLogs,
  clearAllLogs,
  logWalletUnlock,
  logWalletLock,
  logTransactionInit,
  logTransactionSuccess,
  logTransactionFailed,
  logRPCCall,
  logRPCError,
  LOG_LEVELS,
};
