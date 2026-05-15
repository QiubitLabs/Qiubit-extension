import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './SendView.css';
import { isValidAddress, isValidEvmAddress } from '../../../utils/validation';
import { formatAmount } from '../../../utils/crypto';
import { getRpcClient } from '../../../services/network/RpcService';
import { saveTxHistorySecure as addToTxHistory, savePublicCache, getPublicCache } from '../../../utils/storage';
import { keyringService } from '../../../services/core/KeyringService';
import { WalletService } from '../../../services/core/WalletService';
import { ocs01Manager } from '../../../services/features/OCS01TokenService';
import { getFriendlyErrorMessage } from '../../../utils/errorMessages';
import { CloseIcon, ChevronLeftIcon, CheckIcon, AlertIcon } from '../../shared/Icons';
import { TokenIcon } from '../../shared/TokenIcon';
import { TokenSelectView } from '../TokenSelect/TokenSelectView';
import { Token } from '../../../types';
import { addressBookService, AddressEntry } from '../../../services/core/AddressBookService';
import { getEvmRpcUrl, fetchGasOptions, GasOptions, gweiToWei } from '../../../utils/evmProvider';
import { getTokenPrice } from '../../../services/network/PriceService';

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
        const nativeToken: Token = {
            symbol: 'OCT',
            name: 'Octra',
            balance: balance,
            isNative: true,
            logoType: 'native'
        };
        if (!tokensFromParent || tokensFromParent.length === 0) {
            return [nativeToken];
        }
        // Ensure native token is present
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
        const nativeToken: Token = {
            symbol: 'OCT',
            name: 'Octra',
            balance: balance,
            isNative: true,
            logoType: 'native'
        };

        if (tokensFromParent && tokensFromParent.length > 0) {
            // Ensure native balance is fresh
            const updatedTokens = tokensFromParent.map(t =>
                t.isNative ? { ...t, balance: balance } : t
            );
            // Check if native exists
            const hasNative = updatedTokens.some(t => t.isNative);
            setAllTokens(hasNative ? updatedTokens : [nativeToken, ...updatedTokens]);
        } else {
            // Fallback if parent list clears for some reason
            setAllTokens([nativeToken]);
        }
    }, [tokensFromParent, balance]);

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
        return selectedToken?.isEVM ? isValidEvmAddress(addr) : isValidAddress(addr);
    };

    const isValid = recipient && isAddressValid(recipient) && amount && parseFloat(amount) > 0 && total <= tokenBalance;

    // Low balance warning (less than 0.001 OCT remaining after transaction)
    const remainingBalance = tokenBalance - total;
    const hasLowBalance = selectedToken?.isNative && remainingBalance < 0.001 && remainingBalance >= 0;

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
                // Fetch using WalletService (Handling Cache + Deduplication)
                const data = await WalletService.getBalance(wallet.address);
                setTokenBalance(data.balance);
                
                // Fetch fee estimate - store all levels
                const fees = await rpcClient.getFeeEstimate(1);
                setFeeEstimates({
                    low: fees.low,
                    medium: fees.medium,
                    high: fees.high
                });
            } else if (token.isEVM) {
                setTokenBalance(typeof token.balance === 'string' ? parseFloat(token.balance) : token.balance);
                
                try {
                    const isNativeEth = token.symbol === 'ETH';
                    const [opts, priceData] = await Promise.all([
                        fetchGasOptions({}, isNativeEth ? 21_000n : 65_000n),
                        getTokenPrice('ETH'),
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
                const result: any = await contract.getCredits(wallet.address, wallet.address);
                if (result.success) {
                    const b = parseFloat(result.result) || 0;
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
            setError(`Invalid ${selectedToken?.isEVM ? 'EVM' : 'Octra'} address`);
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

    const handleConfirmSend = async () => {
        if (!selectedToken) return;

        setStep('sending');
        setError('');

        try {
            const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
            await wait(2000);

            let txHash: string | null = null;
            const evmTx = selectedToken.isEVM === true;

            if (evmTx) {
                // ── EVM send path ──────────────────────────────────────────────
                const evmAddr = wallet.evmAddress
                    || (wallet.privateKeyHex ? ethers.computeAddress('0x' + wallet.privateKeyHex) : null);
                if (!evmAddr) throw new Error('EVM address not available');

                const rpcUrl = getEvmRpcUrl();
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
                    isNativeEth ? 21_000n : 65_000n
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

            } else {
                // ── Octra / OCS01 send path ────────────────────────────────────
                const rpcClient = getRpcClient();

                const data = await rpcClient.getBalance(wallet.address);
                const currentNonce = data.nonce;

                const staged = await rpcClient.getStagedTransactions();
                const ourStaged = staged.filter((tx: any) => tx.from === wallet.address);
                const maxNonce = ourStaged.length > 0
                    ? Math.max(currentNonce, ...ourStaged.map((tx: any) => parseInt(tx.nonce)))
                    : currentNonce;

                if (selectedToken.isNative) {
                    const tx = await keyringService.signTransaction(wallet.address, {
                        to: recipient,
                        amount: parseFloat(amount),
                        nonce: maxNonce + 1,
                        message: message ? message.slice(0, 1024) : null,
                        fee: fee
                    });

                    const submitPromise = rpcClient.sendTransaction(tx);
                    const timeoutPromise = new Promise<{ success: boolean; txHash?: string }>(
                        (_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000)
                    );

                    try {
                        const result = await Promise.race([submitPromise, timeoutPromise]);
                        if (result.success && result.txHash) txHash = result.txHash;
                    } catch (e: any) {
                        if (e.message === 'TIMEOUT') {
                            const checkStaged = await rpcClient.getStagedTransactions().catch(() => []);
                            const found = checkStaged.find((t: any) =>
                                t.from === wallet.address && parseInt(t.nonce) === (maxNonce + 1)
                            );
                            if (found) txHash = found.hash;
                            else throw new Error('Transaction submission timed out');
                        } else {
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

            addToTxHistory([{
                hash: txHash,
                type: 'out',
                amount: parseFloat(amount),
                symbol: selectedToken.symbol,
                address: recipient,
                timestamp: Date.now(),
                status: 'pending'
            }], settings?.network || 'mainnet', wallet.address);

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

            if (!evmTx) pollTransactionStatus(txHash);

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

             const friendly = getFriendlyErrorMessage(err);
             
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
                            />
                        </div>
                        <div className="send-balance-info">
                            <span className="text-secondary text-xs">Available Balance</span>
                            <span className="text-lg font-bold">
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
                            placeholder={selectedToken?.isEVM ? "0x..." : "oct..."}
                        />
                        {recipient && !isAddressValid(recipient) && (
                            <p className="form-error">Invalid {selectedToken?.isEVM ? 'EVM' : 'Octra'} address</p>
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
                <div className="confirm-tx-page animate-fade-in">
                    {/* Header like reference image: < | (U) USD | X */}
                    <div className="flex items-center justify-between mb-xl">
                        <button className="header-icon-btn" onClick={() => setStep('form')} style={{ border: 'none', background: 'transparent' }}>
                            <ChevronLeftIcon size={24} />
                        </button>
                        <div className="flex items-center justify-center gap-xs flex-1 bg-surface px-md py-1 rounded-full mx-auto" style={{ maxWidth: 'fit-content' }}>
                            <TokenIcon symbol={selectedToken?.symbol || ''} size={18} />
                            <span className="font-bold text-sm tracking-wide">{selectedToken?.symbol}</span>
                        </div>
                        <button className="header-icon-btn" onClick={() => setStep('form')} style={{ border: 'none', background: 'transparent' }}>
                            <CloseIcon size={24} />
                        </button>
                    </div>

                    {/* Big Title */}
                    <div className="confirm-v2-title">
                        Confirm <span className="confirm-v2-title-highlight">Transaction</span>
                    </div>

                    {/* Amount & Icon */}
                    <div className="confirm-v2-amount-row">
                        {selectedToken && (
                            <TokenIcon symbol={selectedToken.symbol} size={40} />
                        )}
                        <span className="confirm-v2-amount-val">{amount ? parseFloat(amount) : '0'}</span>
                        <span className="confirm-v2-amount-sym">{selectedToken?.symbol}</span>
                    </div>

                    {/* Details List */}
                    <div className="confirm-v2-details">
                        {/* From */}
                        <div className="confirm-v2-row align-top p-b-md">
                            <span className="confirm-v2-label">From</span>
                            <div className="confirm-v2-value-col">
                                <span className="confirm-v2-address">{wallet?.address}</span>
                                <span className="confirm-v2-wallet-badge">{wallet?.name || 'Wallet 01 - Akun 01'}</span>
                            </div>
                        </div>

                        {/* To */}
                        <div className="confirm-v2-row align-top p-b-md border-b">
                            <span className="confirm-v2-label">To</span>
                            <div className="confirm-v2-value-col">
                                <span className="confirm-v2-address">{recipient}</span>
                            </div>
                        </div>

                        {/* Network Fee */}
                        <div
                            className="confirm-v2-row align-center py-md border-b"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setShowFeePopup(true)}
                        >
                            <span className="confirm-v2-label">Network Fee</span>
                            <div style={{ textAlign: 'right' }}>
                                <span className="confirm-v2-value">
                                    {fee ? `${formatAmount(fee, 6)} ${selectedToken?.isEVM ? 'ETH' : selectedToken?.symbol}` : '--'}
                                </span>
                                {selectedToken?.isEVM && fee && ethPriceUsd && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        ≈ ${(fee * ethPriceUsd).toFixed(2)}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Single Confirm Button */}
                    <div className="confirm-v2-btn-wrapper">
                        <button
                            className="confirm-v2-btn"
                            style={{ background: '#2563EB', color: '#fff', cursor: 'pointer' }}
                            onClick={handleConfirmSend}
                        >
                            Konfirmasi
                        </button>
                    </div>

                    {/* Fee Selection Mini Popup */}
                    {showFeePopup && feeEstimates && (
                        <div className="fee-popup-overlay" onClick={() => setShowFeePopup(false)}>
                            <div className="fee-popup" onClick={e => e.stopPropagation()}>
                                <div className="fee-popup-header">
                                    <span className="fee-popup-title">Network Fee</span>
                                    <button className="fee-popup-close" onClick={() => setShowFeePopup(false)}>
                                        <CloseIcon size={16} />
                                    </button>
                                </div>
                                <div className="fee-popup-options">
                                    {([
                                        { key: 'slow',   label: 'Slow',   desc: 'Lower priority',   amount: feeEstimates.low    },
                                        { key: 'normal', label: 'Normal', desc: 'Recommended',       amount: feeEstimates.medium },
                                        { key: 'fast',   label: 'Fast',   desc: 'Higher priority',   amount: feeEstimates.high   },
                                    ] as const).map(({ key, label, desc, amount }) => {
                                        const usd = selectedToken?.isEVM && ethPriceUsd ? amount * ethPriceUsd : null;
                                        let gweiStr = '';
                                        if (selectedToken?.isEVM && evmGasOpts && (key === 'slow' || key === 'normal' || key === 'fast')) {
                                            const gweiVal = Number(evmGasOpts[key].maxFeePerGas) / 1e9;
                                            gweiStr = `${gweiVal.toFixed(2)} Gwei`;
                                        }
                                        return (
                                            <button
                                                key={key}
                                                className={`fee-popup-option ${feeSpeed === key ? 'active' : ''}`}
                                                onClick={() => { setFeeSpeed(key); setShowFeePopup(false); }}
                                            >
                                                <div className="fee-popup-option-info">
                                                    <span className="fee-popup-option-label">{label}</span>
                                                    <span className="fee-popup-option-desc">{desc}</span>
                                                </div>
                                                <div className="fee-popup-option-value">
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div>{formatAmount(amount)} {selectedToken?.isEVM ? 'ETH' : selectedToken?.symbol}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                            {gweiStr ? `${gweiStr} ` : ''}
                                                            {usd !== null && `(≈ $${usd.toFixed(2)})`}
                                                        </div>
                                                    </div>
                                                    {feeSpeed === key && <CheckIcon size={16} />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                    
                                    {selectedToken?.isEVM && (
                                        <div className={`fee-popup-option ${feeSpeed === 'custom' ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: feeSpeed === 'custom' ? '8px' : '0' }} onClick={() => setFeeSpeed('custom')}>
                                                <div className="fee-popup-option-info">
                                                    <span className="fee-popup-option-label">Custom</span>
                                                    <span className="fee-popup-option-desc">Set your own gas price</span>
                                                </div>
                                                <div className="fee-popup-option-value">
                                                    {feeSpeed === 'custom' && <CheckIcon size={16} />}
                                                </div>
                                            </div>
                                            {feeSpeed === 'custom' && (() => {
                                                const customWei = evmGasOpts ? gweiToWei(customFeeGwei || '0') : 0n;
                                                const customEth = evmGasOpts ? Number(customWei * evmGasOpts.gasLimit) / 1e18 : 0;
                                                const customUsd = customEth && ethPriceUsd ? customEth * ethPriceUsd : 0;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-primary)', padding: '8px', borderRadius: '8px' }}>
                                                            <input 
                                                                type="number" 
                                                                value={customFeeGwei} 
                                                                onChange={(e) => setCustomFeeGwei(e.target.value)} 
                                                                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '14px' }}
                                                                placeholder="Gas Price in Gwei"
                                                            />
                                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Gwei</span>
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                                                            {customEth.toFixed(6)} ETH {customUsd > 0 ? `(≈ $${customUsd.toFixed(2)})` : ''}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Success State */}
            {/* Sending State - 10s Loading Modal */}
            {step === 'sending' && (
                <div className="flex flex-col items-center justify-center py-3xl animate-fade-in" style={{ minHeight: '60vh' }}>
                    <div className="sending-animation-container">
                        <div className="qiubit-ring-outer" />
                        <div className="qiubit-ring-inner" />
                        <div className="qiubit-core" />
                    </div>
                    <h3 className="text-xl font-bold mb-xs">Sending Payment</h3>
                    <p className="text-secondary text-sm text-center max-w-xs">
                        Securing transaction on Octra Network...
                    </p>
                     {/* Allow exit if stuck (User Request) */}
                     <button 
                        className="btn btn-ghost btn-sm mt-xl text-tertiary"
                        onClick={() => { setStep('form'); onBack(); }}
                    >
                        Close
                    </button>
                </div>
            )}

            {/* Success State */}
            {step === 'success' && (
                <div className="flex flex-col items-center justify-center py-3xl text-center animate-scale-in">
                    <div className="success-check-premium">
                        <div className="success-circle-reveal" />
                        <svg className="success-svg" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <path className="checkmark-path" d="M14 27l8 8 16-16" />
                        </svg>
                    </div>
                    <p className="text-xl font-bold mb-sm" style={{ color: 'var(--success)' }}>Transaction Submitted!</p>
                    <p className="text-secondary text-sm mb-xl">
                        Your transaction has been broadcast to the network and is pending confirmation.
                    </p>

                    <div className="card w-full mb-xl">
                        <div className="flex items-center justify-between mb-sm">
                            <p className="text-xs text-secondary">Transaction Hash</p>
                            <button
                                className="icon-btn-ghost"
                                style={{ padding: '4px' }}
                                onClick={async () => {
                                    const text = txHash;
                                    try {
                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                            await navigator.clipboard.writeText(text);
                                        } else {
                                            // Fallback
                                            const textarea = document.createElement('textarea');
                                            textarea.value = text;
                                            textarea.style.position = 'fixed';
                                            textarea.style.left = '-9999px';
                                            document.body.appendChild(textarea);
                                            textarea.select();
                                            document.execCommand('copy');
                                            document.body.removeChild(textarea);
                                        }
                                        // Visual feedback
                                        const btn = document.activeElement;
                                        if (btn) {
                                            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13L9 17L19 7"></path></svg>';
                                            setTimeout(() => {
                                                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                                            }, 1500);
                                        }
                                    } catch (err) {
                                        console.error('Copy failed:', err);
                                    }
                                }}
                                title="Copy transaction hash"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                        </div>
                        <a
                            href={isEvmTx
                                ? `https://etherscan.io/tx/${txHash}`
                                : (settings?.network === 'mainnet' ? `https://octrascan.io/tx.html?hash=${txHash}` : `https://testnet.octrascan.io/tx.html?hash=${txHash}`)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-mono text-xs text-accent hover-underline"
                            style={{
                                cursor: 'pointer',
                                textDecoration: 'none',
                                wordBreak: 'break-all',
                                display: 'block'
                            }}
                        >
                            {txHash}
                        </a>
                        <p className="text-xs text-tertiary mt-xs">
                            Click to view on {isEvmTx ? 'Etherscan' : 'OctraScan'}
                        </p>

                        {/* Transaction Status - Subtle */}
                        <div className="mt-md pt-sm border-top" style={{ borderColor: 'var(--border-subtle)' }}>
                            {txStatus === 'pending' || !txStatus ? (
                                <p className="text-xs text-secondary italic">Transaction Pending Confirmation...</p>
                            ) : txStatus === 'confirmed' ? (
                                <div className="flex items-center justify-center gap-sm text-success">
                                    <CheckIcon size={12} />
                                    <span className="text-xs font-semibold">Confirmed on Chain</span>
                                </div>
                            ) : (
                                <p className="text-xs text-tertiary">Processing on network...</p>
                            )}
                        </div>
                    </div>

                    <button className="btn btn-primary btn-lg" onClick={() => { setStep('form'); setRecipient(''); setAmount(''); setMessage(''); setTxStatus(null); setTxHash(''); }}>
                        Done
                    </button>
                </div>
            )}

            {/* Error State */}
            {step === 'error' && (
                <div className="flex flex-col items-center justify-center py-3xl text-center animate-fade-in">
                    <div className="success-checkmark mb-xl" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                        <CloseIcon size={32} />
                    </div>
                    <p className="text-xl font-bold mb-sm">Transaction Failed</p>
                    <p className="text-secondary text-sm mb-xl max-w-xs mx-auto text-balance leading-relaxed" style={{ wordBreak: 'break-word' }}>
                        {error}
                    </p>

                    <div className="flex gap-md w-full">
                        <button className="btn btn-secondary btn-lg flex-1" onClick={() => { handleReset(); onBack(); }}>
                            Cancel
                        </button>
                        <button className="btn btn-primary btn-lg flex-1" onClick={() => setStep('form')}>
                            Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* Taking Too Long State */}
            {
                step === 'taking_too_long' && (
                    <div className="flex flex-col items-center justify-center py-3xl text-center animate-fade-in">
                        <div className="mb-xl text-warning">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <p className="text-xl font-bold mb-sm">Taking longer than usual...</p>
                        <p className="text-secondary text-sm mb-lg max-w-xs mx-auto">
                            The network is slow to respond, but your transaction might still be processing securely in the background.
                        </p>
                        <div className="bg-subtle p-md rounded-lg mb-xl text-left">
                            <p className="text-xs font-semibold mb-xs">Recommended Action:</p>
                            <ul className="text-xs text-secondary list-disc pl-md space-y-xs">
                                <li>Don't resend immediately (avoids double spend).</li>
                                <li>Go to <strong>History</strong> tab and check for 'Pending' items.</li>
                                <li>Wait 1-2 minutes for network confirmation.</li>
                            </ul>
                        </div>

                        <div className="flex gap-md w-full">
                            <button className="btn btn-primary btn-lg flex-1" onClick={() => { handleReset(); onBack(); }}>
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// TODO: Fix animations import validation

