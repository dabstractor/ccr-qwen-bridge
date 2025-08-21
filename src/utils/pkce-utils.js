import crypto from 'crypto';

/**
 * PKCE Utilities for Qwen OAuth 2.0 Device Authorization Flow
 * 
 * Implements Proof Key for Code Exchange (PKCE) as required by Qwen-Code OAuth flow.
 * Generates code verifier and code challenge according to RFC 7636.
 */

/**
 * Generate a code verifier for PKCE
 * 
 * Creates a cryptographically random string using 32 bytes (256 bits) of entropy,
 * encoded as base64url. This results in a 43-character string as required by RFC 7636.
 * 
 * @returns {string} Base64url-encoded code verifier string
 */
export function generateCodeVerifier() {
  // PATTERN: 32 random bytes encoded as base64url
  // CRITICAL: Must be 43-128 characters as per RFC 7636
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a code verifier
 * 
 * Creates a SHA-256 hash of the code verifier and encodes it as base64url.
 * This is the S256 code challenge method required by Qwen OAuth.
 * 
 * @param {string} codeVerifier - The code verifier string
 * @returns {string} Base64url-encoded code challenge string
 */
export function generateCodeChallenge(codeVerifier) {
  // PATTERN: SHA-256 hash of code_verifier encoded as base64url
  // CRITICAL: Use createHash('sha256') for proper implementation
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  return hash.digest('base64url');
}

/**
 * Generate a PKCE pair (code verifier and code challenge)
 * 
 * Convenience function that generates both components of a PKCE pair.
 * 
 * @returns {Object} Object containing codeVerifier and codeChallenge
 */
export function generatePKCEPair() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge
  };
}