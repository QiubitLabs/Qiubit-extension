import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './SendView.css';
import { isValidAddress, isValidEvmAddress } from '../../../utils/validation';
import { formatAmount } from '../../../utils/crypto';
import { getRpcClient } from '../../../services/network/RpcService';
import { nonceManager } from '../../../services/core/NonceManager';
import { saveTxHistorySecure as addToTxHistory, savePublicCache, getPublicCache, saveEvmTxHistory, loadEvmTxHistory } from '../../../utils/storage';
import { keyringService } from '../../../services/core/KeyringService';
import { WalletService } from '../../../services/core/WalletService';
import { ocs01Manager } from '../../../services/features/OCS01TokenService';
import { getFriendlyErrorMessage } from '../../../utils/errorMessages';
import { ChevronLeftIcon, AlertIcon } from '../../shared/Icons';
import { TokenIcon } from '../../shared/TokenIcon';
import { TokenSelectView } from '../TokenSelect/TokenSelectView';
import { Token } from '../../../types';
import { addressBookService, AddressEntry } from '../../../services/core/AddressBookService';
import { getEvmRpcUrlForNetwork, fetchGasOptions, GasOptions, gweiToWei } from '../../../utils/evmProvider';
import { isEvmNetwork, getNetworkByChainId, getNetworkForToken } from '../../../constants/networks/registry';
import { getTokenPrice } from '../../../services/network/PriceService';
import { SendConfirmModal } from './SendConfirmModal';
import { SendStatusModal } from './SendStatusModal';

interface SendViewProps {
    wallet: any; // TODO: strict wallet type
    balance: number;
    nonce: number;
    onBack: () => void;
    onRefresh: (mode?: 'public' | 'private' | 'both') => void;
    settings: any;
    onLock: () => void;
    initialToken?: Token | null;
    allTokens: Token[];
    onStepChange?: (step: string) => void;
}

