import { useState } from "react";
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from "../../../shared/Icons";
import { changePasswordSecure as changePassword } from "../../../../utils/storage";
import { calculatePasswordStrength } from "../../../../utils/validation";
import "./ChangePassword.css";

interface ChangePasswordProps {
  onBack: () => void;
  onPasswordChange?: (newPassword: string) => Promise<void>;
}

export function ChangePassword({
  onBack,
  onPasswordChange,
}: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const passwordStrength = calculatePasswordStrength(newPassword);

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      setError("Please enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await changePassword(currentPassword, newPassword);
      if (onPasswordChange) {
        await onPasswordChange(newPassword);
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="animate-fade-in">
        <header className="wallet-header">
          <div className="flex items-center gap-md">
            <button className="header-icon-btn" onClick={onBack}>
              <ChevronLeftIcon size={20} />
            </button>
            <span className="text-lg font-semibold">Change Password</span>
          </div>
        </header>

        <div className="wallet-content">
          <div className="text-center py-3xl">
            <div
              className="success-checkmark mb-xl"
              style={{ margin: "0 auto var(--space-xl)" }}
            >
              <CheckIcon size={32} />
            </div>
            <p className="text-xl font-bold mb-sm">Password Changed!</p>
            <p className="text-secondary text-sm mb-xl">
              Your wallet password has been updated successfully.
            </p>
            <button className="btn btn-primary btn-lg" onClick={onBack}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Change Password</span>
        </div>
      </header>

      <div className="wallet-content">
        <div className="form-group">
          <label className="form-label">Current Password</label>
          <input
            type={showPassword ? "text" : "password"}
            className="input input-lg"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setError("");
            }}
            placeholder="Enter current password"
          />
        </div>

        <div className="form-group">
          <label className="form-label">New Password</label>
          <input
            type={showPassword ? "text" : "password"}
            className="input input-lg"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setError("");
            }}
            placeholder="Enter new password (min 8 chars)"
          />
          {newPassword && (
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
          <label className="form-label">Confirm New Password</label>
          <input
            type={showPassword ? "text" : "password"}
            className={`input input-lg ${confirmPassword && newPassword !== confirmPassword ? "input-error" : ""}`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError("");
            }}
            placeholder="Confirm new password"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="form-error">Passwords do not match</p>
          )}
        </div>

        <div className="flex items-center gap-md mb-xl">
          <button
            className="btn btn-ghost btn-sm gap-sm"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            {showPassword ? "Hide passwords" : "Show passwords"}
          </button>
        </div>

        {error && <p className="text-error text-sm mb-lg">{error}</p>}

        <button
          className="btn btn-primary btn-lg btn-full"
          onClick={handleSubmit}
          disabled={
            isLoading ||
            !currentPassword ||
            newPassword.length < 8 ||
            newPassword !== confirmPassword
          }
        >
          {isLoading ? <span className="loading-spinner" /> : "Change Password"}
        </button>
      </div>
    </div>
  );
}
