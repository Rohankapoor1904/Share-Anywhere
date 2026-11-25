const { PcBootstrapController, OFFLINE_PC_STATE_EVENT } = require('../../src/engine/pcBootstrapController');
const { EngineEventEmitter } = require('../../src/engine/EngineEvents');
const { TrustStore, InMemoryTrustPersistence } = require('../../src/engine/trustStore');
const { DeviceInfo } = require('../../src/engine/models');

const HOTSPOT = { ssid: 'AndroidShare_1', password: 'pw12345678', security: 'wpa2', ip: '192.168.49.1', port: 53318 };

/**
 * justified: OfflinePcModule (BLE GATT server + Local-Only Hotspot) is an Android OS
 * boundary. This stand-in follows its contract: startSession/respond/startHotspotOnly
 * resolve or reject, and it raises OfflinePcHello / OfflinePcState events.
 */
function nativeStandIn({ hotspotError } = {}) {
  const calls = [];
  let handlers = null;
  return {
    calls,
    emitHello: (e) => handlers.onHello(e),
    emitState: (e) => handlers.onState(e),
    isSupported: async () => ({ ble: true, hotspot: true, bluetoothOn: true, reason: '' }),
    subscribe: (h) => { handlers = h; return () => { handlers = null; }; },
    startSession: async (json) => { calls.push(['startSession', JSON.parse(json)]); return true; },
    respond: async (accepted, port) => {
      calls.push(['respond', accepted, port]);
      if (!accepted) return null;
      if (hotspotError) throw new Error(hotspotError);
      return HOTSPOT;
    },
    startHotspotOnly: async (port) => { calls.push(['startHotspotOnly', port]); return HOTSPOT; },
    stopAdvertising: async () => { calls.push(['stopAdvertising']); return true; },
    stopSession: async () => { calls.push(['stopSession']); return true; }
  };
}

const built = [];

function build(options = {}) {
  const events = new EngineEventEmitter();
  const trustStore = new TrustStore(new InMemoryTrustPersistence());
  const selfDevice = new DeviceInfo({ deviceId: 'ls-android-9', displayName: 'My Phone', fingerprint: 'FPME', port: 53318 });
  const native = nativeStandIn(options);
  const controller = new PcBootstrapController({
    events,
    trustStore,
    selfDevice,
    transport: native,
    confirmTimeoutMs: options.confirmTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs
  });
  built.push(controller);
  const phases = [];
  events.on(OFFLINE_PC_STATE_EVENT, (s) => phases.push(s.phase));
  return { controller, native, trustStore, phases };
}

