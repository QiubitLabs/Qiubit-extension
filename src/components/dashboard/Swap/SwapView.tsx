import { useState, useMemo, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import './SwapView.css';
import { SwapIcon, ChevronLeftIcon, ChevronDownIcon, RefreshIcon, CheckIcon, CloseIcon } from '../../shared/Icons';
import { formatAmount } from '../../../utils/crypto';
import { getMultipleTokenPrices, formatPrice, getTokenPrice } from '../../../services/network/PriceService';
import { Token, Wallet } from '../../../types';
import { getRpcClient } from '../../../services/network/RpcService';
import { keyringService } from '../../../services/core/KeyringService';
import { createTransaction } from '../../../utils/crypto/transaction';
import { withEvmFallback, getEvmRpcUrl, fetchGasOptions, GasOptions, gweiToWei } from '../../../utils/evmProvider';

// Bridge constants (from webcli bridge.html)
const BRIDGE_VAULT = 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq';
const WOCT_ADDR = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';
const ETH_BRIDGE = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';
const SIGNER_URL = 'https://relayer-002838819188.octra.network/rpc';
const RECOVERY_URL = 'https://relayer-002838819188.octra.network/recovery.json';
const OCT_DECIMALS = 6;

interface SwapViewProps {
    onBack: () => void;
    tokens: Token[];
    balance: number;
    address: string;
    wallet: Wallet;
    onRefresh: (mode?: 'public' | 'private' | 'both') => void;
    isRefreshing?: boolean;
}

type BridgeStep = 0 | 1 | 2 | 3 | 4;

function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

function parseUnitsOct(human: string): string {
    const parts = human.split('.');
    const intPart = parts[0] || '0';
    let fracPart = (parts[1] || '').padEnd(OCT_DECIMALS, '0').substring(0, OCT_DECIMALS);
    const raw = BigInt(intPart) * BigInt(10 ** OCT_DECIMALS) + BigInt(fracPart);
    return raw.toString();
}

async function getSafeGas(provider: ethers.JsonRpcProvider) {
    try {
        const fee = await provider.getFeeData();
        const base = fee.gasPrice || 10000000000n;
        const doubled = base * 2n;
        return {
            maxFeePerGas: doubled > 10000000000n ? doubled : 10000000000n,
            maxPriorityFeePerGas: 2000000000n
        };
    } catch {
        return { maxFeePerGas: 10000000000n, maxPriorityFeePerGas: 2000000000n };
    }
}

async function abiEncodeStringUint(str: string, uint: string): Promise<string> {
    const offset = '0000000000000000000000000000000000000000000000000000000000000040';
    const uintHex = BigInt(uint).toString(16).padStart(64, '0');
    const strLen = str.length.toString(16).padStart(64, '0');
    let strHex = '';
    for (let i = 0; i < str.length; i++) {
        strHex += str.charCodeAt(i).toString(16).padStart(2, '0');
    }
    while (strHex.length % 64 !== 0) strHex += '0';
    return offset + uintHex + strLen + strHex;
}

async function buildClaimCalldata(epochId: number, recipient: string, rawAmt: string) {
    try {
        const msgBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'bridgeMessagesByEpoch', params: [epochId] });
        const msgResp = await fetch(SIGNER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: msgBody
        });
        const msgData = await msgResp.json();
        const messages = msgData.result.messages;
        const myMsg = messages.find((m: any) => m.recipient.toLowerCase() === recipient.toLowerCase());
        if (!myMsg) return null;

        const cdBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'bridgeClaimCalldata', params: [epochId, myMsg.leaf_index] });
        const cdResp = await fetch(SIGNER_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cdBody
        });
        const cdData = await cdResp.json();
        if (cdData.result && cdData.result.calldata) {
            return { calldata: cdData.result.calldata, epochId: epochId, amount: (Number(rawAmt) / 1e6).toString() };
        }
        return null;
    } catch { return null; }
}

