import crypto from 'crypto';

/**
 * Generates a random alphanumeric referral code.
 * @param length - Length of the code (default: 6)
 * @returns Uppercase alphanumeric string (e.g., "A1B2C3")
 */
export function generateReferralCode(length: number = 6): string {
    return crypto.randomBytes(length)
        .toString('hex')
        .toUpperCase()
        .slice(0, length);
}
