/**
 * Welcome / Onboarding Screen
 * Flow: Welcome -> Password -> Seed Phrase -> Verify 3 words
 */

import { useState, useEffect } from "react";
import "./WelcomeScreen.css";
import "./SuccessSplash.css";
import { getRpcClient } from "../../services/network/RpcService";
import {
  PlusIcon,
  ImportIcon,
  ChevronRightIcon,
  KeyIcon,
  ChevronLeftIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  AnimatedLockIcon,
  AlertIcon,
} from "../shared/Icons";
import { OnboardingLottie } from "./OnboardingLottie";
import { FeedbackLottie } from "../shared/FeedbackLottie";
import { MnemonicInput } from "../shared/MnemonicInput";
import { StepHeader } from "./StepHeader/StepHeader";
import { detectPrivateKey } from "../../utils/crypto/keyDetect";
import { version as pkgVersion } from "../../../package.json";
import { calculatePasswordStrength } from "../../utils/validation";
import { Wallet } from "../../types";

interface SuccessSplashProps {
  onFinish: () => void;
}

function SuccessSplash({ onFinish }: SuccessSplashProps) {
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">(
    "entering",
  ); // entering -> visible -> exiting

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase("exiting"), 2000);
    const timer2 = setTimeout(onFinish, 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [onFinish]);

  return (
    <div className={`success-splash ${phase}`}>
      <div className="success-content">
        <div className="success-icon-container">
          <FeedbackLottie kind="success" size={140} />
        </div>
        <h2 className="success-title">Wallet Ready!</h2>
        <p className="success-message">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}

interface WelcomeScreenProps {
  onCreateWallet: () => void;
  onImportWallet: () => void;
}

export function WelcomeScreen({
  onCreateWallet,
  onImportWallet,
}: WelcomeScreenProps) {
  return (
    <div className="onboarding-container welcome-centered animate-fade-in">
      <div className="onboarding-header">
        <div className="onboarding-lottie-wrap">
          <OnboardingLottie size={250} />
        </div>
        <h1 className="welcome-hero-title">Welcome to Qiubit Wallet</h1>
        <p className="welcome-hero-subtitle">
          Your multichain gateway to Octra &amp; beyond
        </p>
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
        <p>
          Qiubit Wallet v
          {typeof chrome !== "undefined" && chrome.runtime?.getManifest
            ? chrome.runtime.getManifest().version
            : pkgVersion}
        </p>
      </div>
    </div>
  );
}

interface CreateWalletScreenProps {
  onBack: () => void;
  onComplete: (wallet: Wallet, password: string) => void;
}

