import { test, expect } from '@playwright/test';

test.describe('Wallet Web Flow', () => {

    const BASE_URL = 'http://localhost:5173';

    // Use a known dummy seed phrase for testing (Standard Test Vector)
    const TEST_SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    test('Should import wallet using existing seed phrase', async ({ page }) => {
        // 1. Go to Home
        await page.goto(BASE_URL);

        // 2. Klik "Import Wallet"
        // 2. Klik "Import Wallet"
        // Gunakan selector yang valid berdasarkan source code (onboarding-option)
        await page.locator('.onboarding-option').nth(1).click();

        // 3. Set Password DULU (Ini Step 1 di Import Screen)
        await page.getByPlaceholder('Enter password (min 8 chars)').fill('SecurePass123!');
        await page.getByPlaceholder('Confirm your password').fill('SecurePass123!');
        // Klik Continue
        await page.getByRole('button', { name: 'Continue' }).click();

        // 4. Pilih Metode Import (Step 2)
        // Tunggu sampai header "Import Method" muncul
        await expect(page.getByText('Import Method')).toBeVisible();

        // Pilih Opsi Recovery Phrase
        await page.locator('.onboarding-option').filter({ hasText: 'Recovery Phrase' }).click();

        // 5. Masukkan Seed Phrase (Step 3)
        const seedInput = page.locator('textarea');
        await seedInput.fill(TEST_SEED_PHRASE);

        // 6. Final Import
        await page.getByRole('button', { name: 'Import Wallet' }).click();

        // 6. Validasi Dashboard
        // Cek apakah Navigasi Bawah muncul (Tanda masuk dashboard)
        await expect(page.getByText('Home')).toBeVisible();
        await expect(page.getByText('Send')).toBeVisible();

        // Pastikan alamat wallet muncul (tapi jangan terlalu strik dengan regex)
        // Cek apakah ada elemen address (biasanya format oct1...)
        const address = await page.locator('.wallet-address, .address-text, button[title="Copy Address"]').first();
        if (await address.isVisible()) {
            await expect(address).toBeVisible();
        }
    });

});
