const { OfflinePcSession } = require('../../desktop/engine/offline-session');
const { createPhoneSession } = require('../../desktop/engine/offline-bootstrap');

const SELF = { deviceId: 'pc-00112233aabbccdd', displayName: 'DESK (PC)', fingerprint: 'FPPC' };
const PHONE = { deviceId: 'ls-android-77', displayName: 'Rohan Phone', fingerprint: 'FPPHONE' };
const HOTSPOT = { ssid: 'AndroidShare_9', pass: 'hunter2hunter2', ip: '192.168.49.1', port: 53318, sec: 'wpa2' };

/**
 * justified: the Wi-Fi joiner drives netsh (OS boundary); it is covered by wifiJoin.test.js.
 * Here it records calls so the session state machine can be checked end to end with the
 * real handshake crypto on both sides.
 */
function recordingJoiner({ failJoin } = {}) {
  const calls = [];
  return {
    calls,
    async join(creds, { onStep }) {
      calls.push(['join', creds]);
      onStep('joining');
      if (failJoin) throw Object.assign(new Error(failJoin.message), { code: failJoin.code, details: failJoin.details || {} });
      onStep('waiting');
      return { iface: 'Wi-Fi', previousProfile: 'Home', profileName: 'LocalShare-x' };
    },
    async restore() {
      calls.push(['restore']);
      return { restored: true };
    }
  };
}

function build(options = {}) {
  const states = [];
  const joiner = recordingJoiner(options);
  const connected = [];
  const session = new OfflinePcSession({
    selfDevice: SELF,
    joiner,
    connect: async (peer) => {
      connected.push(peer);
      return options.refuse ? null : { connected: true, peer };
    },
    onState: (s) => states.push(s)
  });
  return { session, joiner, connected, states };
}

describe('OfflinePcSession (PC side of connect without Wi-Fi)', () => {
  test('full handshake: codes match, credentials decrypt, hotspot joined, live link opened', async () => {
    const { session, joiner, connected, states } = build();
    const phone = createPhoneSession(PHONE);

    const begin = session.begin(phone.info.toString('base64'));
    expect(begin.phone).toEqual({ deviceId: PHONE.deviceId, displayName: PHONE.displayName, platform: 'android', fingerprint: PHONE.fingerprint });
    const onPhone = phone.acceptHello(Buffer.from(begin.hello, 'base64'));
    expect(onPhone.code).toBe(begin.code);
    expect(onPhone.pc.deviceId).toBe(SELF.deviceId);
    expect(states[0]).toEqual({ step: 'confirm', code: begin.code, phone: begin.phone });

    const blob = phone.sealCredentials(HOTSPOT).toString('base64');
    const peer = await session.acceptCredentials(blob);

    expect(joiner.calls[0]).toEqual(['join', { ssid: HOTSPOT.ssid, password: HOTSPOT.pass, security: 'wpa2', ip: HOTSPOT.ip, port: HOTSPOT.port }]);
    expect(peer).toEqual({
      deviceId: PHONE.deviceId,
      displayName: PHONE.displayName,
      address: HOTSPOT.ip,
      port: HOTSPOT.port,
      platform: 'android',
      fingerprint: PHONE.fingerprint,
      viaHotspot: true
    });
    expect(connected).toEqual([peer]);
    expect(states.map((s) => s.step)).toEqual(['confirm', 'joining', 'joining', 'waiting', 'connecting', 'connected']);
    expect(session.isHotspotPeer({ deviceId: PHONE.deviceId, address: HOTSPOT.ip })).toBe(true);
    expect(session.isHotspotPeer({ deviceId: PHONE.deviceId, address: '10.0.0.4' })).toBe(false);

    await session.end();
    expect(joiner.calls[joiner.calls.length - 1]).toEqual(['restore']);
    expect(session.getState()).toEqual({ step: 'idle' });
    expect(session.isHotspotPeer(peer)).toBe(false);
  });

  test('credentials sealed for another PC are rejected and nothing is joined', async () => {
    const { session, joiner } = build();
    const phone = createPhoneSession(PHONE);
    session.begin(phone.info.toString('base64'));
    const other = build().session;
    const otherHello = other.begin(phone.info.toString('base64')).hello;
    phone.acceptHello(Buffer.from(otherHello, 'base64'));
    const blob = phone.sealCredentials(HOTSPOT).toString('base64');
    await expect(session.acceptCredentials(blob)).rejects.toThrow('failed authentication');
    expect(joiner.calls).toEqual([]);
  });

  test('credentials cannot be used twice', async () => {
    const { session } = build();
    const phone = createPhoneSession(PHONE);
    const begin = session.begin(phone.info.toString('base64'));
    phone.acceptHello(Buffer.from(begin.hello, 'base64'));
    const blob = phone.sealCredentials(HOTSPOT).toString('base64');
    await session.acceptCredentials(blob);
    await expect(session.acceptCredentials(blob)).rejects.toThrow('Bluetooth first');
  });

  test('a join failure restores Wi-Fi and reports the Settings link', async () => {
    const { session, joiner, states } = build({
      failJoin: { message: 'Windows needs Location access', code: 'ERR_WIFI_LOCATION', details: { settingsUri: 'ms-settings:privacy-location' } }
    });
    await expect(session.joinManual({ ssid: 'AndroidShare_9', password: 'hunter2hunter2', ip: '192.168.49.1', port: '53318' }))
      .rejects.toThrow('Location');
    expect(joiner.calls.map((c) => c[0])).toEqual(['join', 'restore']);
    expect(states[states.length - 1]).toEqual(expect.objectContaining({
      step: 'failed',
      code: 'ERR_WIFI_LOCATION',
      settingsUri: 'ms-settings:privacy-location'
    }));
  });

  test('a phone that refuses the live link fails the session and restores Wi-Fi', async () => {
    const { session, joiner } = build({ refuse: true });
    await expect(session.joinManual({ ssid: 'AndroidShare_9', password: 'hunter2hunter2', ip: '192.168.49.1' }))
      .rejects.toThrow('refused');
    expect(joiner.calls[joiner.calls.length - 1]).toEqual(['restore']);
  });

  test('manual details are validated before touching Wi-Fi', async () => {
    const { session, joiner } = build();
    await expect(session.joinManual({ ssid: '', password: 'hunter2hunter2', ip: '192.168.49.1' })).rejects.toThrow('name');
    await expect(session.joinManual({ ssid: 'A', password: 'hunter2hunter2', ip: 'phone.local' })).rejects.toThrow('address');
    expect(joiner.calls).toEqual([]);
  });

  test('cancel resets the handshake', () => {
    const { session, states } = build();
    session.begin(createPhoneSession(PHONE).info.toString('base64'));
    session.cancel('The phone declined this PC.');
    expect(states[states.length - 1]).toEqual({ step: 'failed', error: 'The phone declined this PC.', code: 'ERR_OFFLINE_CANCELLED' });
    session.cancel();
    expect(session.getState()).toEqual({ step: 'idle' });
  });
});
