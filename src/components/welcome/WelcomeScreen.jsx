/**
 * Welcome / Onboarding Screen
 * Flow: Welcome → Password → Seed Phrase → Verify 3 words
 */

import { useState, useEffect } from 'react';
import Lottie from 'lottie-react'; // Restore for success animation
import { getRpcClient } from '../../utils/rpc';
import {
    QuantumLogo,
    PlusIcon,
    ImportIcon,
    ChevronRightIcon,
    KeyIcon,
    ChevronLeftIcon,
    CheckIcon,
    EyeIcon,
    EyeOffIcon,
    CopyIcon,
    LockIcon,
    AnimatedLockIcon,
    AlertIcon
} from '../shared/Icons';
import { StepHeader } from './StepHeader/StepHeader';
import { calculatePasswordStrength } from '../../utils/validation';
import './WelcomeScreen.css';
import './SuccessSplash.css';

// Import Lottie animations
import successAnimation from './animations/step-complete.json';
import { QuantumAnimatedIcon } from './animations/QuantumAnimatedIcon';
// welcomePrivacyAnimation removed

// Success Splash Component - Using Lottie animation
function SuccessSplash({ onFinish }) {
    const [phase, setPhase] = useState('entering'); // entering -> visible -> exiting

    useEffect(() => {
        // Timeline:
        // 0ms: Enter
        // 2000ms: Start Exit
        // 2500ms: Finish
        const timer1 = setTimeout(() => setPhase('exiting'), 2000);
        const timer2 = setTimeout(onFinish, 2500);
        return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }, [onFinish]);

    return (
        <div className={`success-splash ${phase}`}>
            <div className="success-content">
                <div className="success-icon-container">
                    {/* Lottie Animation */}
                    <Lottie
                        animationData={successAnimation}
                        loop={false}
                        style={{ width: 120, height: 120 }}
                    />
                </div>
                <h2 className="success-title">Wallet Ready!</h2>
                <p className="success-message">Redirecting to dashboard...</p>
            </div>
        </div>
    );
}

export function WelcomeScreen({ onCreateWallet, onImportWallet }) {
    return (
        <div className="onboarding-container welcome-centered animate-fade-in">

            <div className="onboarding-header animate-fade-in-scale">
                <div className="onboarding-logo">
                    <QuantumAnimatedIcon />
                </div>
            </div>

            <div className="onboarding-content">
                <button
                    className="onboarding-option animate-slide-up-delay-1"
                    onClick={onCreateWallet}
                >
                    <div className="onboarding-option-icon">
                        <PlusIcon size={24} />
                    </div>
                    <div className="onboarding-option-content">
                        <div className="onboarding-option-title">Create New Wallet</div>
                        <div className="onboarding-option-desc">
                            Generate a new wallet with secure recovery phrase
                        </div>
                    </div>
                    <ChevronRightIcon size={20} className="onboarding-option-arrow" />
                </button>

                <button
                    className="onboarding-option animate-slide-up-delay-2"
                    onClick={onImportWallet}
                >
                    <div className="onboarding-option-icon">
                        <ImportIcon size={24} />
                    </div>
                    <div className="onboarding-option-content">
                        <div className="onboarding-option-title">Import Wallet</div>
                        <div className="onboarding-option-desc">
                            Restore wallet using recovery phrase or private key
                        </div>
                    </div>
                    <ChevronRightIcon size={20} className="onboarding-option-arrow" />
                </button>
            </div>

            <div className="onboarding-footer">
                <p>Support Octra Network</p>
            </div>
        </div>
    );
}