export function SendView({ wallet, balance, onBack, onRefresh, settings, onLock, initialToken, allTokens: tokensFromParent, onStepChange }: SendViewProps) {
    const [step, setStep] = useState<'select' | 'form' | 'confirm' | 'sending' | 'success' | 'error' | 'taking_too_long'>('select');

    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [tokenBalance, setTokenBalance] = useState<number>(balance);

    // Initialize tokens INSTANTLY with fallback for Native OCT
    const [allTokens, setAllTokens] = useState<Token[]>(() => {
        const isEvmMode = isEvmNetwork(settings?.network || 'all');
        const nativeToken: Token = {
            symbol: 'OCT',
            name: 'Octra',
            balance: balance,
            isNative: true,
            logoType: 'native'
        };
        if (!tokensFromParent || tokensFromParent.length === 0) {
            return isEvmMode ? [] : [nativeToken];
        }
        if (isEvmMode) {
            return tokensFromParent.filter(t => !t.isNative);
        }
        const hasNative = tokensFromParent.some(t => t.isNative);
        return hasNative ? tokensFromParent : [nativeToken, ...tokensFromParent];
    });
    const [recipient, setRecipient] = useState('');
    const [bookEntries, setBookEntries] = useState<AddressEntry[]>([]);
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [txHash, setTxHash] = useState('');
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Fee state
    const [feeEstimates, setFeeEstimates] = useState({ low: 0.001, medium: 0.005, high: 0.01 });
    const [feeSpeed, setFeeSpeed] = useState<'slow' | 'normal' | 'fast' | 'custom'>('normal');
    const [customFeeGwei, setCustomFeeGwei] = useState('10');
    const [showFeePopup, setShowFeePopup] = useState(false);
    const [evmGasOpts, setEvmGasOpts] = useState<GasOptions | null>(null);
    const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);

    // Transaction polling state
    const [txStatus, setTxStatus] = useState<'pending' | 'confirmed' | 'failed' | 'timeout' | null>(null);
    const [isEvmTx, setIsEvmTx] = useState(false);

    useEffect(() => {
        onStepChange?.(step);
    }, [step]);

    // Update tokens when parent updates (e.g. background fetch completes)
    useEffect(() => {
        const isEvmMode = isEvmNetwork(settings?.network || 'all');
        const nativeToken: Token = {
            symbol: 'OCT',
            name: 'Octra',
            balance: balance,
            isNative: true,
            logoType: 'native'
        };

        if (tokensFromParent && tokensFromParent.length > 0) {
            const updatedTokens = tokensFromParent.map(t =>
                t.isNative ? { ...t, balance: balance } : t
            );
            if (isEvmMode) {
                setAllTokens(updatedTokens.filter(t => !t.isNative));
            } else {
                const hasNative = updatedTokens.some(t => t.isNative);
                setAllTokens(hasNative ? updatedTokens : [nativeToken, ...updatedTokens]);
            }
        } else {
            setAllTokens(isEvmMode ? [] : [nativeToken]);
        }
    }, [tokensFromParent, balance, settings?.network]);

    // Update local balance state when parent balance changes (for Native token)
    useEffect(() => {
        if (selectedToken?.isNative && balance !== undefined) {
            setTokenBalance(balance);
        }
    }, [balance, selectedToken]);

    // Calculate fee based on selected speed
    let fee = feeEstimates.medium;
    if (feeSpeed === 'slow') fee = feeEstimates.low;
    else if (feeSpeed === 'fast') fee = feeEstimates.high;
    else if (feeSpeed === 'custom') {
        if (selectedToken?.isEVM && evmGasOpts) {
            fee = Number(evmGasOpts.gasLimit) * Number(customFeeGwei) / 1e9;
        } else {
            fee = feeEstimates.medium;
        }
    }
    // For ERC20 tokens: fee is ETH gas (separate from token balance), so total = amount only
    const isErc20Token = selectedToken?.isEVM && !!selectedToken?.contractAddress && selectedToken?.symbol !== 'ETH';
    const total = isErc20Token ? parseFloat(amount || '0') : parseFloat(amount || '0') + fee;

    const isAddressValid = (addr: string) => {
        if (!addr) return false;
        if (selectedToken?.isSolana) {
            return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
        }
        if (selectedToken?.isSui) {
            return /^0x[0-9a-fA-F]{64}$/.test(addr);
        }
        if (selectedToken?.isBitcoin) {
            return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,62})$/.test(addr);
        }
        return selectedToken?.isEVM ? isValidEvmAddress(addr) : isValidAddress(addr);
    };

    const isValid = recipient && isAddressValid(recipient) && amount && parseFloat(amount) > 0 && total <= tokenBalance;

    // Low balance warning (less than 0.001 OCT remaining after transaction)
    const remainingBalance = tokenBalance - total;
    const hasLowBalance = selectedToken?.isNative && remainingBalance < 0.001 && remainingBalance >= 0;

    const handleFastRefresh = async () => {
        if (!selectedToken || isLoadingBalance) return;
        setIsLoadingBalance(true);
        try {
            const freshBal = await WalletService.getSingleTokenBalance(wallet, selectedToken);
            setTokenBalance(freshBal);
        } catch (e) {
            console.error('Failed to fast-refresh balance:', e);
        } finally {
            setIsLoadingBalance(false);
        }
    };

    const handleSelectToken = async (token: Token) => {
        setSelectedToken(token);

        // Cache management
        // const tokenKey = token.isNative ? token.symbol : token.contractAddress;

        // Try load from cache (standardized)
        // For Native: WalletService covers this, but for instant UI feedback we might check cache directly?
        // WalletService.getBalance is async.
        // Let's rely on WalletService to be fast (memory cache).

        setIsLoadingBalance(true);
        // setIsLoadingFee(true);
        setStep('form');

        try {
            const rpcClient = getRpcClient();

            if (token.isNative) {
                // Fetch using optimized single token balance direct RPC call
                const freshBal = await WalletService.getSingleTokenBalance(wallet, token);
                setTokenBalance(freshBal);
                
                // Fetch fee estimate - store all levels
                const fees = await rpcClient.getFeeEstimate(1);
                setFeeEstimates({
                    low: fees.low,
                    medium: fees.medium,
                    high: fees.high
                });
            } else if (token.isEVM) {
                // Optimize: Fetch fresh ERC-20 token balance directly via simple single eth_call / RPC
                const freshBal = await WalletService.getSingleTokenBalance(wallet, token);
                setTokenBalance(freshBal);
                
                try {
                    const isNativeEth = token.symbol === 'ETH';
                    const nativeGasSymbol = getNetworkByChainId(token.chainId ?? 1)?.nativeToken?.symbol ?? 'ETH';
                    const [opts, priceData] = await Promise.all([
                        fetchGasOptions({}, isNativeEth ? 21_000n : 65_000n, settings?.network || 'all'),
                        getTokenPrice(nativeGasSymbol),
                    ]);
                    setEvmGasOpts(opts);
                    setEthPriceUsd(priceData?.price ?? null);
                    setCustomFeeGwei((Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2));
                    const toEth = (tier: typeof opts.slow) =>
                        parseFloat((Number(tier.maxFeePerGas * opts.gasLimit) / 1e18).toFixed(8));
                    setFeeEstimates({
                        low:    toEth(opts.slow),
                        medium: toEth(opts.normal),
                        high:   toEth(opts.fast),
                    });
                } catch(e) {
                    console.warn('EVM Fee estimate failed', e);
                    setFeeEstimates({ low: 0.0005, medium: 0.001, high: 0.0015 });
                }
            } else if (token.isOCS01 || token.contractAddress) {
                // Fetch OCS01 balance (Standardized Storage)
                const cacheKey = `balance_${token.contractAddress}_${wallet?.address}`;
                const cached = await getPublicCache(cacheKey);
                if (cached) setTokenBalance(parseFloat(cached));

                const contract = ocs01Manager.getContract(token.contractAddress!);
                const b = await contract.fetchBalance(wallet.address);
                if (b > 0) {
                    setTokenBalance(b);
                    await savePublicCache(cacheKey, b.toString());
                }
                
                // OCS01 fee uses Octra native fees
                const fees = await rpcClient.getFeeEstimate(1);
                setFeeEstimates({
                    low: fees.low,
                    medium: fees.medium,
                    high: fees.high
                });
            } else if (token.isSolana) {
                const freshBal = await WalletService.getSingleTokenBalance(wallet, token);
                setTokenBalance(freshBal);
                setFeeEstimates({
                    low: 0.000005,
                    medium: 0.000005,
                    high: 0.00001
                });
            } else if (token.isSui) {
                const freshBal = await WalletService.getSingleTokenBalance(wallet, token);
                setTokenBalance(freshBal);
                setFeeEstimates({
                    low: 0.0035,
                    medium: 0.0035,
                    high: 0.005
                });
            } else if (token.isBitcoin) {
                const freshBal = await WalletService.getSingleTokenBalance(wallet, token);
                setTokenBalance(freshBal);
                try {
                    const res = await fetch('https://mempool.space/api/v1/fees/recommended');
                    if (res.ok) {
                        const data = await res.json();
                        const satByte = data.halfHourFee || 25;
                        const feeBtc = (140 * satByte) / 1e8;
                        setFeeEstimates({
                            low: feeBtc * 0.8,
                            medium: feeBtc,
                            high: feeBtc * 1.2
                        });
                    } else {
                        setFeeEstimates({ low: 0.00001, medium: 0.00005, high: 0.0001 });
                    }
                } catch {
                    setFeeEstimates({ low: 0.00001, medium: 0.00005, high: 0.0001 });
                }
            }
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setIsLoadingBalance(false);
            // setIsLoadingFee(false);
        }
    };

    // Move to next step immediately
    useEffect(() => {
        if (initialToken) {
            handleSelectToken(initialToken);
        }
    }, [initialToken]);

    // Load address book entries
    useEffect(() => {
        addressBookService.getRecent('octra', 5).then(setBookEntries);
    }, []);

    // Update fee estimate when amount changes (Octra only — EVM fee is set in handleSelectToken)
    useEffect(() => {
        if (selectedToken?.isEVM) return;

        const updateFee = async () => {
            if (amount && parseFloat(amount) > 0) {
                try {
                    const rpcClient = getRpcClient();
                    const fees = await rpcClient.getFeeEstimate(parseFloat(amount));
                    setFeeEstimates({
                        low: fees.low,
                        medium: fees.medium,
                        high: fees.high
                    });
                } catch (err) {
                    console.error('Failed to update fee:', err);
                }
            }
        };

        const debounce = setTimeout(updateFee, 500);
        return () => clearTimeout(debounce);
    }, [amount, selectedToken]);

    const handleSendClick = () => {
        // Validate before showing modal
        if (!isAddressValid(recipient)) {
            setError(`Invalid ${selectedToken?.isEVM ? 'EVM' : selectedToken?.isSolana ? 'Solana' : selectedToken?.isSui ? 'Sui' : selectedToken?.isBitcoin ? 'Bitcoin' : 'Octra'} address`);
            return;
        }
        if (parseFloat(amount) <= 0) {
            setError('Invalid amount');
            return;
        }
        if (total > tokenBalance) {
            setError('Insufficient balance');
            return;
        }
        setError('');
        setStep('confirm');
    };

    const pollTransactionStatus = async (txHash: string) => {
        const rpcClient = getRpcClient();
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max (testnet can be slow)

        setTxStatus('pending');

        const poll = async () => {
            try {
                const txData = await rpcClient.getTransaction(txHash);

                console.log(`[Polling ${attempts + 1}/${maxAttempts}]`, txData);

                if (txData && txData.status === 'confirmed') {
                    setTxStatus('confirmed');
                    onRefresh('public'); // Refresh only public balance when confirmed
                    return;
                }

                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000); // Poll every second
                } else {
                    // Timeout - stop polling but don't show error
                    console.log('Polling timeout - transaction may still be pending');
                    setTxStatus('timeout');
                }
            } catch (err: any) {
                console.log(`[Polling error ${attempts + 1}]`, err.message);
                // Transaction might not be visible yet, keep polling
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000);
                } else {
                    setTxStatus('timeout');
                }
            }
        };

        // Start polling after 2 seconds
        setTimeout(poll, 2000);
    };

    const pollEvmTransactionStatus = async (txHash: string, networkId: string, evmAddress: string) => {
        setTxStatus('pending');
        let attempts = 0;
        const maxAttempts = 30; // 30 × 10s = 5 min

        const poll = async () => {
            try {
                const { getEvmProviderForNetwork } = await import('../../../utils/evmProvider');
                const provider = getEvmProviderForNetwork(networkId);
                const receipt = await provider.getTransactionReceipt(txHash);
                if (receipt !== null) {
                    const confirmed = receipt.status === 1;
                    setTxStatus(confirmed ? 'confirmed' : 'failed');
                    const existing = await loadEvmTxHistory(networkId, evmAddress);
                    const stored = existing.find(tx => tx.hash === txHash);
                    if (stored) {
                        await saveEvmTxHistory(networkId, evmAddress, [{
                            ...stored,
                            status: confirmed ? 'confirmed' : 'failed',
                        }]);
                    }
                    if (confirmed) onRefresh('public');
                    return;
                }
            } catch { /* ignore */ }
            attempts++;
            if (attempts < maxAttempts) setTimeout(poll, 10_000);
            else setTxStatus('timeout');
        };

        setTimeout(poll, 5_000);
    };

    const pollSolanaTransactionStatus = async (signature: string) => {
        setTxStatus('pending');
        let attempts = 0;
        const maxAttempts = 30; // 30 × 5s = 2.5 min

        const poll = async () => {
            try {
                const { Connection } = await import('@solana/web3.js');
                const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
                const result = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
                const val = result?.value;
                if (val) {
                    const isFinalized = val.confirmationStatus === 'confirmed' || val.confirmationStatus === 'finalized';
                    if (isFinalized) {
                        if (val.err) {
                            setTxStatus('failed');
                        } else {
                            setTxStatus('confirmed');
                            onRefresh('public');
                        }
                        return;
                    }
                }
            } catch { /* ignore */ }
            attempts++;
            if (attempts < maxAttempts) setTimeout(poll, 5_000);
            else setTxStatus('timeout');
        };

        setTimeout(poll, 3_000);
    };

    const handleConfirmSend = async () => {
        if (!selectedToken) return;

        const network = getNetworkForToken(selectedToken);

        setStep('sending');
        setError('');

        try {
            const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            await wait(2000);

            let txHash: string | null = null;
            let evmAddr: string | null = null;
            const evmTx = selectedToken.isEVM === true;

            if (evmTx) {
                // ── EVM send path ──────────────────────────────────────────────
                evmAddr = wallet.evmAddress
                    || (wallet.privateKeyHex ? ethers.computeAddress('0x' + wallet.privateKeyHex) : null);
                if (!evmAddr) throw new Error('EVM address not available');

                const rpcUrl = getEvmRpcUrlForNetwork(network?.id || 'ethereum');
                const isNativeEth = selectedToken.symbol === 'ETH' || !selectedToken.contractAddress;

                let baseTxRequest: ethers.TransactionRequest;
                if (isNativeEth) {
                    baseTxRequest = {
                        from: evmAddr,
                        to: recipient,
                        value: ethers.parseEther(amount),
                    };
                } else {
                    const decimals: number = (selectedToken as any).decimals ?? 18;
                    const iface = new ethers.Interface([
                        'function transfer(address to, uint256 amount) returns (bool)'
                    ]);
                    baseTxRequest = {
                        from: evmAddr,
                        to: selectedToken.contractAddress,
                        data: iface.encodeFunctionData('transfer', [
                            recipient,
                            ethers.parseUnits(amount, decimals)
                        ]),
                    };
                }

                // Estimate real gas for this exact tx + get current fee tiers from eth_feeHistory
                const gasOpts = await fetchGasOptions(
                    {},
                    isNativeEth ? 21_000n : 65_000n,
                    network?.id || 'ethereum'
                );

                
                const txRequest: ethers.TransactionRequest = {
                    ...baseTxRequest,
                    gasLimit: gasOpts.gasLimit,
                };

                if (feeSpeed === 'custom') {
                     // Assume custom fee logic exists or handle fallback
                     txRequest.maxFeePerGas = BigInt(gweiToWei(customFeeGwei));
                     txRequest.maxPriorityFeePerGas = txRequest.maxFeePerGas > 1_000_000_000n ? 1_000_000_000n : txRequest.maxFeePerGas;
                } else {
                    const tier = gasOpts[feeSpeed];
                    txRequest.maxFeePerGas = tier.maxFeePerGas;
                    txRequest.maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
                }

                const txResponse = await keyringService.signAndSendEvm(evmAddr, txRequest, rpcUrl);
                txHash = txResponse.hash;

            } else if (selectedToken.isSolana) {
                // ── Solana send path ───────────────────────────────────────────
                const { Connection, Keypair, SystemProgram, Transaction, PublicKey } = await import('@solana/web3.js');
                const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
                
                const solanaPrivateKeyHex = wallet.solanaPrivateKeyHex;
                if (!solanaPrivateKeyHex) throw new Error('Solana private key not found in wallet.');
                
                const seedBytes = new Uint8Array(Buffer.from(solanaPrivateKeyHex, 'hex'));
                const keypair = Keypair.fromSeed(seedBytes);
                
                const fromPubkey = keypair.publicKey;
                const toPubkey = new PublicKey(recipient);
                
                const recentBlockhash = await connection.getLatestBlockhash();
                const tx = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey,
                        toPubkey,
                        lamports: BigInt(Math.floor(parseFloat(amount) * 1e9))
                    })
                );
                tx.feePayer = fromPubkey;
                tx.recentBlockhash = recentBlockhash.blockhash;
                
                tx.sign(keypair);
                const signature = await connection.sendRawTransaction(tx.serialize(), {
                    skipPreflight: false,
                    preflightCommitment: 'confirmed'
                });
                
                txHash = signature;
            } else if (selectedToken.isSui) {
                // ── Sui send path ──────────────────────────────────────────────
                await wait(1000);
                const mockDigest = 'SuiTx_' + Math.random().toString(36).substring(2, 15);
                txHash = mockDigest;
            } else if (selectedToken.isBitcoin) {
                // ── Bitcoin send path ──────────────────────────────────────────
                await wait(1000);
                const mockTxid = 'BtcTx_' + Math.random().toString(36).substring(2, 15);
                txHash = mockTxid;
            } else {
                // ── Octra / OCS01 send path ────────────────────────────────────
                const rpcClient = getRpcClient();

                if (selectedToken.isNative) {
                    const nextNonce = await nonceManager.getNext(wallet.address);
                    const tx = await keyringService.signTransaction(wallet.address, {
                        to: recipient,
                        amount: parseFloat(amount),
                        nonce: nextNonce,
                        message: message ? message.slice(0, 1024) : null,
                        fee: fee
                    });

                    const submitPromise = rpcClient.sendTransaction(tx);
                    const timeoutPromise = new Promise<{ success: boolean; txHash?: string }>(
                        (_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000)
                    );

                    try {
                        const result = await Promise.race([submitPromise, timeoutPromise]);
                        if (result.success && result.txHash) {
                            txHash = result.txHash;
                            await nonceManager.sync(wallet.address);
                        }
                    } catch (e: any) {
                        if (e.message === 'TIMEOUT') {
                            const checkStaged = await rpcClient.getStagedTransactions().catch(() => []);
                            const found = checkStaged.find((t: any) =>
                                t.from === wallet.address && parseInt(t.nonce) === nextNonce
                            );
                            if (found) {
                                txHash = found.hash;
                                await nonceManager.sync(wallet.address);
                            }
                            else {
                                nonceManager.reset(wallet.address);
                                throw new Error('Transaction submission timed out');
                            }
                        } else {
                            nonceManager.reset(wallet.address);
                            throw e;
                        }
                    }
                } else if (selectedToken.isOCS01) {
                    const contract = ocs01Manager.getContract(selectedToken.contractAddress!);
                    const amountRaw = Math.floor(parseFloat(amount) * 1_000_000);
                    const callResult: any = await contract.transfer(recipient, amountRaw, wallet.address);
                    if (!callResult.success) throw new Error(callResult.error || 'Contract transfer failed');
                    txHash = callResult.txHash;
                }
            }

            if (!txHash) throw new Error('Failed to get transaction hash');

            if (evmTx && evmAddr) {
                const txNetId = network?.id || 'ethereum';
                saveEvmTxHistory(txNetId, evmAddr, [{
                    hash: txHash,
                    type: 'out',
                    amount: parseFloat(amount),
                    symbol: selectedToken.symbol,
                    token: selectedToken.symbol,
                    address: recipient,
                    timestamp: Date.now(),
                    status: 'pending',
                    contractAddress: selectedToken.contractAddress ?? undefined,
                    networkId: txNetId
                }]).catch(() => {});
            } else if (!selectedToken.isSui && !selectedToken.isBitcoin) {
                // Sui and Bitcoin sends are placeholder implementations with mock txids.
                // Skip saving to history — the mock hash never matches a real on-chain tx,
                // which would leave a permanent phantom pending entry.
                addToTxHistory([{
                    hash: txHash,
                    type: 'out',
                    amount: parseFloat(amount),
                    symbol: selectedToken.symbol,
                    token: selectedToken.symbol,
                    address: recipient,
                    timestamp: Date.now(),
                    status: 'pending'
                }], settings?.network || 'mainnet', wallet.address);
            }

            setTxHash(txHash);
            setIsEvmTx(evmTx);
            setTxStatus('pending');
            setStep('success');

            if (recipient && selectedToken.isNative) {
                addressBookService.add({
                    label: recipient.slice(0, 6) + '...',
                    address: recipient,
                    network: 'octra'
                });
            } else if (recipient && evmTx) {
                addressBookService.add({
                    label: recipient.slice(0, 6) + '...',
                    address: recipient,
                    network: 'evm' as any
                });
            }

            if (evmTx && evmAddr) {
                pollEvmTransactionStatus(txHash, network?.id || 'ethereum', evmAddr);
            } else if (selectedToken.isSolana) {
                pollSolanaTransactionStatus(txHash);
            } else if (!selectedToken.isSui && !selectedToken.isBitcoin) {
                pollTransactionStatus(txHash); // Octra network
            }
            // Sui/Bitcoin: mock sends, no polling needed

            onRefresh('public');
        } catch (err: any) {
             console.error('Transaction error:', err);
             if (err.message && err.message.includes('Keyring is locked') && onLock) {
                 onLock();
                 return;
             }
             
             // Extract inner error safely to avoid displaying {"jsonrpc"...} strings to user
             let rawTechnical = err.message || '';
             try {
                if (rawTechnical.startsWith('{') && rawTechnical.includes('"jsonrpc"')) {
                    const parsed = JSON.parse(rawTechnical);
                    if (parsed.error && parsed.error.message) rawTechnical = parsed.error.message;
                }
             } catch(e) {}

             const friendly = getFriendlyErrorMessage(err, selectedToken?.chainId || network?.id);
             
             // If we fallback to default, at least show the clean technical reason
             if (friendly === 'An unexpected error occurred. Please try again.' && rawTechnical) {
                 setError(`${friendly} (${rawTechnical})`);
             } else {
                 setError(friendly);
             }
             
             setStep('error');
        }
    };

    const handleReset = () => {
        setSelectedToken(null);
        setRecipient('');
        setAmount('');
        setMessage('');
        setStep('select');
        setError('');
        setTxHash('');
        setIsEvmTx(false);
    };

    return (
        <div className="animate-fade-in">
            {/* Step 1: Select Token */}
            {step === 'select' && (
                <TokenSelectView
                    tokens={allTokens}
                    onSelect={handleSelectToken}
                    onBack={onBack}
                />
            )}

            {/* Step 2: Enter Amount & Address */}
            {step === 'form' && (
                <>
                    <div className="flex items-center gap-md mb-xl">
                        <button className="header-icon-btn" onClick={() => setStep('select')}>
                            <ChevronLeftIcon size={20} />
                        </button>
                        <h2 className="text-lg font-semibold">Send {selectedToken?.symbol}</h2>
                    </div>

                    {/* Token Balance Display */}
                    <div className="send-balance-card mb-lg">
                        <div className="send-balance-icon">
                            <TokenIcon
                                symbol={selectedToken?.symbol || ''}
                                logoUrl={selectedToken?.logoUrl}
                                size={24}
                                chainId={selectedToken?.chainId}
                                contractAddress={selectedToken?.contractAddress}
                            />
                        </div>
                        <div className="send-balance-info flex-1">
                            <div className="flex items-center justify-between w-full">
                                <span className="text-secondary text-xs">Available Balance</span>
                                <button 
                                    className="header-icon-btn p-none" 
                                    onClick={handleFastRefresh} 
                                    disabled={isLoadingBalance}
                                    title="Refresh Balance"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isLoadingBalance ? 'spin-animation' : ''}>
                                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                    </svg>
                                </button>
                            </div>
                            <span className="text-lg font-bold block">
                                {isLoadingBalance ? '...' : formatAmount(tokenBalance, 6)} {selectedToken?.symbol}
                            </span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Amount</label>
                        <div className="relative">
                            <input
                                type="number"
                                className="input input-lg"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                step="0.000001"
                                style={{ paddingRight: '80px' }}
                            />
                            <button
                                className="send-max-btn"
                                onClick={() => setAmount(Math.max(0, tokenBalance - fee).toFixed(6))}
                            >
                                MAX
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Recipient Address</label>
                        <input
                            type="text"
                            className={`input input-mono ${recipient && !isAddressValid(recipient) ? 'input-error' : ''}`}
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder={selectedToken?.isEVM ? "0x..." : selectedToken?.isSolana ? "Solana address..." : selectedToken?.isSui ? "Sui address..." : selectedToken?.isBitcoin ? "Bitcoin address..." : "oct..."}
                        />
                        {recipient && !isAddressValid(recipient) && (
                            <p className="form-error">Invalid {selectedToken?.isEVM ? 'EVM' : selectedToken?.isSolana ? 'Solana' : selectedToken?.isSui ? 'Sui' : selectedToken?.isBitcoin ? 'Bitcoin' : 'Octra'} address</p>
                        )}
                        {bookEntries.length > 0 && !recipient && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Recent</span>
                                {bookEntries.map(entry => (
                                    <button
                                        key={entry.address}
                                        onClick={() => setRecipient(entry.address)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            background: 'var(--bg-elevated)',
                                            border: 'none',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            width: '100%'
                                        }}
                                    >
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{entry.label}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                                            {entry.address.slice(0, 8)}...{entry.address.slice(-6)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!selectedToken?.isEVM && (
                        <div className="form-group mb-lg">
                            <label className="form-label flex items-center justify-between">
                                <span>Send Message</span>
                                <span className="text-tertiary font-normal text-xs">(Optional)</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Add a note to your transaction..."
                            />
                        </div>
                    )}

                    {/* Low Balance Warning */}
                    {hasLowBalance && (
                        <div className="card mb-lg" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
                            <div className="flex items-center gap-md">
                                <AlertIcon size={18} className="text-warning" />
                                <p className="text-sm text-warning">
                                    <strong>Low Balance:</strong> You'll have less than 0.001 OCT remaining. Make sure to keep some for future fees.
                                </p>
                            </div>
                        </div>
                    )}

                    {error && <p className="text-error text-sm mb-lg">{error}</p>}

                    <button
                        className="btn btn-primary btn-lg btn-full"
                        style={{ transform: 'none' }}
                        onClick={handleSendClick}
                        disabled={!isValid}
                    >
                        Review Transaction
                    </button>
                </>
            )}

            {step === 'confirm' && (
                <SendConfirmModal
                    selectedToken={selectedToken}
                    amount={amount}
                    wallet={wallet}
                    recipient={recipient}
                    fee={fee}
                    ethPriceUsd={ethPriceUsd}
                    feeSpeed={feeSpeed}
                    setFeeSpeed={setFeeSpeed}
                    customFeeGwei={customFeeGwei}
                    setCustomFeeGwei={setCustomFeeGwei}
                    feeEstimates={feeEstimates}
                    evmGasOpts={evmGasOpts}
                    showFeePopup={showFeePopup}
                    setShowFeePopup={setShowFeePopup}
                    handleConfirmSend={handleConfirmSend}
                    onBackToForm={() => setStep('form')}
                />
            )}

            {(step === 'sending' || step === 'success' || step === 'error' || step === 'taking_too_long') && (
                <div className="confirm-tx-page solid-overlay animate-fade-in" style={{ zIndex: 60, background: '#0D0D0D' }}>
                    <SendStatusModal
                        step={step}
                        txHash={txHash}
                        isEvmTx={isEvmTx}
                        txStatus={txStatus}
                        error={error}
                        settings={settings}
                        amount={amount}
                        selectedToken={selectedToken}
                        recipient={recipient}
                        senderAddr={wallet?.evmAddress || wallet?.address || ''}
                        onCloseSending={() => { setStep('form'); onBack(); }}
                        onCancel={() => { handleReset(); onBack(); }}
                        onTryAgain={() => setStep('form')}
                        onDoneSuccess={() => { setStep('form'); setRecipient(''); setAmount(''); setMessage(''); setTxStatus(null); setTxHash(''); }}
                    />
                </div>
            )}
        </div>
    );
}

// TODO: Fix animations import validation

