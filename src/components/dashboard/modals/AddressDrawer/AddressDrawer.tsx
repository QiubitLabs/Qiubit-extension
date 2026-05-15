import { motion, AnimatePresence } from 'framer-motion';
import './AddressDrawer.css';
import { CloseIcon, CheckIcon, CopyIcon } from '../../../shared/Icons';
import { useClipboard } from '../../../../hooks/useClipboard';

interface AddressDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    octraAddress: string;
    evmAddress?: string;
    showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function AddressDrawer({ isOpen, onClose, octraAddress, evmAddress, showToast }: AddressDrawerProps) {
    const { copy: copyOctra, hasCopied: hasCopiedOctra } = useClipboard(2000, {
        onSuccess: () => showToast('Octra address copied', 'success')
    });
    const { copy: copyEvm, hasCopied: hasCopiedEvm } = useClipboard(2000, {
        onSuccess: () => showToast('EVM address copied', 'success')
    });

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div 
                        className="drawer-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div 
                        className="address-drawer"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        <div className="drawer-handle" />
                        
                        <div className="drawer-header">
                            <h3 className="drawer-title">Wallet Addresses</h3>
                            <button className="drawer-close" onClick={onClose}>
                                <CloseIcon size={20} />
                            </button>
                        </div>

                        <div className="drawer-body">
                            {/* Octra Address */}
                            <div className="address-section">
                                <div className="address-label">
                                    <img src="/qiubit-icon.svg" alt="Octra" className="network-icon" />
                                    <span>Octra Network</span>
                                </div>
                                <div className="address-card" onClick={() => copyOctra(octraAddress)}>
                                    <div className="address-text font-mono">{octraAddress}</div>
                                    <div className="copy-indicator">
                                        {hasCopiedOctra ? <CheckIcon size={16} className="text-success" /> : <CopyIcon size={16} />}
                                    </div>
                                </div>
                            </div>

                            {/* EVM Address */}
                            {evmAddress && (
                                <div className="address-section mt-lg">
                                    <div className="address-label">
                                        <img src="/eth-icon.svg" alt="EVM" className="network-icon" />
                                        <span>Ethereum / EVM</span>
                                    </div>
                                    <div className="address-card" onClick={() => copyEvm(evmAddress)}>
                                        <div className="address-text font-mono">{evmAddress}</div>
                                        <div className="copy-indicator">
                                            {hasCopiedEvm ? <CheckIcon size={16} className="text-success" /> : <CopyIcon size={16} />}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {!evmAddress && (
                                <div className="address-section mt-lg opacity-50">
                                    <div className="address-label">
                                        <img src="/eth-icon.svg" alt="EVM" className="network-icon" />
                                        <span>Ethereum / EVM</span>
                                    </div>
                                    <div className="address-card disabled">
                                        <div className="address-text">Not available for this wallet type</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="drawer-footer">
                            <button className="btn btn-primary w-full py-md rounded-xl" onClick={onClose}>
                                Close
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
