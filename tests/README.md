# Octra Wallet Testing Guide

This directory contains the automated tests for the Octra Wallet extension.
We ensure security and reliability through two layers of testing.

## Structure

```
tests/
├── unit/                        # Logic & Math Tests (Fast)
│   ├── validation.test.js       # Address, mnemonic, password validation
│   ├── crypto.test.js           # Encoding, hashing, formatting utilities
│   ├── balanceCache.test.js     # Caching and request deduplication
│   ├── errorMessages.test.js    # User-friendly error translation
│   └── keyringService.test.js   # Secure key management
│
├── e2e/                         # Browser Automation Tests (Real simulation)
│   └── wallet.spec.js           # Import wallet flow end-to-end
│
└── README.md                    # This file
```

## Test Coverage

### Unit Tests (62 tests)

| File | Description | Tests |
|------|-------------|-------|
| `validation.test.js` | Validates addresses, mnemonics, amounts, and password strength | 9 |
| `crypto.test.js` | Tests Base58/Hex/Base64 encoding, address formatting, amount display | 21 |
| `balanceCache.test.js` | Tests memory caching, request deduplication, cache clearing | 7 |
| `errorMessages.test.js` | Tests user-friendly error message translation | 11 |
| `keyringService.test.js` | Tests unlock/lock, key management, security protections | 14 |

### E2E Tests

| File | Description |
|------|-------------|
| `wallet.spec.js` | Complete import wallet flow: Welcome → Password → Recovery Phrase → Dashboard |

## How to Run Tests

### Prerequisites
Make sure you have installed the testing dependencies:
```bash
npm install
```

### 1. Run Unit Tests
Checks if encryption, validation, and math functions are working correctly.
```bash
npx vitest run
```

Watch mode (re-runs on file changes):
```bash
npx vitest
```

### 2. Run E2E Tests
Opens a Chrome browser and clicks through the wallet like a real user.

First, start the dev server in one terminal:
```bash
npm run dev
```

Then run the tests in another terminal:
```bash
npx playwright test
```

## Testing Philosophy

- **Security First:** We aggressively test key generation, encryption logic, and memory wiping.
- **User Flow:** We ensure the "Happy Path" (Create → Send → Receive) is always working.
- **Error Handling:** We verify that all error messages are user-friendly, not technical jargon.
- **Performance:** Cache tests ensure we don't spam the RPC with duplicate requests.

## Adding New Tests

1. **Unit Tests:** Add files to `tests/unit/` with the `.test.js` extension.
2. **E2E Tests:** Add files to `tests/e2e/` with the `.spec.js` extension.
3. Run `npx vitest run` or `npx playwright test` to verify.

## CI/CD Integration

These tests can be integrated into GitHub Actions:

```yaml
- name: Run Unit Tests
  run: npx vitest run

- name: Run E2E Tests
  run: |
    npm run build
    npx playwright test
```
