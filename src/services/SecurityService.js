/**
 * Security Service
 * Handles password rate limiting to prevent brute force attacks
 * 
 * SECURITY v2.0:
 * - Persistent state (survives page refresh)
 * - Automatic lockout recovery
 * - State stored in localStorage
 */

const MAX_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const STORAGE_KEY = '_security_state';

class SecurityService {
    constructor() {
        // Load persistent state
        this.loadState();

        // Clean expired lockouts on init
        if (this.isLocked() && Date.now() >= this.lockoutUntil) {
            this.reset();
        }
    }

    // Load state from localStorage
    loadState() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const state = JSON.parse(stored);
                this.passwordAttempts = state.attempts || 0;
                this.lockoutUntil = state.lockoutUntil || null;
            } else {
                this.passwordAttempts = 0;
                this.lockoutUntil = null;
            }
        } catch (error) {
            console.error('[SecurityService] Failed to load state:', error);
            this.passwordAttempts = 0;
            this.lockoutUntil = null;
        }
    }

    // Save state to localStorage
    saveState() {
        try {
            const state = {
                attempts: this.passwordAttempts,
                lockoutUntil: this.lockoutUntil,
                updatedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.error('[SecurityService] Failed to save state:', error);
        }
    }

    // Password rate limiting
    isLocked() {
        if (!this.lockoutUntil) return false;

        if (Date.now() < this.lockoutUntil) {
            return true;
        }

        // Lockout expired, reset
        this.reset();
        return false;
    }

    getRemainingLockoutTime() {
        if (!this.lockoutUntil) return 0;
        const remaining = this.lockoutUntil - Date.now();
        return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    }

    recordSuccessfulAttempt() {
        this.passwordAttempts = 0;
        this.lockoutUntil = null;
        this.saveState(); // Persist reset
        return { allowed: true, success: true };
    }

    recordFailedAttempt() {
        this.passwordAttempts++;
        this.saveState(); // Persist state

        if (this.passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
            this.lockoutUntil = Date.now() + LOCKOUT_DURATION;
            this.saveState(); // Persist lockout
            console.warn(`[SecurityService] Account locked for ${LOCKOUT_DURATION / 1000 / 60} minutes`);
            return {
                allowed: false,
                locked: true,
                remainingTime: this.getRemainingLockoutTime(),
                message: `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_DURATION / 60000)} minutes.`
            };
        }

        return {
            allowed: true,
            success: false,
            attemptsRemaining: MAX_PASSWORD_ATTEMPTS - this.passwordAttempts,
            message: `Invalid password. ${MAX_PASSWORD_ATTEMPTS - this.passwordAttempts} attempts remaining.`
        };
    }

    recordPasswordAttempt(success) {
        if (success) {
            return this.recordSuccessfulAttempt();
        } else {
            return this.recordFailedAttempt();
        }
    }

    reset() {
        this.passwordAttempts = 0;
        this.lockoutUntil = null;
        this.saveState(); // Persist reset
    }
}

export const securityService = new SecurityService();
