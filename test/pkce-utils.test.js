import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateCodeVerifier, generateCodeChallenge, generatePKCEPair } from '../src/utils/pkce-utils.js';

describe('PKCE Utilities', () => {
  test('should generate code verifier with correct format', () => {
    const verifier = generateCodeVerifier();
    
    // Check that it's a string
    assert.strictEqual(typeof verifier, 'string');
    
    // Check length (should be 43 characters as per RFC 7636)
    assert.strictEqual(verifier.length, 43);
    
    // Check that it contains only base64url characters
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    assert(base64UrlRegex.test(verifier));
  });

  test('should generate code challenge from verifier', () => {
    // Use a known verifier to test challenge generation
    const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    
    const challenge = generateCodeChallenge(testVerifier);
    
    // Check that it's a string
    assert.strictEqual(typeof challenge, 'string');
    
    // Check length (should be 43 characters)
    assert.strictEqual(challenge.length, 43);
  });

  test('should generate PKCE pair with correct properties', () => {
    const pair = generatePKCEPair();
    
    // Check that it returns an object with both properties
    assert(pair);
    assert.strictEqual(typeof pair, 'object');
    assert(pair.codeVerifier);
    assert(pair.codeChallenge);
    
    // Check that both are strings
    assert.strictEqual(typeof pair.codeVerifier, 'string');
    assert.strictEqual(typeof pair.codeChallenge, 'string');
    
    // Check that they have the correct lengths
    assert.strictEqual(pair.codeVerifier.length, 43);
    assert.strictEqual(pair.codeChallenge.length, 43);
    
    // Check that the challenge is correctly derived from the verifier
    const expectedChallenge = generateCodeChallenge(pair.codeVerifier);
    assert.strictEqual(pair.codeChallenge, expectedChallenge);
  });
});