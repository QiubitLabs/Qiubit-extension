/**
 * NFT Service
 * Handles NFT fetching and caching
 */

import { storage } from "../../../utils/storage";

const NFT_CACHE_KEY = "nft_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getCachedNFTs = async (address: string): Promise<any[] | null> => {
  try {
    const key = `${NFT_CACHE_KEY}_${address}`;
    const data = await storage.get(key);
    const cached = data[key];

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

export const cacheNFTs = async (address: string, nfts: any[]) => {
  const key = `${NFT_CACHE_KEY}_${address}`;
  await storage.set({
    [key]: JSON.stringify({
      nfts,
      timestamp: Date.now(),
    }),
  });
};

export const fetchNFTs = async (address: string, _rpcClient?: any) => {
  const cached = await getCachedNFTs(address);
  if (cached) return cached;

  try {
    const nfts: any[] = [];

    await cacheNFTs(address, nfts);
    return nfts;
  } catch (error) {
    console.error("Failed to fetch NFTs:", error);
    return [];
  }
};

export const parseNFTMetadata = (rawMetadata: any) => {
  return {
    name: rawMetadata.name || "Unknown NFT",
    description: rawMetadata.description || "",
    image: rawMetadata.image || rawMetadata.imageUrl || "",
    attributes: rawMetadata.attributes || [],
    collection: rawMetadata.collection || null,
    tokenId: rawMetadata.tokenId || "",
    contractAddress: rawMetadata.contractAddress || "",
  };
};

export const transferNFT = async (
  _wallet: any,
  _nft: any,
  _toAddress: string,
  _rpcClient?: any,
) => {
  throw new Error("NFT transfer not yet implemented on Octra network");
};
