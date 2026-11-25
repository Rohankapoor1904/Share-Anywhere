const crypto = require('crypto');
const {
  createPcSession,
  createPhoneSession,
  validateCredentials,
  transcriptHash,
  deriveSessionSecrets,
  BootstrapError,
  SERVICE_UUID,
  INFO_UUID,
  HELLO_UUID,
  STATUS_UUID,
  CREDS_UUID
} = require('../../desktop/engine/offline-bootstrap');

// Shared with android/app/src/test/java/com/rohan/localshare/BootstrapCryptoTest.kt:
// the Kotlin side must produce exactly these bytes.
const V = {
  phonePriv: '514fe05bad9d00423ba965f4d8c04ebf1607264d05d1abc6c09dbb92c29a303c',
  pcPriv: '677be987b319f3cf3fbc2fddefabe9dc3b699fa40cf00da2a6a4d2d3e8d06bc0',
  phonePub: '04db5b484e7622e31163b90d4afe888d401cea038c07d14ad819c782d09816705ce774fe82d31b46f87dcc30dc6a218871ddaa276df6dc1ae076943968f945f2b3',
  pcPub: '04fa73b5f61b08a2e87c0d07bf250fa42fd506d4360defaf19b66a830641fb07cdb014bfd48208ea01ae77aa69d06da2998f9b11bdef059a563796c968bf21d11c',
  noncePhone: '000102030405060708090a0b0c0d0e0f',
  noncePc: '101112131415161718191a1b1c1d1e1f',
  iv: '202122232425262728292a2b',
  shared: '233c76abb5e1fd3da32989286592c269eccb4deb2e7abd60f9f6600ca7d8fa39',
  transcript: '489ccf8503878961bbaf4b6c1ede18b07a6a92df7069ab6ef59ac0015d10f147',
  key: 'a12afad1d7fc4f8415539e0100c8803d689e01b530c83e707b2afc72b07011f1',
  code: '989846',
  blob: '202122232425262728292a2bf07c34ef24959274c953db9c8388cd48df2d15a6081d9924acce4b403b97d1cbbfbe963d' +
    '2bd545538745f16e94c94197bd019ff48d86081b1983828561cde1e148244e2b4267c1966364b88e9001018ae93688fe' +
    '475f630f00b76e179c62e3b7f164dae4ae4aa89a8bc3a902e7ec'
};
const hex = (s) => Buffer.from(s, 'hex');
const CREDS = { ssid: 'AndroidShare_4821', pass: 'q7mxk2pa9w', ip: '192.168.49.1', port: 53318, sec: 'wpa2' };
const PHONE = { deviceId: 'ls-android-1234', displayName: 'Test Phone', fingerprint: 'FPPHONE' };
const PC = { deviceId: 'pc-0011223344556677', displayName: 'TEST-PC (PC)', fingerprint: 'FPPC' };

function vectorSessions() {
  const phone = createPhoneSession(PHONE, { privateKey: hex(V.phonePriv), nonce: hex(V.noncePhone) });
  const pc = createPcSession(PC, { privateKey: hex(V.pcPriv), nonce: hex(V.noncePc) });
  return { phone, pc };
}