export function CreateWalletScreen({
  onBack,
  onComplete,
}: CreateWalletScreenProps) {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isAgreed, setIsAgreed] = useState(false);

  const [wallet, setWallet] = useState<Wallet | null>(null);

  const [showMnemonic, setShowMnemonic] = useState(false);
  // The user must have SEEN the seed at least once before confirming they
  // saved it — otherwise they can "confirm" a phrase they never looked at.
  const [hasRevealedSeed, setHasRevealedSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false); // Added missing state

  const [verifyPositions, setVerifyPositions] = useState<number[]>([]);
  const [selectedWords, setSelectedWords] = useState<Record<number, string>>(
    {},
  );
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [verificationError, setVerificationError] = useState("");

  const passwordStrength = calculatePasswordStrength(password);

  const handleFinalSuccess = () => {
    if (wallet) {
      onComplete(wallet, password);
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    // Coming back from the seed step must NOT regenerate the wallet — the
    // user may already have written down the first seed.
    if (wallet) {
      setStep(2);
      return;
    }

    try {
      const { generateWallet } = await import("../../utils/crypto");
      const newWallet = await generateWallet();
      const currentMnemonic = newWallet.mnemonic;
      if (!currentMnemonic) throw new Error("Mnemonic generation failed");

      setWallet(newWallet);
      const positions = getRandomPositions(3, 12);
      setVerifyPositions(positions);

      const correctWords = positions.map((pos) => currentMnemonic[pos - 1]);
      const otherWords = currentMnemonic.filter(
        (_, idx) => !positions.includes(idx + 1),
      );
      const shuffledOthers = shuffleArray(otherWords);
      const distractors = shuffledOthers.slice(0, 5);

      setShuffledOptions(shuffleArray([...correctWords, ...distractors]));

      setStep(2); // Skip loading, go directly to recovery phrase
    } catch (error: any) {
      console.error("Failed to generate wallet:", error);
      setPasswordError("Failed to generate wallet: " + error.message);
    } finally {
    }
  };

  const handleCopyMnemonic = async () => {
    if (!wallet?.mnemonic) return;
    try {
      const phrase = wallet.mnemonic.join(" ");
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Auto-clear the clipboard after 60s — other apps can read it.
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === phrase) await navigator.clipboard.writeText("");
        } catch {
          /* clipboard unavailable — ignore */
        }
      }, 60_000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleProceedToVerify = () => {
    setStep(3);
  };

  const getNextEmptyPosition = () => {
    for (const pos of verifyPositions) {
      if (!selectedWords[pos]) return pos;
    }
    return null;
  };

  const handleWordClick = (word: string) => {
    const isUsed = Object.values(selectedWords).includes(word);
    if (isUsed) return;

    const nextPos = getNextEmptyPosition();
    if (nextPos) {
      setSelectedWords((prev) => ({ ...prev, [nextPos]: word }));
      setVerificationError("");
    }
  };

  const handleRemoveLast = () => {
    const filledPositions = verifyPositions.filter((pos) => selectedWords[pos]);
    if (filledPositions.length === 0) return;

    const lastFilled = filledPositions[filledPositions.length - 1];
    setSelectedWords((prev) => {
      const newState = { ...prev };
      delete newState[lastFilled];
      return newState;
    });
    setVerificationError("");
  };

  const handleVerify = () => {
    if (!wallet) return;
    for (const pos of verifyPositions) {
      if (selectedWords[pos] !== wallet.mnemonic?.[pos - 1]) {
        setVerificationError(`Word #${pos} is incorrect. Please try again.`);
        return;
      }
    }

    setIsSuccess(true);

    try {
      const rpc = getRpcClient();
      rpc
        .getBalance(wallet.address)
        .catch((e: any) => console.debug("Warmup ignored:", e));
    } catch (e) {}
  };

  const isVerifyComplete = verifyPositions.every((pos) => selectedWords[pos]);
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
            <p
              className="step-description"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {password.length >= 8 && password === confirmPassword ? (
                <>
                  <CheckIcon size={16} /> Password secured!
                </>
              ) : (
                "Create a strong password to protect your wallet."
              )}
            </p>

            {/* Form */}
            <div className="step-form">
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-with-icon">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError("");
                    }}
                    placeholder="Enter password (min 8 chars)"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="input-icon-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={18} />
                    ) : (
                      <EyeIcon size={18} />
                    )}
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
                    <span
                      className={`password-strength-text strength-${passwordStrength.level}`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input ${confirmPassword && password !== confirmPassword ? "input-error" : ""}`}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Confirm your password"
                />
              </div>

              {passwordError && <p className="form-error">{passwordError}</p>}

              <div className="privacy-policy-container">
                <label className="privacy-policy-label">
                  <input
                    type="checkbox"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
                    className="privacy-checkbox"
                  />
                  <span className="privacy-text">
                    I agree to the{" "}
                    <a
                      href="https://octra.network/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="privacy-link"
                    >
                      Privacy Policy & Terms
                    </a>
                  </span>
                </label>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handleSetPassword}
                disabled={
                  password.length < 8 ||
                  password !== confirmPassword ||
                  !isAgreed
                }
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
              filter: showMnemonic ? "none" : "blur(6px)",
              userSelect: showMnemonic ? "text" : "none",
            }}
          >
            {wallet.mnemonic?.map((word, index) => (
              <div key={index} className="mnemonic-word">
                <span className="mnemonic-word-num">{index + 1}</span>
                <span className="mnemonic-word-text">{word}</span>
              </div>
            ))}
          </div>

          {/* Action row - Show toggle + Copy button */}
          <div className="phrase-actions">
            <button
              className={`phrase-action-btn ${showMnemonic ? "active" : ""}`}
              onClick={() => {
                if (!showMnemonic) setHasRevealedSeed(true);
                setShowMnemonic(!showMnemonic);
              }}
            >
              {showMnemonic ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              <span>{showMnemonic ? "Hide" : "Show"}</span>
            </button>
            <button
              className={`phrase-action-btn ${copied ? "active" : ""}`}
              onClick={handleCopyMnemonic}
            >
              {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>

          {copied && (
            <p
              className="form-hint"
              style={{ textAlign: "center", marginBottom: "8px" }}
            >
              Clipboard clears automatically in 60s — other apps can read it.
            </p>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={handleProceedToVerify}
            disabled={!hasRevealedSeed}
            title={
              hasRevealedSeed ? undefined : "Reveal the phrase first (Show)"
            }
          >
            {hasRevealedSeed ? "I've Saved It, Continue" : "Reveal Phrase First"}
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
            {wallet.mnemonic?.map((word, index) => {
              const position = index + 1;
              const isBlank = verifyPositions.includes(position);
              const selectedWord = selectedWords[position];
              const isNextToFill = position === nextEmptyPos;

              return (
                <div
                  key={index}
                  className={`verify-phrase-word ${isBlank ? "blank" : ""} ${selectedWord ? "filled" : ""} ${isNextToFill ? "active" : ""}`}
                >
                  <span className="verify-phrase-num">{position}</span>
                  <span className="verify-phrase-text">
                    {isBlank ? selectedWord || "?" : word}
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
                  className={`verify-word-btn ${isUsed ? "used" : ""}`}
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
              <ChevronLeftIcon size={16} className="mr-xs" />
              Undo
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

interface ImportWalletScreenProps {
  onBack: () => void;
  onComplete: (wallet: Wallet, password: string) => void;
}

export function ImportWalletScreen({
  onBack,
  onComplete,
}: ImportWalletScreenProps) {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isAgreed, setIsAgreed] = useState(false);

  const [importType, setImportType] = useState<
    "mnemonic" | "privateKey" | null
  >(null);
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicComplete, setMnemonicComplete] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const passwordStrength = calculatePasswordStrength(password);

  // Flow: choose method (1) → enter & validate seed/key (2) → password (3).
  // Validating the import BEFORE asking for a password means a typo'd seed
  // fails immediately, not after the user has already set up a password.
  const handleSetPassword = () => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    setIsSuccess(true);
  };

  const handleFinalSuccess = () => {
    if (wallet) {
      onComplete(wallet, password);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    setError("");

    try {
      let newWallet;
      const { importFromMnemonic, importFromPrivateKey } =
        await import("../../utils/crypto");

      if (importType === "mnemonic") {
        newWallet = await importFromMnemonic(mnemonic.trim());
      } else {
        newWallet = await importFromPrivateKey(privateKey);
      }

      setWallet(newWallet);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Failed to import wallet");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return <SuccessSplash onFinish={handleFinalSuccess} />;
  }

  return (
    <div className="onboarding-container animate-fade-in">
      {/* Step 3: Set Password (the import is already validated) */}
      {step === 3 && (
        <div className="create-password-step">
          <StepHeader
            title="Create Password"
            currentStep={3}
            totalSteps={3}
            onBack={() => setStep(2)}
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
            <p
              className="step-description"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {password.length >= 8 && password === confirmPassword ? (
                <>
                  <CheckIcon size={16} /> Password secured!
                </>
              ) : (
                "Create a password to protect your imported wallet."
              )}
            </p>

            {/* Form */}
            <div className="step-form">
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-with-icon">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError("");
                    }}
                    placeholder="Enter password (min 8 chars)"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="input-icon-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={18} />
                    ) : (
                      <EyeIcon size={18} />
                    )}
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
                    <span
                      className={`password-strength-text strength-${passwordStrength.level}`}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input ${confirmPassword && password !== confirmPassword ? "input-error" : ""}`}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Confirm your password"
                />
              </div>

              {passwordError && <p className="form-error">{passwordError}</p>}

              <div className="privacy-policy-container">
                <label className="privacy-policy-label">
                  <input
                    type="checkbox"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
                    className="privacy-checkbox"
                  />
                  <span className="privacy-text">
                    I agree to the{" "}
                    <a
                      href="https://octra.network/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="privacy-link"
                    >
                      Privacy Policy & Terms
                    </a>
                  </span>
                </label>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handleSetPassword}
                disabled={
                  password.length < 8 ||
                  password !== confirmPassword ||
                  !isAgreed
                }
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Choose Import Method */}
      {step === 1 && (
        <div className="create-password-step">
          <StepHeader
            title="Import Method"
            currentStep={1}
            totalSteps={3}
            onBack={onBack}
          />

          <div className="step-content">
            <div className="step-icon">
              <ImportIcon size={48} />
            </div>

            <p className="step-description">
              Choose how you want to import your wallet
            </p>

            <div className="import-options">
              <button
                className="onboarding-option"
                onClick={() => {
                  setImportType("mnemonic");
                  setStep(2);
                }}
              >
                <div className="onboarding-option-icon">
                  <ImportIcon size={24} />
                </div>
                <div className="onboarding-option-content">
                  <div className="onboarding-option-title">Recovery Phrase</div>
                  <div className="onboarding-option-desc">
                    Import using 12 or 24-word mnemonic phrase
                  </div>
                </div>
                <ChevronRightIcon
                  size={20}
                  className="onboarding-option-arrow"
                />
              </button>

              <button
                className="onboarding-option"
                onClick={() => {
                  setImportType("privateKey");
                  setStep(2);
                }}
              >
                <div className="onboarding-option-icon">
                  <KeyIcon size={24} />
                </div>
                <div className="onboarding-option-content">
                  <div className="onboarding-option-title">Private Key</div>
                  <div className="onboarding-option-desc">
                    Import using your private key
                  </div>
                </div>
                <ChevronRightIcon
                  size={20}
                  className="onboarding-option-arrow"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Enter phrase or key (validated before the password step) */}
      {step === 2 && importType && (
        <div className="create-password-step">
          <StepHeader
            title={
              importType === "mnemonic" ? "Recovery Phrase" : "Private Key"
            }
            currentStep={2}
            totalSteps={3}
            onBack={() => {
              setImportType(null);
              setMnemonic("");
              setMnemonicComplete(false);
              setError("");
              setStep(1);
            }}
          />

          <div className="step-content">
            <div className="step-icon">
              {importType === "mnemonic" ? (
                <ImportIcon size={48} />
              ) : (
                <KeyIcon size={48} />
              )}
            </div>

            <p className="step-description">
              {importType === "mnemonic"
                ? "Enter your 12 or 24-word recovery phrase"
                : "Enter your private key"}
            </p>

            <div className="step-form">
              {importType === "mnemonic" ? (
                <div className="form-group">
                  <label className="form-label">Recovery Phrase</label>
                  <MnemonicInput
                    autoFocus
                    onChange={(phrase, isComplete) => {
                      setMnemonic(phrase);
                      setMnemonicComplete(isComplete);
                      setError("");
                    }}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Private Key</label>
                  <div className="input-with-icon">
                    <input
                      type={showKey ? "text" : "password"}
                      className="input input-mono"
                      value={privateKey}
                      onChange={(e) => {
                        // Keys never contain whitespace — strip it so pastes
                        // from notes/files come out clean automatically.
                        setPrivateKey(e.target.value.replace(/\s+/g, ""));
                        setError("");
                      }}
                      placeholder="Paste your private key..."
                      autoFocus
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowKey(!showKey)}
                      tabIndex={-1}
                    >
                      {showKey ? (
                        <EyeOffIcon size={18} />
                      ) : (
                        <EyeIcon size={18} />
                      )}
                    </button>
                  </div>
                  {privateKey.trim() ? (
                    (() => {
                      const detected = detectPrivateKey(privateKey);
                      return detected ? (
                        <p
                          className="form-hint"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            color: "var(--color-success, #10b981)",
                          }}
                        >
                          <CheckIcon size={13} /> Detected: {detected.label}
                        </p>
                      ) : (
                        <p
                          className="form-hint"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Format not recognized yet — keep typing or check the
                          key
                        </p>
                      );
                    })()
                  ) : (
                    <p className="form-hint">
                      Supports Octra, EVM (0x…), Solana, Sui (suiprivkey1…) and
                      Bitcoin (WIF) keys.
                    </p>
                  )}
                  <div className="import-key-note">
                    <AlertIcon size={14} />
                    <span>
                      A private key reproduces only its own chain's address.
                      Other chains get new addresses derived from the same key.
                      To recover all your existing addresses, import your
                      recovery phrase instead.
                    </span>
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
                disabled={
                  isLoading ||
                  (importType === "mnemonic"
                    ? !mnemonicComplete
                    : !detectPrivateKey(privateKey))
                }
              >
                {isLoading ? <span className="loading-spinner" /> : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomPositions(count: number, max: number): number[] {
  const positions = new Set<number>();
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * max) + 1);
  }
  return Array.from(positions).sort((a, b) => a - b);
}

export default WelcomeScreen;
