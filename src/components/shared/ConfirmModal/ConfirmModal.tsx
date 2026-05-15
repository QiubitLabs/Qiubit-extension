/**
 * Confirmation Modal Component
 * Beautiful custom modal for confirmations
 */

import React from 'react';
import { WarningIcon } from '../Icons';
import './ConfirmModal.css';

interface ConfirmModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

export function ConfirmModal({ isOpen, onConfirm, onCancel, title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }: ConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <div className="confirm-modal-header">
                    <h3 className="confirm-modal-title">{title}</h3>
                </div>

                <div className="confirm-modal-body">
                    {isDanger && (
                        <div className="confirm-warning-container">
                            <WarningIcon size={20} className="confirm-warning-icon" />
                            <p className="confirm-modal-message">{message}</p>
                        </div>
                    )}
                    {!isDanger && <p className="confirm-modal-message">{message}</p>}
                </div>

                <div className="confirm-modal-footer">
                    <button
                        className="btn btn-ghost"
                        onClick={onCancel}
                    >
                        {cancelText}
                    </button>
                    <button
                        className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