const HELLO = { pcDeviceId: 'pc-1234abcd', pcName: 'DESK (PC)', pcFingerprint: 'FPPC', code: '482913' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('PcBootstrapController (phone side of connect without Wi-Fi)', () => {
  afterEach(async () => {
    // Clears pending confirm/idle timers so no test leaves work running.
    while (built.length) await built.pop().dispose();
  });

  test('advertise → code → allow → hotspot ready → PC connects → disconnect releases the hotspot', async () => {
    const { controller, native, trustStore, phases } = build();
    await controller.start();
    expect(native.calls[0]).toEqual(['startSession', { deviceId: 'ls-android-9', displayName: 'My Phone', fingerprint: 'FPME' }]);

    native.emitHello(HELLO);
    expect(controller.getState()).toEqual(expect.objectContaining({
      phase: 'confirm',
      code: '482913',
      pc: { deviceId: 'pc-1234abcd', displayName: 'DESK (PC)', fingerprint: 'FPPC' }
    }));

    await controller.respond(true);
    expect(native.calls).toContainEqual(['respond', true, 53318]);
    const ready = controller.getState();
    expect(ready.phase).toBe('ready');
    // The password is not kept in UI state once it went to the PC encrypted.
    expect(ready.creds).toEqual({ ssid: 'AndroidShare_1', ip: '192.168.49.1', port: 53318, security: 'wpa2' });
    expect(await trustStore.verify('pc-1234abcd', 'FPPC')).toBe(true);

    controller.handleLiveConnected({ deviceId: 'pc-1234abcd', displayName: 'DESK (PC)' });
    expect(controller.getState().phase).toBe('connected');
    expect(native.calls).toContainEqual(['stopAdvertising']);

    controller.handleLiveDisconnected();
    await tick();
    expect(native.calls[native.calls.length - 1]).toEqual(['stopSession']);
    expect(phases).toEqual(['advertising', 'confirm', 'starting_hotspot', 'ready', 'connected', 'idle']);
  });

  test('a trusted PC is still asked to confirm the code (identity is self-declared)', async () => {
    const { controller, native, trustStore } = build();
    await trustStore.trust('pc-1234abcd', 'FPPC');
    await controller.start();
    native.emitHello(HELLO);
    expect(controller.getState().phase).toBe('confirm');
    expect(native.calls.some((c) => c[0] === 'respond')).toBe(false);
  });

  test('declining answers the PC and closes the session', async () => {
    const { controller, native } = build();
    await controller.start();
    native.emitHello(HELLO);
    await controller.respond(false);
    expect(native.calls).toContainEqual(['respond', false, 53318]);
    expect(controller.getState()).toEqual(expect.objectContaining({ phase: 'failed', error: 'You declined the PC' }));
  });

  test('no answer in time declines automatically', async () => {
    const { controller, native } = build({ confirmTimeoutMs: 10 });
    await controller.start();
    native.emitHello(HELLO);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(native.calls).toContainEqual(['respond', false, 53318]);
    expect(controller.getState().error).toBe('No answer in time');
  });

  test('a hotspot failure is shown with the native reason', async () => {
    const { controller, native } = build({ hotspotError: "Turn off the phone's regular hotspot (tethering) and try again" });
    await controller.start();
    native.emitHello(HELLO);
    await controller.respond(true);
    expect(controller.getState()).toEqual(expect.objectContaining({ phase: 'failed', error: expect.stringContaining('tethering') }));
  });

  test('an invalid code from native and hellos outside advertising are ignored or failed safely', async () => {
    const { controller, native } = build();
    controller._attach();
    native.emitHello(HELLO); // not advertising yet
    expect(controller.getState().phase).toBe('idle');
    await controller.start();
    native.emitHello({ ...HELLO, code: '12ab' });
    expect(controller.getState()).toEqual(expect.objectContaining({ phase: 'failed', error: 'The PC sent an invalid handshake' }));
  });

  test('a different PC connecting does not complete the session', async () => {
    const { controller, native } = build();
    await controller.start();
    native.emitHello(HELLO);
    await controller.respond(true);
    controller.handleLiveConnected({ deviceId: 'pc-someone-else' });
    expect(controller.getState().phase).toBe('ready');
  });

  test('manual fallback shows the password and completes on connect', async () => {
    const { controller, native } = build();
    await controller.startManual();
    expect(native.calls).toEqual([['stopAdvertising'], ['startHotspotOnly', 53318]]);
    expect(controller.getState().creds.password).toBe('pw12345678');
    controller.handleLiveConnected({ deviceId: 'pc-any', displayName: 'Laptop' });
    expect(controller.getState()).toEqual(expect.objectContaining({ phase: 'connected', pc: { deviceId: 'pc-any', displayName: 'Laptop' } }));
  });

  test('the hotspot is released when no PC connects in time', async () => {
    const { controller, native } = build({ idleTimeoutMs: 10 });
    await controller.startManual();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(native.calls[native.calls.length - 1]).toEqual(['stopSession']);
    expect(controller.getState().error).toContain('turned off');
  });

  test('the system stopping the hotspot is reported', async () => {
    const { controller, native } = build();
    await controller.startManual();
    native.emitState({ state: 'hotspot_stopped', message: "The phone's hotspot was turned off" });
    expect(controller.getState()).toEqual(expect.objectContaining({ phase: 'failed', error: "The phone's hotspot was turned off" }));
    await controller.dispose();
  });
});
