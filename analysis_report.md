# Deep Analysis Report: Data Synchronization & Wallet Isolation

This report analyzes the two issues reported: `NaN` balance results and cross-wallet data persistence (the "leak").

## 1. Analysis: `NaN` Balance Issue
The `NaN` result typically occurs in `RpcService.ts` during the conversion of strings to numbers.

### Root Cause
In `RpcService.ts`, the `getBalance` method uses `parseFloat()` to convert the JSON-RPC result:

```typescript
// RpcService.ts:L267
const balance = balanceRes.ok && balanceRes.json ? parseFloat(balanceRes.json) : 0;
```

**Potential Failure Points:**
1.  **Scientific Notation with Suffixes**: If the RPC returns a value like `"123.45 OCT"`, `parseFloat` works fine (it stops at the first non-numeric character). But if the value is empty or contains only non-numeric characters before any digits, it returns `NaN`.
2.  **Null/Empty String Logic**: While there is a check for `balanceRes.json`, if the server returns the string `"NaN"` or an object that stringifies to `[object Object]`, the result becomes `NaN`.
3.  **Hexadecimal Encoding**: If the server recently switched to returning hex values (e.g., `"0x..."`), `parseFloat` will return `0` (it sees the `0` and stops at `x`), but some environments or intermediate layers might transform this differently.

**Verification**: The integration test logged `Result: { balance: NaN, nonce: NaN }`. Since both fields were `NaN`, it suggests the server response for both `octra_balance` and `octra_nonce` was either an invalid format or a string like `"NaN"`.

---

## 2. Analysis: Multi-Wallet Data Leak
The "leak" where Wallet 1 data appears in Wallet 2 is **not a security leak** (cross-contamination of keys), but a **UI State Persistence Bug**.

### Root Cause
The `WalletContext` uses long-lived hooks (`useWalletData` and `useTransactionHistory`) that maintain their own internal state.

**The Workflow Flaw:**
1.  User is on **Wallet A**. The `balance` state is `100` and `transactions` is `[TX_A1, TX_A2]`.
2.  User switches to **Wallet B**.
3.  The `useEffect` in `useWalletData` and `useTransactionHistory` detects the address change and triggers `refreshAll`.
4.  **Critical Gap**: The code **does not reset** the old state immediately.
5.  While the network request for **Wallet B** is in flight (which can take 1-4 seconds), the UI continues to render the OLD state: `100` and `[TX_A1, TX_A2]`.
6.  Once the request for Wallet B completes, `setBalance` and `setTransactions` are called, finally updating the screen.

**Code Reference:**
In `useTransactionHistory.ts`:
```typescript
const refreshTransactions = useCallback(async (...) => {
    if (!wallet?.address) return;
    // ... Fetching (takes time) ...
    setTransactions(newHistory); // Only updates AFTER the async call
}, [wallet.address]);
```

### Is the code "wrong"?
*   **Structurally**: The keyed logic (`balanceCache` keyed by address, IndexedDB keyed by address) is correct. Data is saved correctly.
*   **UX-wise**: Yes, it is wrong. It lacks a "reset on switch" mechanism.

---

## 3. Conclusions & Recommendations

### Do you need to remove data?
**No.** The data in storage is likely isolated correctly because all storage keys include the wallet address. Removing data won't fix the code behavior; the "leak" will happen again as soon as you have two wallets with data.

### Required Code Fixes (Analysis only):
1.  **State Reset**: Add a cleanup `useEffect` to every data hook that sets state to `0` or `[]` immediately when the `activeAddress` changes.
    ```typescript
    useEffect(() => {
        setBalance(0);
        setTokens([]);
        setTransactions([]);
    }, [wallet?.address]);
    ```
2.  **Number Parsing**: Replace `parseFloat` in `RpcService.ts` with a more robust helper that handles hex (`0x`) and ensures a fallback to `0` instead of `NaN`.
3.  **Skeleton Loaders**: Ensure the UI shows a loading/skeleton state as soon as the wallet switches, so the user knows data is being swapped.

### Summary of findings:
*   The "leak" is a **visual ghosting** issue caused by old state not being cleared.
*   The `NaN` issue is a **parsing vulnerability** triggered by unexpected RPC response formats.

**Everything else in the architecture (Context, RpcService, Vault) is solid.**
