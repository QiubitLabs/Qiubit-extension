import { useState, useEffect } from 'react';
import './NFTGallery.css';
import {
    ChevronLeftIcon,
    SendIcon,
    RefreshIcon,
    ImageIcon
} from '../../shared/Icons';
import { parseNFTMetadata } from './nftService';
import { truncateAddress } from '../../../utils/crypto';
import { Wallet } from '../../../types';
import RPCClient from '../../../services/network/RpcService';

export interface NFTAttribute {
    trait_type: string;
    value: string | number;
}

export interface NFT {
    name: string;
    description: string;
    image: string;
    attributes: NFTAttribute[];
    collection: string | null;
    tokenId: string;
    contractAddress: string;
    [key: string]: any;
}

export interface NFTGalleryProps {
    wallet: Wallet;
    rpcClient: RPCClient;
    onBack: () => void;
}

export function NFTGallery({ wallet, rpcClient: _rpcClient, onBack }: NFTGalleryProps) {
    const [nfts, setNfts] = useState<NFT[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);

    const loadNFTs = async () => {
        setLoading(true);
        try {
            // Bypass NFT fetching completely as requested
            setNfts([]);
        } catch (error) {
            console.error('Failed to load NFTs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNFTs();
    }, [wallet.address]);

    if (selectedNFT) {
        return (
            <NFTDetail
                nft={selectedNFT}
                onBack={() => setSelectedNFT(null)}
                onTransfer={() => console.log('Transfer feature pending implementation')}
            />
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-xl">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <h2 className="text-lg font-semibold">NFT Gallery</h2>
                </div>
                <button
                    className="header-icon-btn"
                    onClick={loadNFTs}
                    disabled={loading}
                >
                    <RefreshIcon size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-3xl">
                    <div className="loading-spinner mb-lg" style={{ width: 40, height: 40 }} />
                    <p className="text-secondary">Loading NFTs...</p>
                </div>
            ) : nfts.length === 0 ? (
                <div className="tx-empty">
                    <div className="tx-empty-icon">
                        <ImageIcon size={32} />
                    </div>
                    <p>No NFTs found</p>
                    <p className="text-xs text-tertiary mt-sm">
                        Your NFTs will appear here
                    </p>
                </div>
            ) : (
                <div className="nft-grid">
                    {nfts.map((nft, index) => (
                        <div
                            key={nft.tokenId || index}
                            className="nft-card"
                            onClick={() => setSelectedNFT(nft)}
                        >
                            <div className="nft-image">
                                {nft.image ? (
                                    <img src={nft.image} alt={nft.name} />
                                ) : (
                                    <div className="nft-placeholder"><ImageIcon size={24} /></div>
                                )}
                            </div>
                            <div className="nft-info">
                                <span className="nft-name">{nft.name}</span>
                                {nft.collection && (
                                    <span className="nft-collection">{nft.collection}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface NFTDetailProps {
    nft: NFT;
    onBack: () => void;
    onTransfer: () => void;
}

function NFTDetail({ nft, onBack, onTransfer }: NFTDetailProps) {
    const metadata = parseNFTMetadata(nft) as NFT;

    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-md mb-xl">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold">NFT Details</h2>
            </div>

            <div className="nft-detail-image mb-lg">
                {metadata.image ? (
                    <img src={metadata.image} alt={metadata.name} />
                ) : (
                    <div className="nft-placeholder-large"><ImageIcon size={48} /></div>
                )}
            </div>

            <div className="card mb-lg">
                <h3 className="text-md font-semibold mb-sm">{metadata.name}</h3>
                {metadata.collection && (
                    <p className="text-sm text-secondary mb-md">{metadata.collection}</p>
                )}
                {metadata.description && (
                    <p className="text-sm text-secondary">{metadata.description}</p>
                )}
            </div>

            {metadata.attributes && metadata.attributes.length > 0 && (
                <div className="card mb-lg">
                    <h4 className="text-sm font-semibold mb-md">Attributes</h4>
                    <div className="nft-attributes">
                        {metadata.attributes.map((attr, index) => (
                            <div key={index} className="nft-attribute">
                                <span className="nft-attribute-type">{attr.trait_type}</span>
                                <span className="nft-attribute-value">{attr.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="card mb-lg">
                <h4 className="text-sm font-semibold mb-md">Details</h4>
                <div className="nft-details-list">
                    <div className="nft-detail-row">
                        <span className="text-secondary">Token ID</span>
                        <span className="text-mono">{metadata.tokenId || 'N/A'}</span>
                    </div>
                    {metadata.contractAddress && (
                        <div className="nft-detail-row">
                            <span className="text-secondary">Contract</span>
                            <span className="text-mono">{truncateAddress(metadata.contractAddress, 8)}</span>
                        </div>
                    )}
                </div>
            </div>

            <button
                className="btn btn-primary btn-lg btn-full gap-sm"
                onClick={onTransfer}
            >
                <SendIcon size={18} />
                Transfer NFT
            </button>
        </div>
    );
}

export default NFTGallery;