export function CreateWalletScreen({ onBack, onComplete }) {
    const [step, setStep] = useState(1);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    const [wallet, setWallet] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showMnemonic, setShowMnemonic] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false); // Added missing state

    // Verification state
    const [verifyPositions, setVerifyPositions] = useState([]);
    const [selectedWords, setSelectedWords] = useState({});
    const [shuffledOptions, setShuffledOptions] = useState([]);
    const [verificationError, setVerificationError] = useState('');

    const passwordStrength = calculatePasswordStrength(password);

    // Helper to finish process after splash
    const handleFinalSuccess = () => {
        onComplete(wallet, password);
    };

    const handleSetPassword = async () => {
        if (password.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            const { generateWallet } = await import('../../utils/crypto');
            const newWallet = await generateWallet();
            setWallet(newWallet);

            const positions = getRandomPositions(3, 12);
            setVerifyPositions(positions);

            // Select only 8 words total for options (3 correct + 5 random distractors)
            const correctWords = positions.map(pos => newWallet.mnemonic[pos - 1]);
            const otherWords = newWallet.mnemonic.filter((_, idx) => !positions.includes(idx + 1));
            // Shuffle others and take 5
            const shuffledOthers = shuffleArray(otherWords);
            const distractors = shuffledOthers.slice(0, 5);

            // Combine and shuffle again
            setShuffledOptions(shuffleArray([...correctWords, ...distractors]));

            setStep(2); // Skip loading, go directly to recovery phrase
        } catch (error) {
            console.error('Failed to generate wallet:', error);
            setPasswordError('Failed to generate wallet: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyMnemonic = async () => {
        if (!wallet?.mnemonic) return;
        try {
            await navigator.clipboard.writeText(wallet.mnemonic.join(' '));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    const handleProceedToVerify = () => {
        setStep(3);
    };

    // Get next empty position
    const getNextEmptyPosition = () => {
        for (const pos of verifyPositions) {
            if (!selectedWords[pos]) return pos;
        }
        return null;
    };

    // Click a word - auto fill next empty position
    const handleWordClick = (word) => {
        const isUsed = Object.values(selectedWords).includes(word);
        if (isUsed) return;

        const nextPos = getNextEmptyPosition();
        if (nextPos) {
            setSelectedWords(prev => ({ ...prev, [nextPos]: word }));
            setVerificationError('');
        }
    };

    // Remove last filled word
    const handleRemoveLast = () => {
        const filledPositions = verifyPositions.filter(pos => selectedWords[pos]);
        if (filledPositions.length === 0) return;

        const lastFilled = filledPositions[filledPositions.length - 1];
        setSelectedWords(prev => {
            const newState = { ...prev };
            delete newState[lastFilled];
            return newState;
        });
        setVerificationError('');
    };

    const handleVerify = () => {
        for (const pos of verifyPositions) {
            if (selectedWords[pos] !== wallet.mnemonic[pos - 1]) {
                setVerificationError(`Word #${pos} is incorrect. Please try again.`);
                return;
            }
        }

        setIsSuccess(true);

        // OPTIMIZATION: Warm up RPC connection while splash animation plays (2.5s)
        // This performs DNS/TCP/TLS handshakes so Dashboard loads balance instantly
        try {
            const rpc = getRpcClient();
            // Fire and forget request to seed any network caches
            rpc.getBalance(wallet.address).catch(e => console.debug('Warmup ignored:', e));
        } catch (e) {
            // Ignore warmup errors
        }
    };

    const isVerifyComplete = verifyPositions.every(pos => selectedWords[pos]);
    const nextEmptyPos = getNextEmptyPosition();

    if (isSuccess) {
        return <SuccessSplash onFinish={handleFinalSuccess} />;
    }

    return (
        <div className="onboarding-container animate-fade-in">
            {/* Step 1: Set Password */}
            {step === 1 && (
                <div className="create-password-step">
                    <StepHeader
                        title="Create Password"
                        currentStep={1}
                        totalSteps={3}
                        onBack={onBack}
                    />

                    {/* Content */}
                    <div className="step-content">
                        {/* Icon */}
                        <div className="step-icon">
                            <AnimatedLockIcon
                                size={48}
                                isLocked={password.length >= 8 && password === confirmPassword}
                            />
                        </div>

                        {/* Description */}
                        <p className="step-description" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {password.length >= 8 && password === confirmPassword ?
                                <><CheckIcon size={16} /> Password secured!</> :
                                'Create a strong password to protect your wallet.'
                            }
                        </p>

                        {/* Form */}
                        <div className="step-form">
                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <div className="input-with-icon">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="input"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                        placeholder="Enter password (min 8 chars)"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="input-icon-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                    </button>
                                </div>

                                {password && (
                                    <div className="password-strength">
                                        <div className="password-strength-bar">
                                            <div
                                                className={`password-strength-fill strength-${passwordStrength.level}`}
                                                style={{ width: `${passwordStrength.percent}%` }}
                                            />
                                        </div>
                                        <span className={`password-strength-text strength-${passwordStrength.level}`}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className={`input ${confirmPassword && password !== confirmPassword ? 'input-error' : ''}`}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                                    placeholder="Confirm your password"
                                />
                            </div>

                            {passwordError && <p className="form-error">{passwordError}</p>}

                            <button
                                className="btn btn-primary btn-full"
                                onClick={handleSetPassword}
                                disabled={password.length < 8 || password !== confirmPassword}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Show Recovery Phrase */}
            {step === 2 && wallet && (
                <div className="create-password-step">
                    <StepHeader
                        title="Recovery Phrase"
                        currentStep={2}
                        totalSteps={3}
                        onBack={() => setStep(1)}
                    />



                    <p className="step-description">
                        Write down these 12 words in order. Never share them.
                    </p>

                    {/* Mnemonic grid */}
                    <div
                        className="mnemonic-grid"
                        style={{
                            filter: showMnemonic ? 'none' : 'blur(6px)',
                            userSelect: showMnemonic ? 'text' : 'none'
                        }}
                    >
                        {wallet.mnemonic.map((word, index) => (
                            <div key={index} className="mnemonic-word">
                                <span className="mnemonic-word-num">{index + 1}</span>
                                <span className="mnemonic-word-text">{word}</span>
                            </div>
                        ))}
                    </div>

                    {/* Action row - Show toggle + Copy button */}
                    <div className="phrase-actions">
                        <button
                            className={`phrase-action-btn ${showMnemonic ? 'active' : ''}`}
                            onClick={() => setShowMnemonic(!showMnemonic)}
                        >
                            {showMnemonic ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                            <span>{showMnemonic ? 'Hide' : 'Show'}</span>
                        </button>
                        <button
                            className={`phrase-action-btn ${copied ? 'active' : ''}`}
                            onClick={handleCopyMnemonic}
                        >
                            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                            <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    </div>

                    <button className="btn btn-primary btn-full" onClick={handleProceedToVerify}>
                        I've Saved It, Continue
                    </button>
                </div>
            )}

            {/* Step 3: Verify 3 Words */}
            {step === 3 && wallet && (
                <div className="create-password-step">
                    <StepHeader
                        title="Verify Phrase"
                        currentStep={3}
                        totalSteps={3}
                        onBack={() => setStep(2)}
                    />



                    <p className="step-description">
                        Select the correct words to verify your phrase.
                    </p>

                    {/* Phrase grid with blanks */}
                    <div className="verify-phrase-grid">
                        {wallet.mnemonic.map((word, index) => {
                            const position = index + 1;
                            const isBlank = verifyPositions.includes(position);
                            const selectedWord = selectedWords[position];
                            const isNextToFill = position === nextEmptyPos;

                            return (
                                <div
                                    key={index}
                                    className={`verify-phrase-word ${isBlank ? 'blank' : ''} ${selectedWord ? 'filled' : ''} ${isNextToFill ? 'active' : ''}`}
                                >
                                    <span className="verify-phrase-num">{position}</span>
                                    <span className="verify-phrase-text">
                                        {isBlank ? (selectedWord || '?') : word}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {verificationError && (
                        <p className="text-error text-sm">{verificationError}</p>
                    )}

                    {/* Word pool */}
                    <div className="verify-word-pool">
                        {shuffledOptions.map((word, idx) => {
                            const isUsed = Object.values(selectedWords).includes(word);
                            return (
                                <button
                                    key={idx}
                                    className={`verify-word-btn ${isUsed ? 'used' : ''}`}
                                    onClick={() => handleWordClick(word)}
                                    disabled={isUsed || !nextEmptyPos}
                                >
                                    {word}
                                </button>
                            );
                        })}
                    </div>

                    {/* Action buttons */}
                    <div className="verify-actions">
                        <button
                            className="btn btn-ghost"
                            onClick={handleRemoveLast}
                            disabled={Object.keys(selectedWords).length === 0}
                        >
                            ← Undo
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleVerify}
                            disabled={!isVerifyComplete}
                        >
                            Complete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function ImportWalletScreen({ onBack, onComplete }) {
    const [step, setStep] = useState(1);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    const [importType, setImportType] = useState(null);
    const [mnemonic, setMnemonic] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [wallet, setWallet] = useState(null);

    const passwordStrength = calculatePasswordStrength(password);

    const handleSetPassword = () => {
        if (password.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }
        setStep(2);
    };

    const handleFinalSuccess = () => {
        onComplete(wallet, password);
    };

    const handleImport = async () => {
        setIsLoading(true);
        setError('');

        try {
            let newWallet;
            const { importFromMnemonic, importFromPrivateKey } = await import('../../utils/crypto');

            if (importType === 'mnemonic') {
                newWallet = await importFromMnemonic(mnemonic.trim());
            } else {
                newWallet = await importFromPrivateKey(privateKey.trim());
            }

            setWallet(newWallet);
            setIsSuccess(true);
        } catch (err) {
            setError(err.message || 'Failed to import wallet');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return <SuccessSplash onFinish={handleFinalSuccess} />;
    }

    // Calculate total steps and current step for header
    const getTotalSteps = () => importType ? 3 : 2;
    const getCurrentStep = () => {
        if (step === 1) return 1;
        if (step === 2 && !importType) return 2;
        if (step === 2 && importType) return 3;
        return step;
    };

    return (
        <div className="onboarding-container animate-fade-in">
            {/* Step 1: Set Password */}
            {step === 1 && (
                <div className="create-password-step">
                    <StepHeader
                        title="Create Password"
                        currentStep={1}
                        totalSteps={3}
                        onBack={onBack}
                    />

                    <div className="step-content">
                        {/* Icon */}
                        <div className="step-icon">
                            <AnimatedLockIcon
                                size={48}
                                isLocked={password.length >= 8 && password === confirmPassword}
                            />
                        </div>

                        {/* Description */}
                        <p className="step-description" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {password.length >= 8 && password === confirmPassword ?
                                <><CheckIcon size={16} /> Password secured!</> :
                                'Create a password to protect your imported wallet.'
                            }
                        </p>

                        {/* Form */}
                        <div className="step-form">
                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <div className="input-with-icon">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="input"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                        placeholder="Enter password (min 8 chars)"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className="input-icon-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                    </button>
                                </div>

                                {password && (
                                    <div className="password-strength">
                                        <div className="password-strength-bar">
                                            <div
                                                className={`password-strength-fill strength-${passwordStrength.level}`}
                                                style={{ width: `${passwordStrength.percent}%` }}
                                            />
                                        </div>
                                        <span className={`password-strength-text strength-${passwordStrength.level}`}>
                                            {passwordStrength.label}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className={`input ${confirmPassword && password !== confirmPassword ? 'input-error' : ''}`}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                                    placeholder="Confirm your password"
                                />
                            </div>

                            {passwordError && <p className="form-error">{passwordError}</p>}

                            <button
                                className="btn btn-primary btn-full"
                                onClick={handleSetPassword}
                                disabled={password.length < 8 || password !== confirmPassword}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: Choose Import Method */}
            {step === 2 && !importType && (
                <div className="create-password-step">
                    <StepHeader
                        title="Import Method"
                        currentStep={2}
                        totalSteps={3}
                        onBack={() => setStep(1)}
                    />

                    <div className="step-content">
                        {/* Icon */}
                        <div className="step-icon">
                            <ImportIcon size={48} />
                        </div>

                        <p className="step-description">
                            Choose how you want to import your wallet
                        </p>

                        <div className="import-options">
                            <button className="onboarding-option" onClick={() => setImportType('mnemonic')}>
                                <div className="onboarding-option-icon">
                                    <ImportIcon size={24} />
                                </div>
                                <div className="onboarding-option-content">
                                    <div className="onboarding-option-title">Recovery Phrase</div>
                                    <div className="onboarding-option-desc">Import using 12-word mnemonic phrase</div>
                                </div>
                                <ChevronRightIcon size={20} className="onboarding-option-arrow" />
                            </button>

                            <button className="onboarding-option" onClick={() => setImportType('privateKey')}>
                                <div className="onboarding-option-icon">
                                    <KeyIcon size={24} />
                                </div>
                                <div className="onboarding-option-content">
                                    <div className="onboarding-option-title">Private Key</div>
                                    <div className="onboarding-option-desc">Import using base64 encoded private key</div>
                                </div>
                                <ChevronRightIcon size={20} className="onboarding-option-arrow" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: Enter Phrase or Key */}
            {step === 2 && importType && (
                <div className="create-password-step">
                    <StepHeader
                        title={importType === 'mnemonic' ? 'Recovery Phrase' : 'Private Key'}
                        currentStep={3}
                        totalSteps={3}
                        onBack={() => setImportType(null)}
                    />

                    <div className="step-content">
                        {/* Icon */}
                        <div className="step-icon">
                            {importType === 'mnemonic' ? (
                                <ImportIcon size={48} />
                            ) : (
                                <KeyIcon size={48} />
                            )}
                        </div>

                        <p className="step-description">
                            {importType === 'mnemonic'
                                ? 'Enter your 12-word recovery phrase'
                                : 'Enter your private key (Base64 encoded)'
                            }
                        </p>

                        <div className="step-form">
                            {importType === 'mnemonic' ? (
                                <div className="form-group">
                                    <label className="form-label">Recovery Phrase</label>
                                    <textarea
                                        className="input input-mono"
                                        value={mnemonic}
                                        onChange={(e) => { setMnemonic(e.target.value); setError(''); }}
                                        placeholder="Enter your 12 words separated by spaces..."
                                        rows={4}
                                        style={{ resize: 'none', lineHeight: '1.6' }}
                                        autoFocus
                                    />
                                    <p className="form-hint">Separate each word with a space</p>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Private Key</label>
                                    <div className="input-with-icon">
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            className="input input-mono"
                                            value={privateKey}
                                            onChange={(e) => { setPrivateKey(e.target.value); setError(''); }}
                                            placeholder="Paste your base64 private key..."
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            className="input-icon-btn"
                                            onClick={() => setShowKey(!showKey)}
                                            tabIndex={-1}
                                        >
                                            {showKey ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="form-error-box">
                                    <AlertIcon size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                className="btn btn-primary btn-full"
                                onClick={handleImport}
                                disabled={isLoading || (importType === 'mnemonic' ? !mnemonic.trim() : !privateKey.trim())}
                            >
                                {isLoading ? <span className="loading-spinner" /> : 'Import Wallet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper functions
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getRandomPositions(count, max) {
    const positions = new Set();
    while (positions.size < count) {
        positions.add(Math.floor(Math.random() * max) + 1);
    }
    return Array.from(positions).sort((a, b) => a - b);
}



export default WelcomeScreen;
