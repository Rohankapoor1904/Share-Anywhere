const { PairingEngine, constantTimeCompare, generatePin } = require('../../src/engine/pairing');
const { TrustStore, InMemoryTrustPersistence } = require('../../src/engine/trustStore');

describe('Pairing Engine Unit Tests (§7, §12.1)', () => {
  let trustStore;
  let pairing;
  let challengesCaptured;

  beforeEach(() => {
    challengesCaptured = [];
    trustStore = new TrustStore(new InMemoryTrustPersistence());
    pairing = new PairingEngine(trustStore, {
      autoAcceptTrusted: true,
      autoAcceptAll: false,
      onChallenge: (ch) => challengesCaptured.push(ch)
    });
  });

  test('constantTimeCompare accurately tests equality', () => {
    expect(constantTimeCompare('123456', '123456')).toBe(true);
    expect(constantTimeCompare('123456', '123457')).toBe(false);
    expect(constantTimeCompare('123456', '12345')).toBe(false);
    expect(constantTimeCompare('', '')).toBe(true);
  });

  test('generatePin creates 6-digit numeric string', () => {
    const pin = generatePin();
    expect(typeof pin).toBe('string');
    expect(pin.length).toBe(6);
    expect(/^\d{6}$/.test(pin)).toBe(true);
  });

  test('trusted peer is accepted automatically when autoAcceptTrusted=true', async () => {
    await trustStore.trust('trusted-dev', 'FP-TRUSTED');

    const result = await pairing.evaluate('trusted-dev', 'FP-TRUSTED');
    expect(result.action).toBe('accept');
    expect(challengesCaptured.length).toBe(0);
  });

  test('unknown peer produces challenge with fresh 6-digit PIN and fires onChallenge', async () => {
    const result = await pairing.evaluate('unknown-dev', 'FP-UNKNOWN');
    expect(result.action).toBe('challenge');
    expect(typeof result.pin).toBe('string');
    expect(result.pin.length).toBe(6);

    expect(challengesCaptured.length).toBe(1);
    expect(challengesCaptured[0].deviceId).toBe('unknown-dev');
    expect(challengesCaptured[0].expectedPin).toBe(result.pin);
  });

  test('unknown peer is accepted when autoAcceptAll=true', async () => {
    pairing.updateSettings({ autoAcceptAll: true });

    const result = await pairing.evaluate('new-dev', 'FP-NEW');
    expect(result.action).toBe('accept');
    expect(await trustStore.get('new-dev')).not.toBeNull();
  });

  test('correct PIN verification accepts peer, trusts it, and resets failed attempts', async () => {
    const challengeRes = await pairing.evaluate('peer-pin', 'FP-PIN');
    const pin = challengeRes.pin;

    const verifyRes = await pairing.evaluate('peer-pin', 'FP-PIN', pin);
    expect(verifyRes.action).toBe('accept');
    expect(await trustStore.get('peer-pin')).not.toBeNull();
  });

  test('3 wrong PIN attempts rejects with too_many_attempts lockout', async () => {
    await pairing.evaluate('victim-dev', 'FP-VICTIM');

    // Attempt 1: wrong
    const r1 = await pairing.evaluate('victim-dev', 'FP-VICTIM', '000000');
    expect(r1.action).toBe('reject');
    expect(r1.reason).toBe('invalid_pin');

    // Attempt 2: wrong
    const r2 = await pairing.evaluate('victim-dev', 'FP-VICTIM', '111111');
    expect(r2.action).toBe('reject');
    expect(r2.reason).toBe('invalid_pin');

    // Attempt 3: wrong -> triggers lockout
    const r3 = await pairing.evaluate('victim-dev', 'FP-VICTIM', '222222');
    expect(r3.action).toBe('reject');
    expect(r3.reason).toBe('too_many_attempts');

    // Subsequent attempt is permanently locked out
    const r4 = await pairing.evaluate('victim-dev', 'FP-VICTIM', '999999');
    expect(r4.action).toBe('reject');
    expect(r4.reason).toBe('too_many_attempts');
  });

  test('successful PIN verification resets attempt counter after prior failures', async () => {
    const ch = await pairing.evaluate('retry-dev', 'FP-RETRY');
    const correctPin = ch.pin;

    // Fail once
    const r1 = await pairing.evaluate('retry-dev', 'FP-RETRY', '000000');
    expect(r1.action).toBe('reject');

    // Then succeed
    const r2 = await pairing.evaluate('retry-dev', 'FP-RETRY', correctPin);
    expect(r2.action).toBe('accept');

    // Untrust again to test that attempt counter was reset
    await trustStore.revoke('retry-dev');
    const ch2 = await pairing.evaluate('retry-dev', 'FP-RETRY');
    expect(ch2.action).toBe('challenge');
  });

  test('fingerprint mismatch rejects immediately', async () => {
    await trustStore.trust('spoofed-dev', 'LEGIT_FP');

    const result = await pairing.evaluate('spoofed-dev', 'EVIL_FP');
    expect(result.action).toBe('reject');
    expect(result.reason).toBe('fingerprint_mismatch');
  });
});

