/**
 * DApp Service
 * Manages dApp connections, permissions, and pending requests
 */

const STORAGE_KEY = 'dapp_connections';

class DappServiceClass {
    constructor() {
        this.connections = new Map();
        this.pendingRequests = new Map();
        this.loadConnections();
    }

    async loadConnections() {
        try {
            const data = await chrome.storage.local.get(STORAGE_KEY);
            if (data[STORAGE_KEY]) {
                const connections = JSON.parse(data[STORAGE_KEY]);
                Object.entries(connections).forEach(([origin, info]) => {
                    this.connections.set(origin, info);
                });
            }
        } catch (error) {
            console.error('[DappService] Failed to load connections:', error);
        }
    }

    async saveConnections() {
        try {
            const connections = Object.fromEntries(this.connections);
            await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(connections) });
        } catch (error) {
            console.error('[DappService] Failed to save connections:', error);
        }
    }

    /**
     * Check if origin is connected
     */
    isConnected(origin) {
        const connection = this.connections.get(origin);
        return connection && connection.connected;
    }

    /**
     * Get connection info for origin
     */
    getConnection(origin) {
        return this.connections.get(origin);
    }

    /**
     * Store connection after approval
     */
    async addConnection(origin, info) {
        this.connections.set(origin, {
            ...info,
            connected: true,
            connectedAt: Date.now()
        });
        await this.saveConnections();
    }

    /**
     * Remove connection
     */
    async removeConnection(origin) {
        this.connections.delete(origin);
        await this.saveConnections();
    }

    /**
     * Get all connected origins
     */
    getConnectedOrigins() {
        return Array.from(this.connections.entries())
            .filter(([, info]) => info.connected)
            .map(([origin, info]) => ({ origin, ...info }));
    }

    /**
     * Add pending request (for popup to approve)
     */
    addPendingRequest(requestId, request) {
        this.pendingRequests.set(requestId, {
            ...request,
            createdAt: Date.now()
        });
    }

    /**
     * Get pending request
     */
    getPendingRequest(requestId) {
        return this.pendingRequests.get(requestId);
    }

    /**
     * Remove pending request
     */
    removePendingRequest(requestId) {
        this.pendingRequests.delete(requestId);
    }

    /**
     * Get all pending requests
     */
    getAllPendingRequests() {
        return Array.from(this.pendingRequests.entries()).map(([id, request]) => ({
            id,
            ...request
        }));
    }

    /**
     * Clear expired pending requests (older than 5 minutes)
     */
    clearExpiredRequests() {
        const now = Date.now();
        const expiry = 5 * 60 * 1000; // 5 minutes

        for (const [id, request] of this.pendingRequests) {
            if (now - request.createdAt > expiry) {
                this.pendingRequests.delete(id);
            }
        }
    }
}

export const dappService = new DappServiceClass();