export function SwapView({ onBack, tokens: allTokens, balance, address, wallet, onRefresh, isRefreshing }: SwapViewProps) {
    const [mode, setMode] = useState<'public' | 'bridge'>('public');
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    // Bridge direction: o2e = OCT → wOCT, e2o = wOCT → OCT
    const [bridgeDir, setBridgeDir] = useState<'o2e' | 'e2o'>('o2e');
    const [bridgeStep, setBridgeStep] = useState<BridgeStep>(0);
    const [bridgeStatus, setBridgeStatus] = useState('');
    const [bridgeError, setBridgeError] = useState('');
    const claimStorageKey = `bridge_pending_claim_${address}`;
    const epochStorageKey = `bridge_pending_epoch_${address}`;

    const [pendingClaim, setPendingClaimState] = useState<{ calldata: string; epochId: number; amount?: string } | null>(() => {
        try {
            const stored = localStorage.getItem(`bridge_pending_claim_${address}`);
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    });

    const [pendingEpoch, setPendingEpochState] = useState<{ epochId: number; recipient: string; amount: string } | null>(() => {
        try {
            const stored = localStorage.getItem(`bridge_pending_epoch_${address}`);
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    });

    const epochPollingRef = useRef(false);
    const [ethRecipient, setEthRecipient] = useState(wallet.evmAddress || '');
    const [octRecipient, setOctRecipient] = useState(address || '');
    const [lockTxHash, setLockTxHash] = useState('');

    // Update recipients if wallet changes
    useEffect(() => {
        if (wallet.evmAddress) setEthRecipient(wallet.evmAddress);
        if (address) setOctRecipient(address);
    }, [wallet.evmAddress, address]);

    // Claim confirmation overlay state
    const [showClaimConfirm, setShowClaimConfirm] = useState(false);
    const [showBridgeConfirm, setShowBridgeConfirm] = useState(false);
    const [showClaimFeePopup, setShowClaimFeePopup] = useState(false);
    const [claimFeeSpeed, setClaimFeeSpeed] = useState<'slow' | 'normal' | 'fast' | 'custom'>('normal');
    const [customClaimGasPriceGwei, setCustomClaimGasPriceGwei] = useState('10');
    const [claimGasOpts, setClaimGasOpts] = useState<GasOptions | null>(null);
    const [isFetchingClaimFee, setIsFetchingClaimFee] = useState(false);
    const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);

    // Octra fee state (for o2e bridge lock)
    const [octFeeSpeed, setOctFeeSpeed] = useState<'slow' | 'normal' | 'fast' | 'custom'>('normal');
    const [customOctFee, setCustomOctFee] = useState('0.005');
    const [octFeeEstimate, setOctFeeEstimate] = useState({ slow: 0.001, medium: 0.005, fast: 0.01 });
    const [showOctFeePopup, setShowOctFeePopup] = useState(false);

    const selectedOctFee = octFeeSpeed === 'slow' ? octFeeEstimate.slow
        : octFeeSpeed === 'fast' ? octFeeEstimate.fast
        : octFeeSpeed === 'custom' ? (parseFloat(customOctFee) || 0.02)
        : octFeeEstimate.medium;

    const [slippage, setSlippage] = useState<'0.1' | '0.5' | '1.0'>('0.5');

    // Swap mode (LI.FI)
    const [lifiQuote, setLifiQuote] = useState<any>(null);
    const [isSwapping, setIsSwapping] = useState(false);
    const [swapStatus, setSwapStatus] = useState('');
    const [swapError, setSwapError] = useState('');

    // Prices for the token selector modal
    const [selectorPrices, setSelectorPrices] = useState<Map<string, { price: number; change24h: number }>>(new Map());

    const setPendingClaim = (claim: { calldata: string; epochId: number; amount?: string } | null) => {
        setPendingClaimState(claim);
        if (claim) {
            localStorage.setItem(claimStorageKey, JSON.stringify(claim));
        } else {
            localStorage.removeItem(claimStorageKey);
        }
    };

    const setPendingEpoch = (epoch: { epochId: number; recipient: string; amount: string } | null) => {
        setPendingEpochState(epoch);
        if (epoch) {
            localStorage.setItem(epochStorageKey, JSON.stringify(epoch));
        } else {
            localStorage.removeItem(epochStorageKey);
        }
    };

    // Sync bridge state from recovery.json (indexed by EVM address — works for imported wallets too)
    const syncBridgeStateOnChain = async () => {
        if (!ethRecipient) return;
        const target = ethRecipient.toLowerCase();
        try {
            const resp = await fetch(RECOVERY_URL, { cache: 'no-store' });
            if (!resp.ok) return;
            const data = await resp.json();
            const by: Record<string, any[]> = data?.by_recipient ?? {};
            const bucket: any[] = by[target] ?? by[ethRecipient] ?? [];
            if (!Array.isArray(bucket) || bucket.length === 0) return;

            for (const m of bucket) {
                const epochId = typeof m.epoch === 'number' ? m.epoch : parseInt(m.epoch, 10);
                const leafIndex = typeof m.leaf_index === 'number' ? m.leaf_index : parseInt(m.leaf_index, 10);
                const amtRaw = String(m.amount_raw || '0');
                if (!epochId || amtRaw === '0') continue;

                // leaf_index is already in recovery.json — skip bridgeMessagesByEpoch
                try {
                    const cdData = await signerPost('bridgeClaimCalldata', [epochId, leafIndex]);
                    if (!cdData.result?.calldata) continue;

                    await withEvmFallback(p => p.call({ to: ETH_BRIDGE, data: cdData.result.calldata }));
                    // Simulation passed — header is on Ethereum, ready to claim
                    setPendingClaim({
                        calldata: cdData.result.calldata,
                        epochId,
                        amount: (Number(amtRaw) / 1e6).toString()
                    });
                    return;
                } catch (err: any) {
                    const msg = (err?.message || '').toLowerCase();
                    if (msg.includes('already') || msg.includes('replay') || err?.data === '0xb5a78004') continue;
                    // Header not on Ethereum yet — skip silently
                }
            }
        } catch (e) {
            console.warn('Bridge sync failed', e);
        }
    };

    useEffect(() => {
        if (mode === 'bridge' && !pendingClaim && ethRecipient) {
            syncBridgeStateOnChain();
        }
    }, [mode, pendingClaim, ethRecipient]);

    // Resume epoch polling if popup was closed while waiting for bridge header
    useEffect(() => {
        if (!pendingEpoch || pendingClaim || epochPollingRef.current) return;
        epochPollingRef.current = true;
        setBridgeDir('o2e');
        setBridgeStep(2);
        waitForClaimData(pendingEpoch.epochId, pendingEpoch.recipient).then(claimData => {
            epochPollingRef.current = false;
            if (claimData) {
                setPendingEpoch(null);
                setPendingClaim({ ...claimData, amount: pendingEpoch.amount });
                setBridgeStep(3);
                setBridgeStatus('Bridge ready! Claim your wOCT on Ethereum.');
            } else {
                setPendingEpoch(null);
                setBridgeError(
                    `Bridge header for epoch #${pendingEpoch.epochId} not confirmed after 10 minutes. ` +
                    'Your OCT is locked safely — try reopening the Bridge tab.'
                );
                setBridgeStep(0);
            }
        });
    }, []);

    const tokens = useMemo(() => {
        if (mode === 'bridge') {
            const wOctFromState = allTokens?.find(t => t.symbol === 'wOCT');
            return [
                { symbol: 'OCT', name: 'Octra (Native)', balance: balance || 0, isNative: true, logoUrl: '/qiubit-icon.svg' },
                { symbol: 'wOCT', name: 'Wrapped Octra (ETH)', balance: wOctFromState?.balance || 0, isNative: false, logoUrl: '/qiubit-icon.svg', isEVM: true, contractAddress: WOCT_ADDR, decimals: 6 }
            ];
        }

        // Public swap via LI.FI — only EVM tokens, no native OCT
        if (!allTokens || allTokens.length === 0) return [];

        const mapped = allTokens
            .filter((t: Token) => !t.isNative) // exclude native OCT from LI.FI swap
            .map((t: Token) => ({ ...t, balance: t.balance }));

        return mapped;
    }, [allTokens, balance, mode]);

    const [fromToken, setFromToken] = useState<Token>(tokens[0]);
    const [toToken, setToToken] = useState<Token | null>(tokens.length > 1 ? tokens[1] : null);
    const [showSelector, setShowSelector] = useState<'from' | 'to' | null>(null);

    // Fetch prices when token selector opens
    useEffect(() => {
        if (!showSelector) return;
        const symbols = tokens.map((t: Token) => t.symbol);
        getMultipleTokenPrices(symbols).then(prices => setSelectorPrices(prices));
    }, [showSelector]);

    useEffect(() => {
        if (mode === 'bridge') {
            if (bridgeDir === 'o2e') {
                setFromToken(tokens[0]);
                setToToken(tokens[1]);
            } else {
                setFromToken(tokens[1]);
                setToToken(tokens[0]);
            }
        } else {
            if (fromToken) {
                const updated = tokens.find((t: Token) => t.symbol === fromToken.symbol);
                if (updated) setFromToken(updated);
            }
            if (toToken) {
                const updated = tokens.find((t: Token) => t.symbol === toToken.symbol);
                if (updated) setToToken(updated);
            }
        }
    }, [mode, tokens, bridgeDir]);

    const handleSwapDirection = () => {
        if (!toToken) return;
        if (mode === 'bridge') {
            setBridgeDir(d => d === 'o2e' ? 'e2o' : 'o2e');
            setFromAmount('');
            setToAmount('');
            setBridgeStep(0);
            setBridgeStatus('');
            setBridgeError('');
            setPendingClaim(null);
        } else {
            const temp = fromToken;
            setFromToken(toToken);
            setToToken(temp);
        }
    };

    const handleSelectToken = (token: Token) => {
        if (showSelector === 'from') setFromToken(token);
        else setToToken(token);
        setShowSelector(null);
    };

    // Bridge 1:1 amount
    useEffect(() => {
        if (mode === 'bridge' && fromAmount) setToAmount(fromAmount);
    }, [fromAmount, mode]);

    const getLiFiQuote = async () => {
        if (!fromToken || !toToken || !fromAmount) return;
        const evmAddr = wallet.evmAddress;
        if (!evmAddr) return;

        try {
            const fromChainId = 1;
            const toChainId = 1;
            const fromDecimals = fromToken.decimals || 18;
            const fromAmountRaw = ethers.parseUnits(fromAmount, fromDecimals).toString();

            const params = new URLSearchParams({
                fromChain: String(fromChainId),
                toChain: String(toChainId),
                fromToken: fromToken.contractAddress || '0x0000000000000000000000000000000000000000',
                toToken: toToken.contractAddress || '0x0000000000000000000000000000000000000000',
                fromAmount: fromAmountRaw,
                fromAddress: evmAddr,
                slippage: String(parseFloat(slippage) / 100)
            });

            const response = await fetch(`https://li.quest/v1/quote?${params}`, {
                headers: { 'x-lifi-api-key': import.meta.env.VITE_LIFI_API_KEY }
            });
            const quote = await response.json();
            setLifiQuote(quote);

            if (quote.estimate?.gasCosts?.[0]?.amount) {
                if (quote.estimate?.toAmount) {
                    const toDecimals = toToken.decimals || 18;
                    setToAmount(Number(ethers.formatUnits(quote.estimate.toAmount, toDecimals)).toFixed(6));
                }
            }
        } catch (e) {
            console.error('LI.FI Quote failed', e);
        }
    };

    useEffect(() => {
        if (mode === 'public' && fromToken?.isEVM && toToken?.isEVM && fromAmount) {
            const timer = setTimeout(getLiFiQuote, 500);
            return () => clearTimeout(timer);
        }
    }, [fromAmount, fromToken, toToken, mode]);

    // ─── EVM SWAP (LI.FI) ─────────────────────────────────────────────────────
    const executeLiFiSwap = async () => {
        if (!lifiQuote) throw new Error('No quote available');

        const rpcUrl = getEvmRpcUrl();
        const tx = await keyringService.signAndSendEvm(address, lifiQuote.transactionRequest, rpcUrl);
        await tx.wait();
        return tx.hash;
    };

    const handleEvmSwap = async () => {
        setIsSwapping(true);
        setSwapError('');
        setSwapStatus('Getting quote...');
        try {
            if (!lifiQuote) await getLiFiQuote();
            setSwapStatus('Submitting swap...');
            const hash = await executeLiFiSwap();
            setSwapStatus(`Swap complete: ${hash.slice(0, 10)}...`);
            onRefresh('public');
        } catch (e: any) {
            setSwapError(e.message || 'Swap failed');
            setSwapStatus('');
        } finally {
            setIsSwapping(false);
        }
    };

    // ─── BRIDGE: OCT → wOCT (lock on Octra, claim on Ethereum) ───────────────
    const waitForOctraReceipt = async (txHash: string, maxSec = 60): Promise<any> => {
        const rpc = getRpcClient();
        const start = Date.now();
        while (Date.now() - start < maxSec * 1000) {
            try {
                const tx = await rpc.getTransaction(txHash);
                if (tx && (tx.status === 'confirmed' || tx.epoch)) return tx;
            } catch { /* not ready yet */ }
            await sleep(2000);
        }
        throw new Error('Transaction not confirmed within 60s');
    };

    const signerPost = async (method: string, params: any[]) => {
        const resp = await fetch(SIGNER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
        });
        if (!resp.ok) throw new Error(`Relayer HTTP ${resp.status}`);
        return resp.json();
    };

    const waitForClaimData = async (epochId: number, recipient: string): Promise<{ calldata: string; epochId: number } | null> => {
        const start = Date.now();
        let attempt = 0;
        while (Date.now() - start < 600000) {
            attempt++;
            setBridgeStatus(`Waiting for bridge header on Ethereum — epoch #${epochId} (attempt ${attempt})...`);
            try {
                const headerData = await signerPost('bridgeHeader', [epochId]);
                if (headerData.result && headerData.result.message_count > 0) {
                    const msgData = await signerPost('bridgeMessagesByEpoch', [epochId]);
                    const messages = msgData.result?.messages || [];
                    const myMsg = messages.find((m: any) =>
                        m.recipient?.toLowerCase() === recipient.toLowerCase()
                    );
                    if (!myMsg) { await sleep(6000); continue; }

                    const cdData = await signerPost('bridgeClaimCalldata', [epochId, myMsg.leaf_index]);
                    if (cdData.result?.calldata) {
                        // Verify the header is actually confirmed on Ethereum
                        try {
                            await withEvmFallback(p => p.call({ to: ETH_BRIDGE, data: cdData.result.calldata }));
                            // Call succeeded — header is live on Ethereum, ready to claim
                            return { calldata: cdData.result.calldata, epochId };
                        } catch (callErr: any) {
                            const errMsg = (callErr?.message || callErr?.data || '').toLowerCase();
                            if (errMsg.includes('0xb5a78004') || errMsg.includes('already') || errMsg.includes('replay')) {
                                // Already claimed on-chain
                                return { calldata: cdData.result.calldata, epochId };
                            }
                            // Relayer has data but Ethereum hasn't accepted the header yet — keep waiting
                            setBridgeStatus(`Relayer ready, waiting for Ethereum header confirmation — attempt ${attempt}...`);
                        }
                    }
                }
            } catch (e: any) {
                setBridgeStatus(`Relayer unreachable (${e.message?.slice(0, 40)}), retry ${attempt}...`);
            }
            await sleep(6000);
        }
        return null;
    };

    const lockOctToEth = async () => {
        const recip = ethRecipient.trim();
        if (!recip || !/^0x[0-9a-fA-F]{40}$/.test(recip)) {
            setBridgeError('Enter a valid Ethereum address');
            return;
        }
        if (!fromAmount || parseFloat(fromAmount) <= 0) {
            setBridgeError('Enter amount');
            return;
        }

        setBridgeStep(1);
        setBridgeError('');
        setBridgeStatus('Locking OCT on Octra...');
        setLockTxHash('');

        try {
            const privateKeyB64 = keyringService.getPrivateKey(address, 'bridge_lock');
            if (!privateKeyB64) throw new Error('Wallet locked');

            const rpc = getRpcClient();
            const nonce = await rpc.getNonceForSend(address);

            const signedTx = await createTransaction(
                address,
                BRIDGE_VAULT,
                fromAmount,
                nonce + 1,
                privateKeyB64,
                JSON.stringify([recip]),
                selectedOctFee.toFixed(4),
                'call',
                'lock_to_eth'
            );

            const result = await rpc.sendTransaction(signedTx);
            if (!result.success || !result.txHash) throw new Error('Lock transaction failed');

            const lockHash = result.txHash;
            setLockTxHash(lockHash);
            setBridgeStatus(`OCT locked! Tx: ${lockHash.slice(0, 14)}... — waiting for confirmation`);
            setBridgeStep(2);

            // Wait for confirmation + epoch assignment
            const receipt = await waitForOctraReceipt(lockHash);
            let epochId: number = receipt?.epoch || 0;

            // Webcli-style epoch fallback: epoch may lag behind 'confirmed' status
            if (!epochId) {
                setBridgeStatus('Waiting for epoch finalization...');
                for (let i = 0; i < 20 && !epochId; i++) {
                    await sleep(3000);
                    try {
                        const txInfo = await rpc.getTransaction(lockHash);
                        epochId = txInfo?.epoch || 0;
                    } catch { /* not ready */ }
                }
            }

            if (!epochId) {
                setBridgeError(
                    `Lock tx sent (${lockHash.slice(0, 12)}...) but epoch not assigned yet. ` +
                    'Check OctraScan, then reload this page to retry claiming.'
                );
                setBridgeStep(0);
                return;
            }

            // Save epoch immediately so polling can resume if popup is closed
            setPendingEpoch({ epochId, recipient: recip, amount: fromAmount });

            setBridgeStatus(`Epoch #${epochId} confirmed. Waiting for bridge header on Ethereum...`);
            const claimData = await waitForClaimData(epochId, recip);
            if (!claimData) {
                setBridgeError(
                    `Bridge header for epoch #${epochId} not confirmed on Ethereum after 10 minutes. ` +
                    'Your OCT is locked safely — reopen the Bridge tab to resume.'
                );
                setBridgeStep(0);
                return;
            }

            setPendingEpoch(null);
            setPendingClaim({ ...claimData, amount: fromAmount });
            setBridgeStep(3);
            setBridgeStatus('Bridge ready! Claim your wOCT on Ethereum.');
        } catch (e: any) {
            setBridgeError(e.message || 'Bridge failed');
            setBridgeStep(0);
            setBridgeStatus('');
        }
    };

    const openClaimConfirm = async () => {
        setClaimFeeSpeed('normal');
        setClaimGasOpts(null);
        setEthPriceUsd(null);
        setShowClaimConfirm(true);
        setIsFetchingClaimFee(true);
        try {
            const [opts, priceData] = await Promise.all([
                fetchGasOptions({ 
                    to: ETH_BRIDGE, 
                    data: pendingClaim?.calldata,
                    from: wallet.evmAddress 
                }, 400_000n),
                getTokenPrice('ETH'),
            ]);
            setClaimGasOpts(opts);
            setCustomClaimGasPriceGwei((Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2));
            setEthPriceUsd(priceData?.price ?? null);
        } catch {
            setClaimGasOpts(null);
        } finally {
            setIsFetchingClaimFee(false);
        }
    };

    const claimWoct = async () => {
        if (!pendingClaim) return;
        // Do NOT close overlay yet, so we can show errors in the overlay if simulation fails
        setIsFetchingClaimFee(true);
        setBridgeError('');

        try {
            // Simulate (read) with auto-fallback
            try {
                await withEvmFallback(p => p.call({ to: ETH_BRIDGE, data: pendingClaim.calldata }));
            } catch (simErr: any) {
                const msg: string = simErr?.message || simErr?.data || '';
                const isAlreadyClaimed =
                    msg.includes('0xb5a78004') ||
                    msg.toLowerCase().includes('already') ||
                    msg.toLowerCase().includes('replay');
                if (isAlreadyClaimed) {
                    setShowClaimConfirm(false);
                    setPendingClaim(null);
                    setBridgeStep(4);
                    setBridgeStatus('wOCT already claimed on Ethereum!');
                    onRefresh('public');
                    return;
                }
                if (msg.toLowerCase().includes('insufficient funds')) {
                    setBridgeError('Insufficient ETH for gas fee.');
                    setIsFetchingClaimFee(false);
                    return;
                }
                setBridgeError('Claim simulation failed. Please retry in a moment.');
                setIsFetchingClaimFee(false);
                return;
            }

            // If simulation passes, close overlay and start the real tx
            setShowClaimConfirm(false);
            setBridgeStep(3);
            setBridgeStatus('Submitting claim to Ethereum...');
            
            const gasOpts = claimGasOpts ?? await fetchGasOptions(
                { to: ETH_BRIDGE, data: pendingClaim.calldata, from: wallet.evmAddress }, 400_000n
            );
            
            let maxFeePerGas: bigint;
            let maxPriorityFeePerGas: bigint;
            
            if (claimFeeSpeed === 'custom') {
                const customWei = gweiToWei(customClaimGasPriceGwei);
                maxFeePerGas = customWei;
                // Basic check for priority fee, similar to what evmProvider does
                maxPriorityFeePerGas = customWei > 1_000_000_000n ? 1_000_000_000n : customWei; 
            } else {
                const tier = gasOpts[claimFeeSpeed];
                maxFeePerGas = tier.maxFeePerGas;
                maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
            }

            const rpcUrl = getEvmRpcUrl();
            const tx = await keyringService.signAndSendEvm(address, {
                to: ETH_BRIDGE,
                data: pendingClaim.calldata,
                gasLimit: gasOpts.gasLimit,
                maxFeePerGas,
                maxPriorityFeePerGas,
            }, rpcUrl);
            setBridgeStatus(`Claim submitted (tx: ${tx.hash.slice(0, 12)}...). Waiting...`);
            await tx.wait();

            setBridgeStep(4);
            setBridgeStatus('wOCT claimed successfully!');
            setPendingClaim(null);
            setPendingEpoch(null);
            onRefresh('public');
        } catch (e: any) {
            const msg = String(e?.message || e?.data || e || '');
            if (msg.toLowerCase().includes('insufficient funds')) {
                setBridgeError('Insufficient ETH for gas fee. Please deposit some ETH to claim.');
            } else {
                setBridgeError(msg.length > 100 ? msg.slice(0, 100) + '...' : msg);
            }
        }
    };

    // ─── BRIDGE: wOCT → OCT (burn on Ethereum, unlock on Octra) ──────────────
    const burnWoctToOct = async () => {
        const recip = octRecipient.trim();
        if (!recip || recip.length !== 47 || !recip.startsWith('oct')) {
            setBridgeError('Octra address missing in wallet');
            return;
        }
        if (!fromAmount || parseFloat(fromAmount) <= 0) {
            setBridgeError('Enter amount');
            return;
        }

        setShowBridgeConfirm(false);
        setBridgeStep(1);
        setBridgeError('');
        setBridgeStatus('Approving wOCT spend...');

        try {
            const rawAmt = parseUnitsOct(fromAmount);

            // Use selected gas price
            let maxFeePerGas: bigint;
            let maxPriorityFeePerGas: bigint;
            const gasOpts = claimGasOpts ?? await fetchGasOptions(
                { to: ETH_BRIDGE, from: wallet.evmAddress }, 180_000n
            );

            if (claimFeeSpeed === 'custom') {
                const customWei = gweiToWei(customClaimGasPriceGwei);
                maxFeePerGas = customWei;
                maxPriorityFeePerGas = customWei > 1_000_000_000n ? 1_000_000_000n : customWei;
            } else {
                const tier = gasOpts[claimFeeSpeed];
                maxFeePerGas = tier.maxFeePerGas;
                maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
            }

            const approveData = '0x095ea7b3'
                + ETH_BRIDGE.substring(2).toLowerCase().padStart(64, '0')
                + BigInt(rawAmt).toString(16).padStart(64, '0');
            const approveTx = await keyringService.signAndSendEvm(address, {
                to: WOCT_ADDR,
                data: approveData,
                gasLimit: 0x30000n,
                maxFeePerGas,
                maxPriorityFeePerGas
            }, getEvmRpcUrl());
            await approveTx.wait();

            setBridgeStep(2);
            setBridgeStatus(`Burning wOCT to send to ${recip.slice(0, 10)}... on Octra...`);

            const burnSig = '0xe3e3aed0';
            const encoded = await abiEncodeStringUint(recip, rawAmt);
            const burnData = burnSig + encoded;
            const burnTx = await keyringService.signAndSendEvm(address, {
                to: ETH_BRIDGE,
                data: burnData,
                gasLimit: 0x40000n,
                maxFeePerGas,
                maxPriorityFeePerGas
            }, getEvmRpcUrl());
            setBridgeStatus(`Burn submitted (tx: ${burnTx.hash.slice(0, 10)}...). Sending to ${recip.slice(0, 10)}... on Octra`);
            await burnTx.wait();

            setBridgeStep(3);
            setBridgeStatus('wOCT burned. OCT will be unlocked on Octra in ~2 min...');

            // Poll for OCT balance change
            const rpc = getRpcClient();
            const prevBalance = balance;
            let unlocked = false;
            for (let i = 0; i < 36; i++) {
                await sleep(5000);
                try {
                    const data = await rpc.getBalance(address);
                    if (data.balance > prevBalance) { unlocked = true; break; }
                } catch { /* retry */ }
            }

            setBridgeStep(4);
            if (unlocked) {
                setBridgeStatus('OCT unlocked successfully!');
            } else {
                setBridgeStatus('wOCT burned. OCT should arrive on Octra within a few minutes.');
            }
            onRefresh('public');
        } catch (e: any) {
            const msg = String(e?.message || e?.data || e || '');
            if (msg.toLowerCase().includes('insufficient funds')) {
                setBridgeError('Insufficient ETH for gas fee. Please deposit some ETH to bridge.');
            } else {
                setBridgeError(msg.length > 100 ? msg.slice(0, 100) + '...' : msg);
            }
            setBridgeStep(0);
            setBridgeStatus('');
        }
    };

    const openBridgeConfirm = async () => {
        setClaimFeeSpeed('normal');
        setClaimGasOpts(null);
        setEthPriceUsd(null);
        setOctFeeSpeed('normal');
        setShowBridgeConfirm(true);

        if (bridgeDir === 'o2e') {
            setIsFetchingClaimFee(true);
            try {
                const rpc = getRpcClient();
                const fees = await rpc.getFeeEstimate();
                setOctFeeEstimate({ slow: fees.low, medium: fees.medium, fast: fees.high });
                setCustomOctFee(fees.medium.toFixed(3));
            } finally {
                setIsFetchingClaimFee(false);
            }
        }

        if (bridgeDir === 'e2o') {
            setIsFetchingClaimFee(true);
            try {
                // Build burn calldata for accurate gas simulation
                const rawAmt = parseUnitsOct(fromAmount || '1');
                const burnSig = '0xe3e3aed0';
                const encoded = await abiEncodeStringUint(octRecipient || address, rawAmt);
                const burnData = burnSig + encoded;

                const [opts, priceData] = await Promise.all([
                    fetchGasOptions({
                        to: ETH_BRIDGE,
                        from: wallet.evmAddress,
                        data: burnData
                    }, 180_000n), // 0x30000 approve + 0x40000 burn fallback
                    getTokenPrice('ETH'),
                ]);
                setClaimGasOpts(opts);
                setCustomClaimGasPriceGwei((Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2));
                setEthPriceUsd(priceData?.price ?? null);
            } catch {
                setClaimGasOpts(null);
            } finally {
                setIsFetchingClaimFee(false);
            }
        }
    };

    const handleBridgeExecute = () => {
        setBridgeError('');
        openBridgeConfirm();
    };

    const resetBridge = () => {
        setBridgeStep(0);
        setBridgeStatus('');
        setBridgeError('');
        setPendingClaim(null);
        setPendingEpoch(null);
        setFromAmount('');
        setToAmount('');
        setLockTxHash('');
    };

    if ((showClaimConfirm && pendingClaim) || showBridgeConfirm) {
        const isClaim = showClaimConfirm && !!pendingClaim;
        const bridgeAmount = isClaim ? pendingClaim.amount : fromAmount;
        const bridgeType = isClaim ? 'claim' : (bridgeDir === 'o2e' ? 'lock' : 'burn');
        
        const fromAddr = bridgeType === 'burn' ? wallet.evmAddress : address;
        const toAddr = bridgeType === 'burn' ? address : wallet.evmAddress;
        
        const fromSymbol = bridgeType === 'burn' ? 'wOCT' : 'OCT';
        const toSymbol = bridgeType === 'burn' ? 'OCT' : 'wOCT';
        
        const fromIcon = bridgeType === 'burn' ? '/eth-icon.svg' : '/qiubit-icon.svg';
        const toIcon = bridgeType === 'burn' ? '/qiubit-icon.svg' : '/eth-icon.svg';

        const handleConfirm = () => {
            if (isClaim) claimWoct();
            else if (bridgeDir === 'o2e') { setShowBridgeConfirm(false); lockOctToEth(); }
            else burnWoctToOct();
        };

        const handleBack = () => {
            if (isClaim) setShowClaimConfirm(false);
            else setShowBridgeConfirm(false);
        };

        const shortContract = `${ETH_BRIDGE.slice(0, 10)}...${ETH_BRIDGE.slice(-6)}`;

        return (
            <div className="swap-view-container animate-fade-in">
                <header className="view-header-minimal">
                    <button className="header-icon-btn" onClick={handleBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <h2 className="view-title">Confirm {isClaim ? 'Claim' : 'Bridge'}</h2>
                    <div style={{ width: 36 }} />
                </header>

                <div className="claim-confirm-body">
                    {/* Hero amount */}
                    <div className="claim-amount-hero">
                        <div className="claim-receive-label">You will {isClaim ? 'receive' : 'send'}</div>
                        <div className="claim-amount-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <img src={isClaim ? toIcon : fromIcon} alt="" style={{ width: '28px', height: '28px' }} />
                            <span>{bridgeAmount} {isClaim ? toSymbol : fromSymbol}</span>
                        </div>
                        {isClaim && <div className="claim-epoch-label">Epoch #{pendingClaim.epochId}</div>}
                    </div>

                    {/* Routing Cards */}
                    <div className="claim-info-card">
                        <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                            <div className="claim-card-label" style={{ marginBottom: 0 }}>From · {bridgeType === 'burn' ? 'Ethereum' : 'Octra'}</div>
                            <img src={fromIcon} alt="" style={{ width: '16px', height: '16px', opacity: 0.8 }} />
                        </div>
                        <div className="claim-address-value">{fromAddr}</div>
                    </div>

                    <div className="claim-info-card">
                        <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
                            <div className="claim-card-label" style={{ marginBottom: 0 }}>To · {bridgeType === 'burn' ? 'Octra' : 'Ethereum'}</div>
                            <img src={toIcon} alt="" style={{ width: '16px', height: '16px', opacity: 0.8 }} />
                        </div>
                        <div className="claim-address-value">{toAddr}</div>
                    </div>

                    {/* Network Fee (integrated) */}
                    {(isClaim || bridgeType === 'burn') ? (
                        <div className="claim-info-card" onClick={() => setShowClaimFeePopup(true)} style={{ cursor: 'pointer' }}>
                             <div className="flex justify-between items-center">
                                <div className="claim-card-label" style={{ marginBottom: 0 }}>Network Fee</div>
                                <div className="text-right">
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {claimFeeSpeed.charAt(0).toUpperCase() + claimFeeSpeed.slice(1)}
                                    </div>
                                    {claimGasOpts && (() => {
                                        const ethVal = Number(claimGasOpts[claimFeeSpeed === 'custom' ? 'normal' : claimFeeSpeed].maxFeePerGas * claimGasOpts.gasLimit) / 1e18;
                                        return <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{ethVal.toFixed(6)} ETH</div>;
                                    })()}
                                </div>
                             </div>
                        </div>
                    ) : (
                        <div className="claim-info-card" onClick={() => setShowOctFeePopup(true)} style={{ cursor: 'pointer' }}>
                            <div className="flex justify-between items-center">
                                <div className="claim-card-label" style={{ marginBottom: 0 }}>Network Fee (Octra)</div>
                                <div className="text-right">
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {octFeeSpeed.charAt(0).toUpperCase() + octFeeSpeed.slice(1)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{selectedOctFee.toFixed(4)} OCT</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Meta */}
                    <div className="claim-meta-rows">
                        <div className="claim-meta-row">
                            <span className="claim-meta-label">Network</span>
                            <span className="claim-meta-value">{isClaim || bridgeType === 'burn' ? 'Ethereum Mainnet' : 'Octra Mainnet'}</span>
                        </div>
                        {isClaim && (
                            <div className="claim-meta-row">
                                <span className="claim-meta-label">Contract</span>
                                <span className="claim-meta-value mono">{shortContract}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Fee Selection Bottom Sheet Overlay */}
                {showClaimFeePopup && claimGasOpts && (
                    <div className="fee-popup-overlay" onClick={() => setShowClaimFeePopup(false)}>
                        <div className="fee-popup" onClick={e => e.stopPropagation()}>
                            <div className="fee-popup-header">
                                <span className="fee-popup-title">Network Fee</span>
                                <button className="fee-popup-close" onClick={() => setShowClaimFeePopup(false)}>
                                    <CloseIcon size={16} />
                                </button>
                            </div>
                            <div className="fee-popup-options">
                                {(['slow', 'normal', 'fast'] as const).map((speed) => {
                                    const ethVal = Number(claimGasOpts[speed].maxFeePerGas * claimGasOpts.gasLimit) / 1e18;
                                    const usdVal = ethVal && ethPriceUsd ? ethVal * ethPriceUsd : null;
                                    const label = speed === 'slow' ? 'Slow' : speed === 'normal' ? 'Normal' : 'Fast';
                                    return (
                                        <button
                                            key={speed}
                                            className={`fee-popup-option ${claimFeeSpeed === speed ? 'active' : ''}`}
                                            onClick={() => { setClaimFeeSpeed(speed); setShowClaimFeePopup(false); }}
                                        >
                                            <div className="fee-popup-option-info">
                                                <span className="fee-popup-option-label">{label}</span>
                                            </div>
                                            <div className="fee-popup-option-value">
                                                <div style={{ textAlign: 'right' }}>
                                                    <div>{ethVal.toFixed(6)} ETH</div>
                                                    {usdVal !== null && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>≈ ${usdVal.toFixed(2)}</div>}
                                                </div>
                                                {claimFeeSpeed === speed && <CheckIcon size={16} />}
                                            </div>
                                        </button>
                                    );
                                })}

                                <div className={`fee-popup-option ${claimFeeSpeed === 'custom' ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setClaimFeeSpeed('custom')}>
                                        <span className="fee-popup-option-label">Custom</span>
                                        {claimFeeSpeed === 'custom' && <CheckIcon size={16} />}
                                    </div>
                                    {claimFeeSpeed === 'custom' && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', background: 'var(--bg-primary)', padding: '8px', borderRadius: '8px' }}>
                                            <input 
                                                type="number" 
                                                value={customClaimGasPriceGwei} 
                                                onChange={(e) => setCustomClaimGasPriceGwei(e.target.value)} 
                                                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '14px' }}
                                                placeholder="Gwei"
                                            />
                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>GWEI</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* OCT Fee Popup (for o2e bridge lock) */}
                {showOctFeePopup && bridgeType === 'lock' && (
                    <div className="fee-popup-overlay" onClick={() => setShowOctFeePopup(false)}>
                        <div className="fee-popup" onClick={e => e.stopPropagation()}>
                            <div className="fee-popup-header">
                                <span className="fee-popup-title">Network Fee (Octra)</span>
                                <button className="fee-popup-close" onClick={() => setShowOctFeePopup(false)}>
                                    <CloseIcon size={16} />
                                </button>
                            </div>
                            <div className="fee-popup-options">
                                {([
                                    { key: 'slow', label: 'Slow', val: octFeeEstimate.slow },
                                    { key: 'normal', label: 'Normal', val: octFeeEstimate.medium },
                                    { key: 'fast', label: 'Fast', val: octFeeEstimate.fast },
                                ] as const).map(({ key, label, val }) => (
                                    <button
                                        key={key}
                                        className={`fee-popup-option ${octFeeSpeed === key ? 'active' : ''}`}
                                        onClick={() => { setOctFeeSpeed(key); setShowOctFeePopup(false); }}
                                    >
                                        <div className="fee-popup-option-info">
                                            <span className="fee-popup-option-label">{label}</span>
                                        </div>
                                        <div className="fee-popup-option-value">
                                            <div>{val.toFixed(4)} OCT</div>
                                            {octFeeSpeed === key && <CheckIcon size={16} />}
                                        </div>
                                    </button>
                                ))}
                                <div className={`fee-popup-option ${octFeeSpeed === 'custom' ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOctFeeSpeed('custom')}>
                                        <span className="fee-popup-option-label">Custom</span>
                                        {octFeeSpeed === 'custom' && <CheckIcon size={16} />}
                                    </div>
                                    {octFeeSpeed === 'custom' && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', background: 'var(--bg-primary)', padding: '8px', borderRadius: '8px' }}>
                                            <input
                                                type="number"
                                                value={customOctFee}
                                                onChange={e => setCustomOctFee(e.target.value)}
                                                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '14px' }}
                                                placeholder="0.02"
                                                step="0.001"
                                                min="0.001"
                                            />
                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>OCT</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {bridgeError && (
                    <div className="bridge-notice" style={{ background: '#fff0f0', border: '1px solid #ffcdd2', margin: '0 0 16px 0' }}>
                        <div className="notice-text" style={{ fontSize: '12px', color: '#c62828', wordBreak: 'break-word' }}>{bridgeError}</div>
                    </div>
                )}

                <div className="claim-confirm-footer">
                    <button className="btn-confirm-claim" onClick={handleConfirm} disabled={isFetchingClaimFee}>
                        {isFetchingClaimFee ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <div className="spinner-small" style={{ borderTopColor: '#000' }} />
                                <span>Processing...</span>
                            </div>
                        ) : `Confirm ${isClaim ? 'Claim' : 'Bridge'}`}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="swap-view-container animate-fade-in">
            <header className="view-header-minimal">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="view-title">Swap & Bridge</h2>
                <button className="header-icon-btn" onClick={() => onRefresh('public')} disabled={isRefreshing}>
                    <RefreshIcon size={18} className={isRefreshing ? 'spin-animation' : ''} />
                </button>
            </header>

            {/* Mode Tabs */}
            <div className="swap-mode-tabs">
                <div className={`mode-indicator mode-${mode}`} />
                <button className={`mode-tab ${mode === 'public' ? 'active' : ''}`} onClick={() => setMode('public')}>
                    Swap
                </button>
                <button className={`mode-tab ${mode === 'bridge' ? 'active' : ''}`} onClick={() => setMode('bridge')}>
                    Bridge
                </button>
            </div>

            <div className="swap-main-card">
                {/* From Token */}
                <div className="swap-section">
                    <div className="section-header">
                        <span className="section-label">From</span>
                        <span className="section-balance">Balance: {formatAmount(fromToken?.balance || 0)} {fromToken?.symbol}</span>
                    </div>
                    <div className="token-input-row">
                        <input
                            type="number"
                            className="swap-input"
                            placeholder="0.00"
                            value={fromAmount}
                            onChange={(e) => setFromAmount(e.target.value)}
                            disabled={bridgeStep > 0 || isSwapping}
                        />
                        <button
                            className="token-selector-btn"
                            onClick={() => mode !== 'bridge' && bridgeStep === 0 && setShowSelector('from')}
                            disabled={bridgeStep > 0 || isSwapping || mode === 'bridge'}
                        >
                            {fromToken?.logoUrl ? <img src={fromToken.logoUrl} alt="" className="token-icon-small" /> : <div className="token-icon-placeholder">{fromToken?.symbol?.slice(0, 2)}</div>}
                            <span className="token-symbol">{fromToken?.symbol}</span>
                            {mode !== 'bridge' && <ChevronDownIcon size={16} />}
                        </button>
                    </div>
                </div>

                {/* Swap/Bridge direction button */}
                <div className="swap-divider">
                    <div className="divider-line" />
                    <button className="swap-action-trigger" onClick={handleSwapDirection} disabled={bridgeStep > 0 || isSwapping}>
                        <SwapIcon size={18} />
                    </button>
                    <div className="divider-line" />
                </div>

                {/* To Token */}
                <div className="swap-section">
                    <div className="section-header">
                        <span className="section-label">To</span>
                        <span className="section-balance">
                            {toToken ? `Balance: ${formatAmount(toToken.balance)} ${toToken.symbol}` : '---'}
                        </span>
                    </div>
                    <div className="token-input-row">
                        <input type="number" className="swap-input" placeholder="0.00" value={toAmount} readOnly />
                        <button
                            className={`token-selector-btn ${!toToken ? 'select-empty' : ''}`}
                            onClick={() => mode !== 'bridge' && bridgeStep === 0 && setShowSelector('to')}
                            disabled={bridgeStep > 0 || isSwapping || mode === 'bridge'}
                        >
                            {toToken ? (
                                <>
                                    {toToken.logoUrl ? <img src={toToken.logoUrl} alt="" className="token-icon-small" /> : <div className="token-icon-placeholder">{toToken.symbol?.slice(0, 2)}</div>}
                                    <span className="token-symbol">{toToken.symbol}</span>
                                </>
                            ) : <span className="token-symbol">Select Token</span>}
                            {mode !== 'bridge' && <ChevronDownIcon size={16} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info rows */}
            <div className="swap-info-grid">
                <div className="info-row">
                    <span className="info-label">Exchange Rate</span>
                    <span className="info-value">{mode === 'bridge' ? '1 OCT = 1 wOCT' : lifiQuote ? 'via LI.FI' : '-'}</span>
                </div>
                {mode === 'bridge' && (
                    <div className="info-row">
                        <span className="info-label">Route</span>
                        <span className="info-value text-accent font-medium">
                            {bridgeDir === 'o2e' ? 'Octra → Ethereum' : 'Ethereum → Octra'}
                        </span>
                    </div>
                )}
                {mode === 'bridge' && (
                    <div className="info-row">
                        <span className="info-label">Recipient</span>
                        <span className="info-value font-mono" style={{ fontSize: '11px', opacity: 0.8 }}>
                            {bridgeDir === 'o2e' 
                                ? (ethRecipient ? `${ethRecipient.slice(0, 6)}...${ethRecipient.slice(-4)}` : 'No EVM Address')
                                : (octRecipient ? `${octRecipient.slice(0, 10)}...${octRecipient.slice(-6)}` : 'No Octra Address')
                            }
                        </span>
                    </div>
                )}
            </div>

            {mode === 'public' && (
                <div className="swap-info-grid" style={{ marginBottom: '8px' }}>
                    <div className="info-row" style={{ alignItems: 'center' }}>
                        <span className="info-label">Slippage</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {(['0.1', '0.5', '1.0'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSlippage(s)}
                                    style={{
                                        padding: '3px 8px',
                                        borderRadius: '8px',
                                        border: slippage === s ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                                        background: slippage === s ? 'rgba(0,212,255,0.1)' : 'var(--bg-secondary)',
                                        color: slippage === s ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {s}%
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Bridge progress */}
            {mode === 'bridge' && bridgeStep > 0 && (
                <div className="bridge-progress-card">
                    <div className={`progress-step ${bridgeStep >= 1 ? 'active' : ''}`}>
                        <div className="step-icon">{bridgeStep > 1 ? <CheckIcon size={14} /> : <div className="spinner-small" />}</div>
                        <div className="step-text">{bridgeDir === 'o2e' ? 'Locking OCT on Octra' : 'Approving wOCT'}</div>
                    </div>
                    <div className="progress-connector" />
                    <div className={`progress-step ${bridgeStep >= 2 ? 'active' : ''}`}>
                        <div className="step-icon">{bridgeStep > 2 ? <CheckIcon size={14} /> : bridgeStep === 2 ? <div className="spinner-small" /> : <div className="dot" />}</div>
                        <div className="step-text">{bridgeDir === 'o2e' ? 'Waiting for Bridge Header' : 'Burning wOCT'}</div>
                    </div>
                    <div className="progress-connector" />
                    <div className={`progress-step ${bridgeStep >= 3 ? 'active' : ''}`}>
                        <div className="step-icon">{bridgeStep > 3 ? <CheckIcon size={14} /> : bridgeStep === 3 ? <div className="dot active-dot" /> : <div className="dot" />}</div>
                        <div className="step-text">{bridgeDir === 'o2e' ? 'Claim on Ethereum' : 'Unlocking OCT'}</div>
                    </div>
                </div>
            )}

            {/* Bridge status / error */}
            {mode === 'bridge' && lockTxHash && bridgeStep >= 2 && (
                <div className="bridge-notice" style={{ background: 'var(--bg-secondary)', padding: '8px 12px' }}>
                    <a
                        href={`${import.meta.env.VITE_EXPLORER_URL}/tx.html?hash=${lockTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: 'var(--accent-primary)', textDecoration: 'none' }}
                    >
                        View lock tx on OctraScan ↗
                    </a>
                </div>
            )}
            {mode === 'bridge' && bridgeStatus && (
                <div className="bridge-notice" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="notice-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{bridgeStatus}</div>
                </div>
            )}
            {mode === 'bridge' && bridgeError && (
                <div className="bridge-notice" style={{ background: '#fff0f0', border: '1px solid #ffcdd2' }}>
                    <div className="notice-text" style={{ fontSize: '12px', color: '#c62828', wordBreak: 'break-word' }}>{bridgeError}</div>
                </div>
            )}

            {/* Swap status / error */}
            {mode === 'public' && swapStatus && (
                <div className="bridge-notice"><div className="notice-text">{swapStatus}</div></div>
            )}
            {mode === 'public' && swapError && (
                <div className="bridge-notice" style={{ background: '#fff0f0', border: '1px solid #ffcdd2' }}>
                    <div className="notice-text" style={{ color: '#c62828', wordBreak: 'break-word' }}>{swapError}</div>
                </div>
            )}

            {/* Action buttons */}
            <div className="action-buttons-stack">
                {mode === 'public' && (
                    <button
                        className="btn-swap-execute"
                        disabled={!toToken || !fromAmount || isSwapping || !fromToken?.isEVM || !toToken?.isEVM}
                        onClick={handleEvmSwap}
                    >
                        {isSwapping ? 'Swapping...' : 'Swap Assets'}
                    </button>
                )}

                {mode === 'bridge' && bridgeStep === 0 && (
                    <button
                        className="btn-swap-execute bridge-style"
                        disabled={!fromAmount || parseFloat(fromAmount) <= 0}
                        onClick={handleBridgeExecute}
                    >
                        {bridgeDir === 'o2e' ? 'Bridge OCT → wOCT' : 'Bridge wOCT → OCT'}
                    </button>
                )}

                {mode === 'bridge' && bridgeStep === 1 && (
                    <button className="btn-swap-execute bridge-style" disabled>
                        <div className="spinner-small" style={{ marginRight: '8px' }} /> Processing...
                    </button>
                )}

                {mode === 'bridge' && bridgeStep === 2 && bridgeDir === 'o2e' && (
                    <button className="btn-swap-execute bridge-style" disabled>
                        <div className="spinner-small" style={{ marginRight: '8px' }} /> Waiting for relayer...
                    </button>
                )}

                {mode === 'bridge' && bridgeStep === 3 && bridgeDir === 'o2e' && pendingClaim && (
                    <button className="btn-claim active" onClick={openClaimConfirm}>
                        Claim wOCT on Ethereum
                        <div className="claim-badge">!</div>
                    </button>
                )}

                {/* Persistent claim button — shows if there's a stored pending claim outside active bridge flow */}
                {mode === 'bridge' && bridgeStep === 0 && pendingClaim && (
                    <div className="bridge-pending-claim-banner">
                        <div className="claim-banner-text">
                            <span className="claim-badge-inline">!</span>
                            Unclaimed wOCT — Epoch #{pendingClaim.epochId}
                        </div>
                        <button className="btn-claim active" style={{ marginTop: 8 }} onClick={() => { setBridgeStep(3); setBridgeDir('o2e'); openClaimConfirm(); }}>
                            Claim wOCT
                        </button>
                    </div>
                )}

                {mode === 'bridge' && bridgeStep === 4 && (
                    <button className="btn-success w-full" onClick={resetBridge}>
                        <CheckIcon size={18} /> Bridge Complete
                    </button>
                )}

                {mode === 'bridge' && bridgeStep === 0 && !fromAmount && (
                    <div className="bridge-notice">
                        <div className="notice-icon"><RefreshIcon size={16} /></div>
                        <div className="notice-text">
                            {bridgeDir === 'o2e'
                                ? 'Lock OCT on Octra → receive wOCT on Ethereum (requires ETH for gas to claim)'
                                : 'Burn wOCT on Ethereum → receive OCT on Octra (requires ETH for gas)'}
                        </div>
                    </div>
                )}
            </div>

            {/* Token Selector Modal */}
            {showSelector && mode !== 'bridge' && (
                <div className="modal-overlay" onClick={() => setShowSelector(null)}>
                    <div className="modal-content selector-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-semibold">Select Token</h3>
                        </div>
                        <div className="token-list-container">
                            {tokens
                                .filter((t: Token) => {
                                    if (showSelector === 'from') return t.symbol !== toToken?.symbol;
                                    if (showSelector === 'to') return t.symbol !== fromToken?.symbol;
                                    return true;
                                })
                                .map((token: Token) => (
                                    <div
                                        key={token.symbol}
                                        className={`token-select-item ${(showSelector === 'from' ? fromToken : toToken)?.symbol === token.symbol ? 'selected' : ''}`}
                                        onClick={() => handleSelectToken(token)}
                                    >
                                        <div className="flex items-center gap-md">
                                            {token.logoUrl ? (
                                                <img src={token.logoUrl} alt="" className="token-icon-small" style={{ width: '24px', height: '24px', marginRight: '8px' }} />
                                            ) : (
                                                <div className="token-icon-placeholder">{token.symbol.slice(0, 2)}</div>
                                            )}
                                            <div>
                                                <div className="font-bold">{token.symbol}</div>
                                                <div className="text-xs text-tertiary">{token.name}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-medium text-sm">{formatAmount(token.balance)}</div>
                                            <div className="text-xs" style={{ color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                {selectorPrices.get(token.symbol)?.price
                                                    ? formatPrice(selectorPrices.get(token.symbol)!.price)
                                                    : '-'}
                                            </div>
                                            {(showSelector === 'from' ? fromToken : toToken)?.symbol === token.symbol && <CheckIcon size={14} className="text-accent" />}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

