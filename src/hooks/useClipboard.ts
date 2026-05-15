import { useState, useCallback } from 'react';

interface UseClipboardOptions {
    onSuccess?: () => void;
    onError?: (err: unknown) => void;
}

/**
 * Hook to handle copying text to clipboard with state management
 * @param timeout Duration in ms to keep the "copied" state true (default: 2000ms)
 */
export function useClipboard(timeout = 2000, options?: UseClipboardOptions) {
    const [hasCopied, setHasCopied] = useState(false);

    const copy = useCallback(async (text: string) => {
        if (!text) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                setHasCopied(true);
                options?.onSuccess?.();
            } else {
                // Fallback for older browsers or non-secure contexts
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                setHasCopied(true);
                options?.onSuccess?.();
            }
        } catch (err) {
            console.error('Failed to copy:', err);
            options?.onError?.(err);
        }

        // Reset state
        setTimeout(() => setHasCopied(false), timeout);
    }, [timeout, options]);

    return { hasCopied, copy };
}
