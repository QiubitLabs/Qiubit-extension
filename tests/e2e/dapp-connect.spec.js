import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to extension build
const pathToExtension = path.resolve(__dirname, '../../dist');
const dappPath = path.resolve(__dirname, '../../osm/test-dapp/index.html');

// Helper to handle extension popup context
const getExtensionId = async (context) => {
  let [background] = context.serviceWorkers();
  if (!background)
    background = await context.waitForEvent('serviceworker');

  const extensionId = background.url().split('/')[2];
  return extensionId;
};

test.describe('dApp Connection Flow', () => {
  let context;
  let extensionId;

  // Setup Browser with Extension
  test.beforeEach(async ({ }, testInfo) => {
    // We launch a persistent context to keep extension data/state
    const userDataDir = path.join(__dirname, `../../.playwright_user_data_${testInfo.project.name}`);
    
    // Launch Chrome with extension
    context = await test.chromium.launchPersistentContext(userDataDir, {
      headless: false, // Must be false to load extensions
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    extensionId = await getExtensionId(context);
    
    // Wait for extension to be ready
    await new Promise(r => setTimeout(r, 1000));
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('Should handle Connect flow when Wallet is Locked', async () => {
    // 1. SETUP: Create a Wallet First
    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/index.html`);

    // Create Wallet Flow
    // We check for "Create New Wallet" button
    const createBtn = extensionPage.getByRole('button', { name: /Create New Wallet|Create Wallet/i });
    
    if (await createBtn.isVisible()) {
        await createBtn.click();
        
        // Setup Password
        await extensionPage.getByPlaceholder('Enter password (min 8 chars)').fill('Password123!');
        await extensionPage.getByPlaceholder('Confirm your password').fill('Password123!');
        await extensionPage.getByRole('button', { name: 'Continue' }).click();

        // Save Seed Step (if exists)
        // Usually "I have saved it" or "Next"
        const nextBtn = extensionPage.getByRole('button', { name: /Saved|Continue|Next/i });
        if (await nextBtn.isVisible()) await nextBtn.click();

        // Wait for Dashboard
        await expect(extensionPage.getByText('Home')).toBeVisible({ timeout: 10000 });
    } else {
        // If already logged in (persistent context), ensure we are on dashboard
        // If locked, unlock
        const unlockBtn = extensionPage.getByRole('button', { name: 'Unlock' });
        if (await unlockBtn.isVisible()) {
             await extensionPage.getByPlaceholder('Enter password').fill('Password123!');
             await unlockBtn.click();
             await expect(extensionPage.getByText('Home')).toBeVisible();
        }
    }

    // 2. LOCK THE WALLET
    // Check if we can find settings button
    const settingsBtn = extensionPage.locator('.header-actions button').last(); // Usually settings is the last icon
    await settingsBtn.click();
    
    await extensionPage.getByText('Lock Wallet').click();
    await expect(extensionPage.getByPlaceholder('Enter password')).toBeVisible();
    await extensionPage.close(); // Close extension tab

    // 3. OPEN DAPP PAGE
    const dappPage = await context.newPage();
    await dappPage.goto(`file://${dappPath}`);

    // 4. TRIGGER CONNECT
    // Listen for the popup *before* clicking
    const popupPromise = context.waitForEvent('page');
    await dappPage.getByRole('button', { name: 'Connect Wallet' }).click();
    const popup = await popupPromise;

    await popup.waitForLoadState();

    // 5. VERIFY LOCK SCREEN APPEARS (CRITICAL CHECK)
    console.log('Popup opened. Checking title...');
    
    // Wait for UI to render
    await new Promise(r => setTimeout(r, 1000));

    const unlockButton = popup.getByRole('button', { name: 'Unlock' });
    
    // Assert we are on Lock Screen
    await expect(unlockButton).toBeVisible();

    // 6. UNLOCK via POPUP
    await popup.getByPlaceholder('Enter password').fill('Password123!');
    await unlockButton.click();

    // 7. VERIFY APPROVAL SCREEN APPEARS
    // Wait for transition
    await new Promise(r => setTimeout(r, 500));
    await expect(popup.getByText('Authorize connection?')).toBeVisible({ timeout: 10000 });

    // 8. APPROVE
    await popup.getByRole('button', { name: 'Authorize' }).click();

    // 9. VERIFY DAPP CONNECTED
    // The popup should close automatically
    // Check dApp UI for address
    await expect(dappPage.getByText('Octra Testnet')).toBeVisible({ timeout: 10000 });
    
    const connectBtn = dappPage.locator('#connectBtn');
    await expect(connectBtn).not.toHaveText('Connect Wallet'); 
    
    console.log('Test Passed: Wallet unlocked and connected successfully via Popup!');
  });
});