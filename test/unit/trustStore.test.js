const { TrustStore, InMemoryTrustPersistence } = require('../../src/engine/trustStore');
const { TrustMismatchError } = require('../../src/utils/errors');

describe('TrustStore Unit Tests (§7, §12.1)', () => {
  let store;

  beforeEach(() => {
    store = new TrustStore(new InMemoryTrustPersistence());
  });

  test('TOFU insert and lookup', async () => {
    expect(await store.get('dev-1')).toBeNull();

    await store.trust('dev-1', 'SHA256:AAA111');
    const record = await store.get('dev-1');

    expect(record).not.toBeNull();
    expect(record.deviceId).toBe('dev-1');
    expect(record.fingerprint).toBe('SHA256:AAA111');
    expect(typeof record.trustedAt).toBe('number');
  });

  test('verify returns true for matching fingerprint', async () => {
    await store.trust('dev-2', 'SHA256:BBB222');
    const isValid = await store.verify('dev-2', 'SHA256:BBB222');
    expect(isValid).toBe(true);
  });

  test('verify returns false for untrusted device', async () => {
    const isValid = await store.verify('dev-unknown', 'SHA256:XYZ');
    expect(isValid).toBe(false);
  });

  test('verify throws TrustMismatchError for altered fingerprint', async () => {
    await store.trust('dev-3', 'SHA256:ORIGINAL');

    await expect(store.verify('dev-3', 'SHA256:ATTACKER')).rejects.toThrow(TrustMismatchError);
  });

  test('revoke removes trusted entry', async () => {
    await store.trust('dev-4', 'SHA256:DDD444');
    expect(await store.get('dev-4')).not.toBeNull();

    await store.revoke('dev-4');
    expect(await store.get('dev-4')).toBeNull();
  });

  test('getAll retrieves all trusted records', async () => {
    await store.trust('dev-A', 'FP-A');
    await store.trust('dev-B', 'FP-B');

    const all = await store.getAll();
    expect(all.length).toBe(2);
    expect(all.map((d) => d.deviceId)).toEqual(expect.arrayContaining(['dev-A', 'dev-B']));
  });
});
