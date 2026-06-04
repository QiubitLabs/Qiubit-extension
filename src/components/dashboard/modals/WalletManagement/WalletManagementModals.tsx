import { useState, useEffect } from 'react';
import './WalletManagementModals.css';
import { CloseIcon, TrashIcon, WarningIcon } from '../../../shared/Icons';

interface RenameWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentName: string;
    onSave: (newName: string) => void;
    onDeleteStart: () => void;
    isSaving?: boolean;
}

export function RenameWalletModal({ isOpen, onClose, currentName, onSave, onDeleteStart, isSaving }: RenameWalletModalProps) {
    const [name, setName] = useState(currentName);

    useEffect(() => {
        setName(currentName);
    }, [currentName]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content-bottom" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-xl font-bold">Edit Name</h3>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="form-group">
                    <div className="flex justify-between items-center mb-xs">
                        <label className="form-label text-sm text-secondary mb-0">Change wallet display name</label>
                        <span className="text-xs text-tertiary">{name.length} / 16</span>
                    </div>
                    <input
                        type="text"
                        className="input text-lg font-medium p-md bg-surface-subtle border-none"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter name"
                        maxLength={16}
                        autoFocus
                    />
                </div>

                <button
                    className="btn btn-primary w-full py-md font-bold text-base"
                    onClick={() => onSave(name)}
                    disabled={!name.trim() || isSaving}
                >
                    {isSaving ? 'Saving...' : 'Update Name'}
                </button>

                {/* Danger Zone Section */}
                <div className="mt-xl pt-lg border-t border-subtle">
                    <button
                        className="btn btn-ghost w-full flex items-center justify-center gap-sm text-danger font-semibold py-md"
                        onClick={onDeleteStart}
                    >
                        <TrashIcon size={18} />
                        Delete Wallet
                    </button>
                    <p className="text-xs text-tertiary text-center mt-sm">
                        Remove this wallet permanently from this device.
                    </p>
                </div>
            </div>
        </div>
    );
}

interface DeleteWalletConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    walletName: string;
    onConfirm: () => void;
}

export function DeleteWalletConfirmModal({ isOpen, onClose, walletName, onConfirm }: DeleteWalletConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content-bottom" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-xl font-bold text-danger">Delete Wallet?</h3>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="p-md text-center">
                    <div className="mb-md flex justify-center">
                        <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center text-danger">
                            <TrashIcon size={32} />
                        </div>
                    </div>
                    <p className="text-lg font-medium mb-sm text-primary">
                        Are you sure you want to delete "{walletName}"?
                    </p>
                    <div className="text-sm text-secondary bg-surface-subtle p-md rounded-xl border border-warning/20 text-warning text-left flex items-start gap-sm">
                        <WarningIcon size={20} className="shrink-0" />
                        <span>
                            This action cannot be undone. Make sure you have backed up your Private Key or Seed Phrase.
                        </span>
                    </div>
                </div>

                <button
                    className="btn btn-danger w-full py-md font-bold text-base mt-lg"
                    onClick={onConfirm}
                >
                    Yes, Permanently Delete
                </button>
            </div>
        </div>
    );
}
