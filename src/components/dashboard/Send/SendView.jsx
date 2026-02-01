import { useState, useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import successAnimation from '../../welcome/animations/step-complete.json';
import sendingAnimation from './animations/sending.json';
import { isValidAddress, isValidAmount } from '../../../utils/validation';
import { formatAmount, truncateAddress } from '../../../utils/crypto';
import { getRpcClient } from '../../../utils/rpc';
import { saveTxHistorySecure as addToTxHistory } from '../../../utils/storageSecure';
import { keyringService } from '../../../services/KeyringService';
import { ocs01Manager } from '../../../services/OCS01TokenService';
import { getFriendlyErrorMessage } from '../../../utils/errorMessages';
import {
    ChevronLeftIcon,
    OctraLogo,
    CheckIcon,
    CloseIcon,
    AlertIcon,
    LockIcon
} from '../../shared/Icons';
import { TokenIcon } from '../../shared/TokenIcon';
import { TokenSelectView } from '../TokenSelect/TokenSelectView';
import { ConfirmTransactionModal } from '../../shared/ConfirmTransactionModal';
import './SendView.css';

export function SendView({ wallet, balance, nonce, onBack, onRefresh, settings, onLock, initialToken, allTokens: tokensFromParent }) {
    const [step, setStep] = useState('select'); // 'select' | 'form' | 'confirm' | 'sending' | 'success' | 'error'
    const [selectedToken, setSelectedToken] = useState(null);
    const [tokenBalance, setTokenBalance] = useState(balance);

    // Initialize tokens INSTANTLY with fallback for Native OCT
    const [allTokens, setAllTokens] = useState(() => {
        const nativeToken = {
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
    const [amount, setAmount] = useState('');
    const [error, setError] = useState('');
    const [txHash, setTxHash] = useState('');
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Fee state - OU based: Slow=10000, Normal=20000, Fast=30000 (fee = OU/1000000 OCT)
    const [feeEstimates, setFeeEstimates] = useState({ low: 0.01, medium: 0.02, high: 0.03 });
    const [feeSpeed, setFeeSpeed] = useState('normal'); // 'slow' | 'normal' | 'fast'
    const [isLoadingFee, setIsLoadingFee] = useState(false);

    // Confirmation modal state
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Transaction polling state
    const [txStatus, setTxStatus] = useState(null); // 'pending' | 'confirmed' | 'failed'

    // Update tokens when parent updates (e.g. background fetch completes)
    useEffect(() => {
        const nativeToken = {
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
    const fee = feeSpeed === 'slow' ? feeEstimates.low : feeSpeed === 'fast' ? feeEstimates.high : feeEstimates.medium;
    const total = parseFloat(amount || 0) + fee;
    const isValid = recipient && isValidAddress(recipient) && amount && parseFloat(amount) > 0 && total <= tokenBalance;

    // Low balance warning (less than 0.001 OCT remaining after transaction)
    const remainingBalance = tokenBalance - total;
    const hasLowBalance = selectedToken?.isNative && remainingBalance < 0.001 && remainingBalance >= 0;

    const handleSelectToken = async (token) => {
        setSelectedToken(token);

        // Cache management
        const tokenKey = token.isNative ? token.symbol : token.contractAddress;
        const cachedBalance = localStorage.getItem(`balance_${tokenKey}_${wallet?.address}`);
        if (cachedBalance) {
            setTokenBalance(parseFloat(cachedBalance));
        }

        setIsLoadingBalance(true);
        setIsLoadingFee(true);
        setStep('form');

        try {
            const rpcClient = getRpcClient();

            if (token.isNative) {
                // Fetch fresh native balance in background
                const data = await rpcClient.getBalance(wallet.address);
                setTokenBalance(data.balance);
                localStorage.setItem(`balance_${token.symbol}_${wallet?.address}`, data.balance.toString());
            } else if (token.isOCS01) {
                // Fetch OCS01 balance
                const contract = ocs01Manager.getContract(token.contractAddress);
                const result = await contract.getCredits(wallet.address, wallet.address);
                if (result.success) {
                    const b = parseFloat(result.result) || 0;
                    setTokenBalance(b);
                    localStorage.setItem(`balance_${token.contractAddress}_${wallet?.address}`, b.toString());
                }
            }

            // Fetch fee estimate - store all levels
            const fees = await rpcClient.getFeeEstimate(1);
            setFeeEstimates({
                low: fees.low,
                medium: fees.medium,
                high: fees.high
            });
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setIsLoadingBalance(false);
            setIsLoadingFee(false);
        }
    };

    // Move to next step immediately
    useEffect(() => {
        if (initialToken) {
            handleSelectToken(initialToken);
        }
    }, [initialToken]);

    // Update fee estimate when amount changes
    useEffect(() => {
        const updateFee = async () => {
            if (amount && parseFloat(amount) > 0) {
                setIsLoadingFee(true);
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
                setIsLoadingFee(false);
            }
        };

        const debounce = setTimeout(updateFee, 500);
        return () => clearTimeout(debounce);
    }, [amount]);

    const handleSendClick = () => {
        // Validate before showing modal
        if (!isValidAddress(recipient)) {
            setError('Invalid recipient address');
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
        // Show confirmation modal instead of going directly to confirm step
        setShowConfirmModal(true);
    };

    const pollTransactionStatus = async (txHash) => {
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
                    onRefresh(); // Refresh balance when confirmed
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
            } catch (err) {
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
        setShowConfirmModal(false);
        setStep('sending');
        setError('');

        try {
            // Give user time to appreciate the premium animation
            await new Promise(r => setTimeout(r, 3500));

            const rpcClient = getRpcClient();

            // Get fresh nonce
            const data = await rpcClient.getBalance(wallet.address);
            let currentNonce = data.nonce;

            // Check for pending transactions
            const staged = await rpcClient.getStagedTransactions();
            const ourStaged = staged.filter(tx => tx.from === wallet.address);
            const maxNonce = ourStaged.length > 0
                ? Math.max(currentNonce, ...ourStaged.map(tx => parseInt(tx.nonce)))
                : currentNonce;

            let result;

            // Race condition: Wait for RPC response OR Client-side timeout (45s)
            // If Client-side timeout hits first, we check Mempool manually.
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 45000));

            const sendPromise = (async () => {
                if (selectedToken.isNative) {
                    const tx = await keyringService.signTransaction(wallet.address, {
                        to: recipient,
                        amount: parseFloat(amount),
                        nonce: maxNonce + 1,
                        message: null,
                        fee: fee
                    });
                    // Note: rpcClient.sendTransaction has 0 timeout (infinite), but we race it here.
                    return await rpcClient.sendTransaction(tx);
                } else if (selectedToken.isOCS01) {
                    const contract = ocs01Manager.getContract(selectedToken.contractAddress);
                    const amountRaw = Math.floor(parseFloat(amount) * 1_000_000);
                    const callResult = await contract.transfer(recipient, amountRaw, wallet.address);
                    if (!callResult.success) throw new Error(callResult.error || 'Contract transfer failed');
                    return { txHash: callResult.txHash };
                }
            })();

            const raceResult = await Promise.race([sendPromise, timeoutPromise]);

            if (raceResult === 'TIMEOUT') {
                // Timeout logic: Transaction sent but no ACK yet. Check Mempool!
                console.log('Send Timeout - Checking Mempool...');
                try {
                    const stagingCheck = await rpcClient.getStagedTransactions().catch(() => []);
                    const foundInMempool = stagingCheck.find(tx =>
                        tx.from === wallet.address && parseInt(tx.nonce) === (maxNonce + 1)
                    );

                    if (foundInMempool) {
                        // RECOVERY SUCCESS! detected in mempool
                        result = { txHash: foundInMempool.hash };
                    } else {
                        // Truly unknown state
                        setStep('taking_too_long');
                        return;
                    }
                } catch (e) {
                    setStep('taking_too_long');
                    return;
                }
            } else {
                result = raceResult;
            }

            // If we are here, we have a valid result (hash)
            // Add to local history
            addToTxHistory([{
                hash: result.txHash,
                type: 'out',
                amount: parseFloat(amount),
                symbol: selectedToken.symbol,
                address: recipient,
                status: 'pending'
            }], settings?.network || 'testnet');

            setTxHash(result.txHash);
            setStep('success');

            // Start polling for transaction status
            pollTransactionStatus(result.txHash);

            onRefresh();
        } catch (err) {
            console.error('Transaction error:', err);
            // ... existing error handler ...
            if (err.message && err.message.includes('Keyring is locked') && onLock) {
                onLock();
                return;
            }
            // DEV DEBUG: Show raw error to understand why it fails immediately
            setError(`${getFriendlyErrorMessage(err)} (${err.message})`);
            setStep('error');
        }
    };

    const handleReset = () => {
        setSelectedToken(null);
        setRecipient('');
        setAmount('');
        setStep('select');
        setError('');
        setTxHash('');
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
                                symbol={selectedToken?.symbol}
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
                            className={`input input-mono ${recipient && !isValidAddress(recipient) ? 'input-error' : ''}`}
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="oct..."
                        />
                        {recipient && !isValidAddress(recipient) && (
                            <p className="form-error">Invalid Octra address</p>
                        )}
                    </div>

                    {parseFloat(amount) > 0 && (
                        <div className="card mb-lg">
                            <div className="confirm-row">
                                <span className="confirm-label">Amount</span>
                                <span className="confirm-value">{formatAmount(parseFloat(amount), 6)} {selectedToken?.symbol}</span>
                            </div>
                            <div className="confirm-row">
                                <span className="confirm-label">Network Fee</span>
                                <span className="confirm-value">{formatAmount(fee, 6)} {selectedToken?.symbol}</span>
                            </div>
                            <div className="confirm-row confirm-row-total">
                                <span className="confirm-label">Total</span>
                                <span className="confirm-value font-bold">{formatAmount(total, 6)} {selectedToken?.symbol}</span>
                            </div>
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
                        onClick={handleSendClick}
                        disabled={!isValid}
                    >
                        Review Transaction
                    </button>
                </>
            )}

            {/* Step 3: Confirm & Sign */}
            {step === 'confirm' && (
                <>
                    <div className="flex items-center gap-md mb-xl">
                        <button className="header-icon-btn" onClick={() => setStep('form')}>
                            <ChevronLeftIcon size={20} />
                        </button>
                        <h2 className="text-lg font-semibold">Confirm & Sign</h2>
                    </div>

                    <div className="text-center mb-xl">
                        <p className="text-secondary text-sm mb-sm">You're sending</p>
                        <p className="confirm-amount-large">{amount} {selectedToken?.symbol}</p>
                    </div>

                    <div className="confirm-card">
                        <div className="confirm-row">
                            <span className="confirm-label">From</span>
                            <span className="confirm-value text-mono text-sm">{truncateAddress(wallet.address, 8, 6)}</span>
                        </div>
                        <div className="confirm-row">
                            <span className="confirm-label">To</span>
                            <span
                                className="confirm-value text-mono"
                                style={{
                                    fontSize: '12px',
                                    fontFamily: "'SF Mono', 'Monaco', 'Consolas', 'Roboto Mono', monospace",
                                    letterSpacing: '0.02em',
                                    wordBreak: 'break-all',
                                    lineHeight: '1.5',
                                    display: 'inline-block',
                                    maxWidth: '85%'
                                }}
                            >
                                <span style={{ fontWeight: '700', opacity: 1 }}>{recipient.slice(0, 5)}</span>
                                <span style={{ opacity: 0.6 }}>{recipient.slice(5, -5)}</span>
                                <span style={{ fontWeight: '700', opacity: 1 }}>{recipient.slice(-5)}</span>
                            </span>
                        </div>
                        <div className="confirm-row">
                            <span className="confirm-label">Network Fee</span>
                            <span className="confirm-value">{fee} {selectedToken?.symbol}</span>
                        </div>
                        <div className="confirm-row confirm-row-total">
                            <span className="confirm-label">Total Amount</span>
                            <span className="confirm-value font-bold">{formatAmount(total, 6)} {selectedToken?.symbol}</span>
                        </div>
                    </div>

                    <div className="sign-info mb-lg">
                        <p className="text-xs text-secondary text-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <LockIcon size={14} /> Transaction will be signed with your private key
                        </p>
                    </div>

                    <div className="flex gap-md">
                        <button className="btn btn-secondary btn-lg flex-1" onClick={() => setStep('form')}>
                            Back
                        </button>
                        <button className="btn btn-primary btn-lg flex-1" onClick={handleConfirmSend}>
                            Sign & Send
                        </button>
                    </div>
                </>
            )}


            {/* Success State */}
            {/* Sending State - 10s Loading Modal */}
            {step === 'sending' && (
                <div className="flex flex-col items-center justify-center py-3xl animate-fade-in" style={{ minHeight: '60vh' }}>
                    <div className="sending-animation-container">
                        <div className="quantum-ring-outer" />
                        <div className="quantum-ring-inner" />
                        <div className="quantum-core" />
                    </div>
                    <h3 className="text-xl font-bold mb-xs">Sending Payment</h3>
                    <p className="text-secondary text-sm text-center max-w-xs">
                        Securing transaction on Octra Network...
                    </p>
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
                    <p className="text-xl font-bold mb-sm" style={{ color: 'var(--success)' }}>Transaction Sent!</p>
                    <p className="text-secondary text-sm mb-xl">
                        Your transaction has been submitted to the network
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
                            href={`https://octrascan.io/transactions/${txHash}`}
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
                            Click to view on OctraScan
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

                    <button className="btn btn-primary btn-lg" onClick={() => { setStep('form'); setRecipient(''); setAmount(''); setTxStatus(null); setTxHash(''); }}>
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
                    <p className="text-secondary text-sm mb-xl">{error}</p>

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

            {/* Confirmation Modal - With Fee Selection */}
            <ConfirmTransactionModal
                isOpen={showConfirmModal && step !== 'sending'}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={handleConfirmSend}
                recipient={recipient}
                amount={amount}
                fee={fee}
                feeEstimates={feeEstimates}
                feeSpeed={feeSpeed}
                onFeeChange={setFeeSpeed}
                tokenSymbol={selectedToken?.symbol || 'OCT'}
                isLoading={false}
            />
        </div >
    );
}
