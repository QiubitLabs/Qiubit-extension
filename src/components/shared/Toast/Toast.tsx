import React, { useEffect } from "react";
import { CheckIcon, CloseIcon, InfoIcon, AlertIcon, IconProps } from "../Icons";
import "./Toast.css";

export interface ToastProps {
  message?: string | null;
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
  onClose?: () => void;
}

export function Toast({
  message,
  type = "info",
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!message) return null;

  let Icon: React.FC<IconProps> = InfoIcon;
  if (type === "success") Icon = CheckIcon;
  if (type === "warning") Icon = AlertIcon;
  if (type === "error") Icon = CloseIcon;

  return (
    <div className={`toast toast-${type} animate-slide-up`}>
      <span className="toast-icon">
        <Icon size={14} />
      </span>
      <span className="toast-message">{message}</span>
    </div>
  );
}

export default Toast;