describe('Offline PC bootstrap crypto', () => {
  test('UUIDs are valid 128-bit UUIDs in one LocalShare base', () => {
    for (const uuid of [SERVICE_UUID, INFO_UUID, HELLO_UUID, STATUS_UUID, CREDS_UUID]) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  test('fixed vectors: transcript, key, code and sealed blob match the Kotlin test', () => {
    const transcript = transcriptHash(hex(V.phonePub), hex(V.pcPub), hex(V.noncePhone), hex(V.noncePc));
    expect(transcript.toString('hex')).toBe(V.transcript);
    const { key, code } = deriveSessionSecrets(hex(V.shared), transcript);
    expect(key.toString('hex')).toBe(V.key);
    expect(code).toBe(V.code);

    const { phone, pc } = vectorSessions();
    const result = pc.acceptInfo(phone.info);
    expect(result.code).toBe(V.code);
    expect(phone.acceptHello(result.hello).code).toBe(V.code);
    expect(phone.sealCredentials(CREDS, hex(V.iv)).toString('hex')).toBe(V.blob);
    expect(pc.openCredentials(hex(V.blob))).toEqual(CREDS);
  });

  test('random sessions agree on the code and the PC reads the credentials', () => {
    const phone = createPhoneSession(PHONE);
    const pc = createPcSession(PC);
    const { hello, code, phone: phoneInfo } = pc.acceptInfo(phone.info);
    const seen = phone.acceptHello(hello);
    expect(seen.code).toBe(code);
    expect(code).toMatch(/^\d{6}$/);
    expect(seen.pc).toEqual({ deviceId: PC.deviceId, displayName: PC.displayName, fingerprint: PC.fingerprint });
    expect(phoneInfo.deviceId).toBe(PHONE.deviceId);
    expect(pc.openCredentials(phone.sealCredentials(CREDS))).toEqual(CREDS);
  });

  test('a man-in-the-middle relaying with its own keys makes the two codes differ', () => {
    const phone = createPhoneSession(PHONE);
    const pc = createPcSession(PC);
    // The attacker answers the PC as a fake phone, and the phone as a fake PC.
    const fakePhone = createPhoneSession(PHONE);
    const fakePc = createPcSession(PC);
    const pcSide = pc.acceptInfo(fakePhone.info);
    fakePhone.acceptHello(pcSide.hello);
    const fakePcSide = fakePc.acceptInfo(phone.info);
    const phoneSide = phone.acceptHello(fakePcSide.hello);
    expect(pcSide.code).not.toBe(phoneSide.code);
  });

  test('tampered, truncated or foreign credential blobs are rejected', () => {
    const { phone, pc } = vectorSessions();
    pc.acceptInfo(phone.info);
    const blob = hex(V.blob);
    const tampered = Buffer.from(blob);
    tampered[20] ^= 0x01;
    expect(() => pc.openCredentials(tampered)).toThrow(BootstrapError);
    expect(() => pc.openCredentials(blob.subarray(0, 20))).toThrow(BootstrapError);

    const other = createPhoneSession(PHONE);
    const otherPc = createPcSession(PC);
    other.acceptHello(otherPc.acceptInfo(other.info).hello);
    expect(() => pc.openCredentials(other.sealCredentials(CREDS))).toThrow('failed authentication');
  });

  test('invalid public keys and malformed messages are rejected', () => {
    const pc = createPcSession(PC);
    const info = JSON.parse(createPhoneSession(PHONE).info.toString('utf8'));
    const offCurve = Buffer.from(info.pk, 'base64');
    offCurve[64] ^= 0x01;
    expect(() => pc.acceptInfo(JSON.stringify({ ...info, pk: offCurve.toString('base64') }))).toThrow(BootstrapError);
    expect(() => pc.acceptInfo(JSON.stringify({ ...info, pk: Buffer.alloc(33, 2).toString('base64') }))).toThrow(BootstrapError);
    expect(() => pc.acceptInfo(JSON.stringify({ ...info, v: 2 }))).toThrow('version');
    expect(() => pc.acceptInfo(JSON.stringify({ ...info, d: '../evil' }))).toThrow('device id');
    expect(() => pc.acceptInfo('not json')).toThrow(BootstrapError);
    expect(() => pc.acceptInfo(Buffer.alloc(2000, 0x20))).toThrow('invalid size');
    expect(() => pc.openCredentials(Buffer.alloc(64))).toThrow('Read the phone info');
  });

  test('credentials are validated before use', () => {
    expect(validateCredentials(CREDS)).toEqual(CREDS);
    expect(() => validateCredentials({ ...CREDS, ssid: '' })).toThrow('name');
    expect(() => validateCredentials({ ...CREDS, ssid: 'x'.repeat(33) })).toThrow('name');
    expect(() => validateCredentials({ ...CREDS, pass: 'short' })).toThrow('password');
    expect(validateCredentials({ ...CREDS, pass: '', sec: 'open' }).sec).toBe('open');
    expect(() => validateCredentials({ ...CREDS, ip: '999.1.1.1' })).toThrow('address');
    expect(() => validateCredentials({ ...CREDS, port: 70000 })).toThrow('port');
  });

  test('the phone refuses to seal before any PC wrote its hello', () => {
    const phone = createPhoneSession(PHONE);
    expect(() => phone.sealCredentials(CREDS)).toThrow('hello');
  });

  test('every session uses a fresh key pair and nonce', () => {
    const a = JSON.parse(createPhoneSession(PHONE).info.toString('utf8'));
    const b = JSON.parse(createPhoneSession(PHONE).info.toString('utf8'));
    expect(a.pk).not.toBe(b.pk);
    expect(a.nonce).not.toBe(b.nonce);
    expect(crypto.timingSafeEqual(Buffer.from(a.pk, 'base64').subarray(0, 1), Buffer.from([0x04]))).toBe(true);
  });
});
