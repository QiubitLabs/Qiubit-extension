import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',

    // Output results to tests/results folder
    outputDir: './tests/results/e2e',

    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },

    // Reporter - save HTML report to tests/results
    reporter: [
        ['list'],
        ['html', { outputFolder: './tests/results/report' }]
    ],

    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        headless: false,

        // Screenshots on failure
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
