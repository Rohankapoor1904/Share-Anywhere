const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  WifiJoiner,
  WifiJoinError,
  buildProfileXml,
  parseInterfaces,
  isLocationBlocked,
  profileNameFor
} = require('../../desktop/engine/wifi-join');

const SHOW_CONNECTED = `
There is 1 interface on the system:

    Name                   : Wi-Fi 2
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 6b2c5e1e-0000-4000-8000-1234567890ab
    Physical address       : a4:b1:c1:00:11:22
    Interface type         : Primary
    State                  : connected
    SSID                   : Home Net 5G
    AP BSSID               : 10:20:30:40:50:60
    Band                   : 5 GHz
    Profile                : Home Net 5G
    Hosted network status  : Not available
`;

const SHOW_DISCONNECTED = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    State                  : disconnected
`;

const LOCATION_BLOCKED = `Network shell commands need location permission to access WLAN information. Turn on Location services on the Location page in Privacy & security settings.

Here is the URI for the Location page in the Settings app:
ms-settings:privacy-location
`;

const CREDS = { ssid: 'AndroidShare_4821', password: 'q7mxk2pa9w', security: 'wpa2', ip: '192.168.49.1', port: 53318 };

/**
 * justified: netsh is the Windows OS boundary. This runner records the exact commands
 * and replays real netsh output captured from Windows, so the orchestration is tested
 * without changing the test machine's Wi-Fi.
 */
function recordingRunner(script) {
  const calls = [];
  const xmlSeen = [];
  const run = async (args) => {
    calls.push(args.join(' '));
    const fileArg = args.find((a) => a.startsWith('filename='));
    if (fileArg) {
      const file = fileArg.slice('filename='.length).replace(/^"|"$/g, '');
      xmlSeen.push({ file, xml: fs.readFileSync(file, 'utf8') });
    }
    const handler = script.find((s) => s.match.test(args.join(' ')));
    return handler ? handler.reply(args) : { code: 0, stdout: 'OK', stderr: '' };
  };
  return { run, calls, xmlSeen };
}

describe('Windows Wi-Fi join (netsh)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-wifi-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('profile XML carries the SSID as hex and escapes special characters', () => {
    const { name, xml } = buildProfileXml({ ssid: 'R&D <"Lab">', password: "p<a>ss&'word", security: 'wpa2' });
    expect(name).toBe(profileNameFor('R&D <"Lab">'));
    expect(name).toMatch(/^LocalShare-[A-Za-z0-9_-]+$/);
    expect(xml).toContain(`<hex>${Buffer.from('R&D <"Lab">').toString('hex').toUpperCase()}</hex>`);
    expect(xml).toContain('<name>R&amp;D &lt;&quot;Lab&quot;&gt;</name>');
    expect(xml).toContain('<keyMaterial>p&lt;a&gt;ss&amp;&apos;word</keyMaterial>');
    expect(xml).toContain('<authentication>WPA2PSK</authentication>');
    expect(xml).toContain('<connectionMode>manual</connectionMode>');
  });

  test('WPA3-only and open hotspots get the matching security block', () => {
    expect(buildProfileXml({ ssid: 'x1', password: '12345678', security: 'wpa3' }).xml).toContain('<authentication>WPA3SAE</authentication>');
    expect(buildProfileXml({ ssid: 'x1', password: '12345678', security: 'wpa3-transition' }).xml).toContain('WPA2PSK');
    const open = buildProfileXml({ ssid: 'x1', password: '', security: 'open' }).xml;
    expect(open).toContain('<authentication>open</authentication>');
    expect(open).not.toContain('keyMaterial');
  });

  test('bad names and passwords are rejected', () => {
    expect(() => buildProfileXml({ ssid: '', password: '12345678' })).toThrow(WifiJoinError);
    expect(() => buildProfileXml({ ssid: 'x'.repeat(33), password: '12345678' })).toThrow(WifiJoinError);
    expect(() => buildProfileXml({ ssid: 'ok', password: 'short' })).toThrow(WifiJoinError);
  });

  test('parses netsh interface output', () => {
    expect(parseInterfaces(SHOW_CONNECTED)).toEqual([
      { name: 'Wi-Fi 2', state: 'connected', ssid: 'Home Net 5G', profile: 'Home Net 5G' }
    ]);
    expect(parseInterfaces(SHOW_DISCONNECTED)).toEqual([{ name: 'Wi-Fi', state: 'disconnected', ssid: '', profile: '' }]);
    expect(isLocationBlocked(LOCATION_BLOCKED)).toBe(true);
    expect(isLocationBlocked(SHOW_CONNECTED)).toBe(false);
  });

  test('join adds a temporary profile, connects, waits for the phone, and restore puts the old Wi-Fi back', async () => {
    const runner = recordingRunner([{ match: /show interfaces/, reply: () => ({ code: 0, stdout: SHOW_CONNECTED, stderr: '' }) }]);
    let probes = 0;
    const joiner = new WifiJoiner({
      run: runner.run,
      probe: async (ip, port) => {
        expect([ip, port]).toEqual(['192.168.49.1', 53318]);
        probes += 1;
        return probes >= 3;
      },
      tmpDir,
      platform: 'win32',
      pollMs: 5
    });
    const steps = [];
    const joined = await joiner.join(CREDS, { onStep: (s) => steps.push(s) });
    const name = profileNameFor(CREDS.ssid);
    expect(joined).toEqual({ iface: 'Wi-Fi 2', previousProfile: 'Home Net 5G', profileName: name });
    expect(steps).toEqual(['joining', 'waiting']);
    expect(runner.calls[0]).toBe('wlan show interfaces');
    expect(runner.calls[1]).toMatch(/^wlan add profile filename=".+localshare-wlan-[0-9a-f]+\.xml" interface="Wi-Fi 2" user=current$/);
    expect(runner.calls[2]).toBe(`wlan connect name="${name}" interface="Wi-Fi 2"`);
    expect(runner.xmlSeen[0].xml).toContain('<keyMaterial>q7mxk2pa9w</keyMaterial>');
    // The password file never outlives the add command.
    expect(fs.existsSync(runner.xmlSeen[0].file)).toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);

    await expect(joiner.restore()).resolves.toEqual({ restored: true, previousProfile: 'Home Net 5G' });
    expect(runner.calls.slice(-2)).toEqual([
      `wlan delete profile name="${name}" interface="Wi-Fi 2"`,
      'wlan connect name="Home Net 5G" interface="Wi-Fi 2"'
    ]);
    await expect(joiner.restore()).resolves.toEqual({ restored: false });
  });

  test('Windows Location block is reported with the Settings link', async () => {
    const runner = recordingRunner([{ match: /show interfaces/, reply: () => ({ code: 1, stdout: LOCATION_BLOCKED, stderr: '' }) }]);
    const joiner = new WifiJoiner({ run: runner.run, probe: async () => true, tmpDir, platform: 'win32' });
    let caught = null;
    try {
      await joiner.join(CREDS);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WifiJoinError);
    expect(caught.code).toBe('ERR_WIFI_LOCATION');
    expect(caught.details.settingsUri).toBe('ms-settings:privacy-location');
  });

  test('an unreachable phone fails with the Wi-Fi state, and restore still cleans up', async () => {
    const runner = recordingRunner([
      { match: /show interfaces/, reply: () => ({ code: 0, stdout: SHOW_DISCONNECTED, stderr: '' }) }
    ]);
    const joiner = new WifiJoiner({ run: runner.run, probe: async () => false, tmpDir, platform: 'win32', pollMs: 5 });
    await expect(joiner.join(CREDS, { timeoutMs: 40 })).rejects.toThrow('did not answer at 192.168.49.1:53318 (Wi-Fi is disconnected)');
    await joiner.restore();
    expect(runner.calls[runner.calls.length - 1]).toMatch(/^wlan delete profile name="LocalShare-/);
    // It was not connected before, so there is nothing to reconnect.
    expect(runner.calls.some((c) => c.startsWith('wlan connect name="Home'))).toBe(false);
  });

  test('a failing netsh command surfaces its output', async () => {
    const runner = recordingRunner([
      { match: /show interfaces/, reply: () => ({ code: 0, stdout: SHOW_CONNECTED, stderr: '' }) },
      { match: /add profile/, reply: () => ({ code: 1, stdout: 'The profile format is invalid.', stderr: '' }) }
    ]);
    const joiner = new WifiJoiner({ run: runner.run, probe: async () => true, tmpDir, platform: 'win32' });
    await expect(joiner.join(CREDS)).rejects.toThrow('Adding the hotspot profile failed: The profile format is invalid.');
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  test('other platforms are refused clearly', async () => {
    const joiner = new WifiJoiner({ run: async () => ({ code: 0, stdout: '', stderr: '' }), platform: 'linux' });
    await expect(joiner.join(CREDS)).rejects.toThrow('only supported on Windows');
  });
});
