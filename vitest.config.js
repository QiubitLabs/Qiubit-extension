import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/unit/**/*.test.js'],

        // Output results to tests/results folder
        outputFile: {
            json: './tests/results/unit/results.json',
            html: './tests/results/unit/index.html'
        },

        // Coverage report
        coverage: {
            reporter: ['text', 'html'],
            reportsDirectory: './tests/results/coverage',
            exclude: ['node_modules/', 'tests/']
        }
    }
});
