/**
 * NFT Service
 * Handles NFT fetching and caching
 */

const NFT_CACHE_KEY = 'nft_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get cached NFTs
export const getCachedNFTs = (address) => {
    try {
        const cached = localStorage.getItem(`${NFT_CACHE_KEY}_${address}`);
        if (!cached) return null;

        const { nfts, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION) {
            return null; // Cache expired
        }
        return nfts;
    } catch {
        return null;
    }
};

// Cache NFTs
export const cacheNFTs = (address, nfts) => {
    localStorage.setItem(`${NFT_CACHE_KEY}_${address}`, JSON.stringify({
        nfts,
        timestamp: Date.now()
    }));
};

// Fetch NFTs from network (mock for now)
export const fetchNFTs = async (address, rpcClient) => {
    // Check cache first
    const cached = getCachedNFTs(address);
    if (cached) return cached;

    try {
        // TODO: Implement actual NFT fetching from Octra network
        // For now, return empty array
        const nfts = [];

        // Cache result
        cacheNFTs(address, nfts);
        return nfts;
    } catch (error) {
        console.error('Failed to fetch NFTs:', error);
        return [];
    }
};

// NFT metadata structure
export const parseNFTMetadata = (rawMetadata) => {
    return {
        name: rawMetadata.name || 'Unknown NFT',
        description: rawMetadata.description || '',
        image: rawMetadata.image || rawMetadata.imageUrl || '',
        attributes: rawMetadata.attributes || [],
        collection: rawMetadata.collection || null,
        tokenId: rawMetadata.tokenId || '',
        contractAddress: rawMetadata.contractAddress || ''
    };
};

// Transfer NFT
export const transferNFT = async (wallet, nft, toAddress, rpcClient) => {
    // TODO: Implement actual NFT transfer
    throw new Error('NFT transfer not yet implemented on Octra network');
};
