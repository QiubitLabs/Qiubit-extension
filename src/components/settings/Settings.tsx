import { useState } from 'react';
import { exportWalletSecure as exportWallet } from '../../utils/storage';
import { ConfirmModal } from '../shared';
import { useWallet } from '../../context/WalletContext';
import { useSession } from '../../context/SessionContext';

// Sub-components
import { NetworkSwitcher } from './NetworkSwitcher/NetworkSwitcher';
import { SettingsMenu } from './Menu/SettingsMenu';
import { ChangePassword } from './Security/ChangePassword/ChangePassword';
import { ExportPrivateKey } from './Security/ExportPrivateKey/ExportPrivateKey';
import { RecoveryPhrase } from './Security/RecoveryPhrase/RecoveryPhrase';

interface SettingsScreenProps {
    onPasswordChange: (newPassword: string) => Promise<void>;
}

export function SettingsScreen({ onPasswordChange }: SettingsScreenProps) {
    const { wallet, settings, updateSettings, setView: setAppView, activeWalletIndex, deleteWallet } = useWallet();
    const { lock, clearActiveSession, password } = useSession(); // Get password and lock

    const [view, setView] = useState('main'); // 'main' | 'network' | 'export' | 'recovery-phrase' | 'change-password'
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    if (!wallet) return null;

    const handleExportKeystore = () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const filename = `octra_wallet_${wallet.address.slice(-8)}_${timestamp}.json`;
        exportWallet(wallet, filename);
    };

    const handleDisconnect = () => {
        setShowDisconnectModal(true);
    };

    const onDisconnect = async () => {
        try {
            // Actually delete the wallet from storage if we have the password
            if (password) {
                await deleteWallet(activeWalletIndex, password);
            }
        } catch (e) {
            console.error('Failed to delete wallet:', e);
        } finally {
            clearActiveSession();
            setAppView('welcome');
        }
    };

    const onPanicLock = () => {
        // Immediate UI update + Session Clearing
        lock();
        setAppView('lock');
    };

    const onBackToDashboard = () => {
        setAppView('dashboard');
    };

    if (view === 'network') {
        return (
            <NetworkSwitcher
                settings={settings || { network: 'mainnet', showTestnet: false, hideDust: false, explorerUrl: '', rpcUrl: '' }}
                onUpdateSettings={updateSettings}
                onBack={() => setView('main')}
                onSwitchComplete={(network) => {
                    console.log(`Switched to ${network}`);
                }}
            />
        );
    }

    if (view === 'export') {
        return (
            <ExportPrivateKey
                wallet={wallet}
                onBack={() => setView('main')}
            />
        );
    }

    if (view === 'change-password') {
        return (
            <ChangePassword
                onBack={() => setView('main')}
                onPasswordChange={onPasswordChange}
            />
        );
    }

    if (view === 'recovery-phrase') {
        return (
            <RecoveryPhrase
                wallet={wallet}
                onBack={() => setView('main')}
            />
        );
    }

    return (
        <>
            <SettingsMenu
                wallet={wallet}
                settings={settings || { network: 'mainnet', showTestnet: false, hideDust: false, explorerUrl: '', rpcUrl: '' }}
                onViewChange={setView}
                onBack={onBackToDashboard}
                onExportKeystore={handleExportKeystore}
                onDisconnect={handleDisconnect}
                onLock={onPanicLock}
            />

            <ConfirmModal
                isOpen={showDisconnectModal}
                title="Disconnect Wallet?"
                message={`Are you sure you want to remove this wallet from this device?\n\nIMPORTANT: Make sure you have backed up your recovery phrase or private key. You will lose access to this wallet if you haven't saved them.`}
                confirmText="Disconnect"
                cancelText="Cancel"
                isDanger={true}
                onConfirm={() => {
                    setShowDisconnectModal(false);
                    onDisconnect();
                }}
                onCancel={() => setShowDisconnectModal(false)}
            />
        </>
    );
}
