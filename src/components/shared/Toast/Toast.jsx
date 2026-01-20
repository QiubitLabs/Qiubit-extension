import { useEffect } from 'react';
import { CheckIcon, CloseIcon, InfoIcon } from '../Icons';
import './Toast.css';

export function Toast({ message, type = 'info', duration = 3000, onClose }) {
    useEffect(() => {
        if (duration && onClose) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    if (!message) return null;

    let Icon = InfoIcon;
    if (type === 'success') Icon = CheckIcon;
    if (type === 'error') Icon = CloseIcon;

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
