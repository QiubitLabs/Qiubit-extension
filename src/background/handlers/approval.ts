import { dappApprovals } from '../store';
import { getWalletFromStorage, getActiveNetwork } from '../helpers';
import { keyringService } from '../../services/core/KeyringService';

export async function requestApproval(
    origin: string,
    type: string,
    params: Record<string, any>,
    _wallet: any
): Promise<any> {
    const approvalId = crypto.randomUUID();
    const networkSetting = params?.networkSetting || await getActiveNetwork();

    return new Promise((resolve, reject) => {
        let onWindowRemovedRef: ((id: number) => void) | null = null;

        const cleanAndResolve = (val: any) => {
            if (onWindowRemovedRef) chrome.windows.onRemoved.removeListener(onWindowRemovedRef);
            resolve(val);
        };
        const cleanAndReject = (err: any) => {
            if (onWindowRemovedRef) chrome.windows.onRemoved.removeListener(onWindowRemovedRef);
            reject(err);
        };

        // SECURITY: wallet object (with private key) is NOT stored in dappApprovals
        dappApprovals.set(approvalId, {
            type, origin, params: { ...params, networkSetting },
            timestamp: Date.now(), resolve: cleanAndResolve, reject: cleanAndReject,
        });

        chrome.windows.create(
            { url: 'index.html#/dapp/approve?id=' + approvalId, type: 'popup', width: 360, height: 600 },
            (win) => {
                if (!win?.id) return;
                const onWindowRemoved = (removedId: number) => {
                    if (removedId !== win.id) return;
                    if (onWindowRemovedRef) chrome.windows.onRemoved.removeListener(onWindowRemovedRef);
                    const pending = dappApprovals.get(approvalId);
                    if (pending) {
                        dappApprovals.delete(approvalId);
                        pending.reject({ code: 4001, message: 'User closed the approval window' });
                    }
                };
                onWindowRemovedRef = onWindowRemoved;
                chrome.windows.onRemoved.addListener(onWindowRemoved);
            }
        );
    });
}

export async function handleResolveApproval(data: any): Promise<{ success: boolean; error?: string }> {
    const { id, decision, result, selectedOctraAddress, selectedEvmAddress } = data;

    const approval = dappApprovals.get(id);
    if (!approval) return { success: false, error: 'Request not found' };
    dappApprovals.delete(id);

    if (decision !== 'approved') {
        approval.reject({ code: 4001, message: 'User rejected request' });
        return { success: true };
    }

    try {
        // Solana/Sui/EVM signing is done in the popup and result is passed through.
        // Only Octra native types (signMessage, signTransaction, sendTransaction) are signed here in SW.
        const swSignedTypes = ['sendTransaction', 'signTransaction', 'signMessage'];
        const noKeyNeeded = !swSignedTypes.includes(approval.type);
        let signingWallet: any = {};

        if (!noKeyNeeded) {
            if (!keyringService.isUnlocked()) {
                throw new Error('Wallet is locked. Please unlock the extension.');
            }
            const freshWallet = await getWalletFromStorage();
            if (!freshWallet) throw new Error('Wallet not found. Please unlock the extension.');
            signingWallet = freshWallet;
        }

        // Private key comes from KeyringService memory (never from storage)
        const pk = signingWallet.address ? keyringService.getPrivateKey(signingWallet.address) : null;

        if (approval.type === 'sendTransaction') {
            const signed = await signAndBroadcastTransaction(approval.params, signingWallet);
            approval.resolve({ result: signed });
        } else if (approval.type === 'signTransaction') {
            const signed = await signTransactionOnly(approval.params, signingWallet);
            approval.resolve({ result: signed });
        } else if (approval.type === 'signMessage') {
            if (!pk) throw new Error('Private key not available for message signing');
            const { createSigningMessage } = await import('../../utils/octra/osm1');
            const { signMessage } = await import('../../utils/crypto/transaction');
            const signingMessage = createSigningMessage(approval.params.payload);
            const signature = signMessage(signingMessage, pk);
            approval.resolve({
                result: {
                    signature,
                    publicKey: signingWallet.publicKeyB64 || signingWallet.publicKey,
                    address: signingWallet.address,
                    payload: approval.params.payload,
                }
            });
        } else if (['ethSendTransaction', 'ethPersonalSign', 'ethSignTypedData'].includes(approval.type)) {
            approval.resolve({ result });
        } else if (approval.type === 'addNetwork') {
            approval.resolve({ result: null });
        } else {
            // connect and other pass-through types
            approval.resolve({
                result,
                selectedOctraAddress: selectedOctraAddress || null,
                selectedEvmAddress: selectedEvmAddress || null,
            });
        }
    } catch (err: any) {
        console.error('[Background] Resolve Error:', err);
        approval.reject({ code: 5000, message: err.message || 'Internal signing error' });
    }

    return { success: true };
}

async function signTransactionOnly(params: any, wallet: any): Promise<any> {
    const from = wallet.address;
    const privateKey = keyringService.getPrivateKey(from);
    if (!privateKey) throw new Error('Private key not available — wallet may be locked.');
    const txParams = params.transaction || params;
    const { createTransaction } = await import('../../utils/crypto/transaction');
    const fee = txParams.fee || null;
    return createTransaction(
        from,
        txParams.to || txParams.to_,
        txParams.amount || txParams.amountRaw,
        Number(txParams.nonce),
        privateKey,
        txParams.message || null,
        fee
    );
}

async function signAndBroadcastTransaction(params: any, wallet: any): Promise<string> {
    const signedTransaction = await signTransactionOnly(params, wallet);
    const { getRpcClient } = await import('../../services/network/RpcService');
    const client = getRpcClient();
    const response = await client.sendTransaction(signedTransaction);
    if (response.success && response.txHash) return response.txHash;
    throw new Error('Transaction submission failed');
}
