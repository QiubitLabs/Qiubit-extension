import { InfuraProvider } from './providers/InfuraProvider';
import { DrpcProvider } from './providers/DrpcProvider';
import { ZanProvider } from './providers/ZanProvider';
import { ChainstackProvider } from './providers/ChainstackProvider';
import { PublicProvider } from './providers/PublicProvider';
import { AlchemyProvider } from './providers/AlchemyProvider';

/**
 * Aggregate all RPC providers in precise priority order:
 * Infura -> dRPC -> ZAN.top -> Chainstack -> Public Nodes -> Alchemy (absolute last fallback)
 *
 * @param {number} chainId - Target EVM chain ID
 * @returns {string[]} Ordered list of RPC URLs
 */
export function getRpcListFromPool(chainId: number): string[] {
    const list: string[] = [];

    // 1. Infura
    const infura = InfuraProvider.getRpcUrl(chainId);
    if (infura) list.push(infura);

    // 2. dRPC
    const drpc = DrpcProvider.getRpcUrl(chainId);
    if (drpc) list.push(drpc);

    // 3. ZAN.top
    const zan = ZanProvider.getRpcUrl(chainId);
    if (zan) list.push(zan);

    // 4. Chainstack
    const chainstack = ChainstackProvider.getRpcUrl(chainId);
    if (chainstack) list.push(chainstack);

    // Ethereum Mainnet (chainId 1) uses ONLY private RPCs for absolute privacy/security.
    if (chainId === 1) {
        return list.filter(Boolean);
    }

    // 5. Public Nodes (from chainlist and similar public endpoints)
    const publics = PublicProvider.getRpcUrls(chainId);
    publics.forEach(url => {
        if (url && !list.includes(url)) {
            list.push(url);
        }
    });

    // 6. Alchemy (last fallback)
    const alchemy = AlchemyProvider.getRpcUrl(chainId);
    if (alchemy && !list.includes(alchemy)) {
        list.push(alchemy);
    }

    return list.filter(Boolean);
}
