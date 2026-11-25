/**
 * Join a phone's Local-Only Hotspot from Windows with `netsh wlan`, then put the PC
 * back on the network it was using before.
 *
 *   join():    show interfaces (remember the current profile) → add a temporary WLAN
 *              profile from XML → connect → wait until the phone answers /v1/info
 *   restore(): delete the temporary profile → reconnect the previous profile
 *
 * The command runner and the reachability probe are injectable so the orchestration is
 * testable; production uses execFile('netsh') and a real HTTP GET.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PROFILE_PREFIX = 'LocalShare-';

class WifiJoinError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {object} [details]
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'WifiJoinError';
    this.code = code;
    this.details = details;
  }
}

/** @param {string} value */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Profile names end up in netsh arguments, so only safe characters are used.
 * @param {string} ssid
 */
function profileNameFor(ssid) {
  const digest = crypto.createHash('sha256').update(String(ssid)).digest('hex').slice(0, 8);
  const readable = String(ssid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  return `${PROFILE_PREFIX}${readable || 'hotspot'}-${digest}`;
}

/**
 * WLAN profile XML for the hotspot. The SSID is also given as hex, so names with any
 * characters match exactly. connectionMode=manual: Windows never auto-joins it later.
 * @param {{ ssid: string, password: string, security?: string }} creds
 * @returns {{ name: string, xml: string }}
 */
function buildProfileXml({ ssid, password, security = 'wpa2' }) {
  if (!ssid || Buffer.byteLength(ssid, 'utf8') > 32) {
    throw new WifiJoinError('The hotspot name is invalid', 'ERR_WIFI_BAD_SSID');
  }
  const open = security === 'open';
  if (!open && (typeof password !== 'string' || password.length < 8 || password.length > 63)) {
    throw new WifiJoinError('The hotspot password must be 8 to 63 characters', 'ERR_WIFI_BAD_PASSWORD');
  }
  const name = profileNameFor(ssid);
  const hex = Buffer.from(ssid, 'utf8').toString('hex').toUpperCase();
  // WPA3-SAE-only hotspots need WPA3SAE; transition-mode hotspots accept WPA2.
  const auth = open ? 'open' : security === 'wpa3' ? 'WPA3SAE' : 'WPA2PSK';
  const encryption = open ? 'none' : 'AES';
  const sharedKey = open ? '' : `
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>${escapeXml(password)}</keyMaterial>
            </sharedKey>`;
  const xml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>${escapeXml(name)}</name>
    <SSIDConfig>
        <SSID>
            <hex>${hex}</hex>
            <name>${escapeXml(ssid)}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>manual</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>${auth}</authentication>
                <encryption>${encryption}</encryption>
                <useOneX>false</useOneX>
            </authEncryption>${sharedKey}
        </security>
    </MSM>
</WLANProfile>
`;
  return { name, xml };
}

/**
 * Parse `netsh wlan show interfaces`. Keys are matched in English; on other display
 * languages the names may be missing, and callers fall back to the default adapter.
 * @param {string} text
 * @returns {Array<{ name: string, state: string, ssid: string, profile: string }>}
 */
function parseInterfaces(text) {
  const interfaces = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([^:]+?)\s*:\s?(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'name') {
      current = { name: value, state: '', ssid: '', profile: '' };
      interfaces.push(current);
    } else if (current && key === 'state') {
      current.state = value.toLowerCase();
    } else if (current && key === 'ssid') {
      current.ssid = value;
    } else if (current && key === 'profile') {
      current.profile = value;
    }
  }
  return interfaces;
}

/**
 * Windows 11 24H2+ blocks netsh wlan without the Location permission.
 * @param {string} text
 */
function isLocationBlocked(text) {
  return /location permission|ms-settings:privacy-location/i.test(String(text || ''));
}

/** @param {string} value */
function quoteArg(value) {
  if (/["\r\n]/.test(value)) {
    throw new WifiJoinError(`Unsafe value for a netsh argument: ${value}`, 'ERR_WIFI_ARGUMENT');
  }
  return `"${value}"`;
}

/**
 * Real runner: netsh with verbatim arguments (values are pre-quoted by quoteArg).
 * @param {string[]} args
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runNetsh(args) {
  return new Promise((resolve) => {
    execFile('netsh', args, { windowsHide: true, windowsVerbatimArguments: true, timeout: 20000 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || (err && !stdout ? err.message : '')) });
    });
  });
}

/**
 * Real probe: the phone's LocalShare server answers /v1/info.
 * @param {string} ip
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function probeLocalShare(ip, port) {
  return new Promise((resolve) => {
    const req = http.get({ host: ip, port, path: '/v1/info', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

class WifiJoiner {
  /**
   * @param {object} [options]
   * @param {(args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} [options.run]
   * @param {(ip: string, port: number) => Promise<boolean>} [options.probe]
   * @param {string} [options.tmpDir]
   * @param {string} [options.platform]
   * @param {number} [options.pollMs]
   */
  constructor(options = {}) {
    this.run = options.run || runNetsh;
    this.probe = options.probe || probeLocalShare;
    this.tmpDir = options.tmpDir || os.tmpdir();
    this.platform = options.platform || process.platform;
    this.pollMs = options.pollMs || 500;
    /** @type {null | { iface: string, previousProfile: string, profileName: string }} */
    this.joined = null;
  }

  async _netsh(args, label) {
    const result = await this.run(args);
    const output = `${result.stdout}\n${result.stderr}`;
    if (isLocationBlocked(output)) {
      throw new WifiJoinError(
        'Windows needs Location access to manage Wi-Fi. Turn on Settings → Privacy & security → Location, then try again.',
        'ERR_WIFI_LOCATION',
        { settingsUri: 'ms-settings:privacy-location' }
      );
    }
    if (result.code !== 0) {
      throw new WifiJoinError(`${label} failed: ${output.trim() || `exit code ${result.code}`}`, 'ERR_WIFI_NETSH', { args, code: result.code });
    }
    return result.stdout;
  }

  /**
   * Join the hotspot and wait until the phone is reachable.
   * @param {{ ssid: string, password: string, security?: string, ip: string, port: number }} creds
   * @param {{ timeoutMs?: number, onStep?: (step: string) => void }} [options]
   */
  async join(creds, options = {}) {
    if (this.platform !== 'win32') {
      throw new WifiJoinError('Joining a phone hotspot automatically is only supported on Windows', 'ERR_WIFI_PLATFORM');
    }
    const timeoutMs = options.timeoutMs || 25000;
    const onStep = options.onStep || (() => {});
    if (this.joined) await this.restore();

    const listing = await this._netsh(['wlan', 'show', 'interfaces'], 'Reading Wi-Fi adapters');
    const adapters = parseInterfaces(listing);
    const adapter = adapters[0] || null;
    const iface = adapter ? adapter.name : '';
    if (/There is no wireless interface/i.test(listing)) {
      throw new WifiJoinError('This PC has no Wi-Fi adapter', 'ERR_WIFI_NO_ADAPTER');
    }
    const previousProfile = adapter && adapter.state === 'connected' && !adapter.profile.startsWith(PROFILE_PREFIX)
      ? adapter.profile
      : '';
    const ifaceArg = iface ? [`interface=${quoteArg(iface)}`] : [];

    const { name, xml } = buildProfileXml(creds);
    const file = path.join(this.tmpDir, `localshare-wlan-${crypto.randomBytes(6).toString('hex')}.xml`);
    onStep('joining');
    // The file holds the hotspot password: owner-only, and removed right after use.
    fs.writeFileSync(file, xml, { encoding: 'utf8', mode: 0o600 });
    try {
      await this._netsh(['wlan', 'add', 'profile', `filename=${quoteArg(file)}`, ...ifaceArg, 'user=current'], 'Adding the hotspot profile');
    } finally {
      fs.rmSync(file, { force: true });
    }
    this.joined = { iface, previousProfile, profileName: name };
    await this._netsh(['wlan', 'connect', `name=${quoteArg(name)}`, ...ifaceArg], 'Connecting to the hotspot');

    onStep('waiting');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.probe(creds.ip, creds.port)) {
        return { iface, previousProfile, profileName: name };
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    let lastState = '';
    try {
      const after = parseInterfaces(await this._netsh(['wlan', 'show', 'interfaces'], 'Reading Wi-Fi state'));
      const now = after.find((a) => !iface || a.name === iface) || after[0];
      lastState = now ? `${now.state || 'unknown'}${now.ssid ? ` to ${now.ssid}` : ''}` : '';
    } catch (err) {
      lastState = err.message;
    }
    throw new WifiJoinError(
      `Joined the hotspot but the phone did not answer at ${creds.ip}:${creds.port}${lastState ? ` (Wi-Fi is ${lastState})` : ''}`,
      'ERR_WIFI_UNREACHABLE'
    );
  }

  /** Remove the temporary profile and reconnect the previous network. Safe to call twice. */
  async restore() {
    const joined = this.joined;
    if (!joined) return { restored: false };
    this.joined = null;
    const ifaceArg = joined.iface ? [`interface=${quoteArg(joined.iface)}`] : [];
    const errors = [];
    try {
      await this._netsh(['wlan', 'delete', 'profile', `name=${quoteArg(joined.profileName)}`, ...ifaceArg], 'Removing the hotspot profile');
    } catch (err) {
      errors.push(err.message);
    }
    if (joined.previousProfile) {
      try {
        await this._netsh(['wlan', 'connect', `name=${quoteArg(joined.previousProfile)}`, ...ifaceArg], 'Reconnecting your Wi-Fi');
      } catch (err) {
        errors.push(err.message);
      }
    }
    if (errors.length > 0) {
      throw new WifiJoinError(errors.join('; '), 'ERR_WIFI_RESTORE');
    }
    return { restored: true, previousProfile: joined.previousProfile };
  }
}

module.exports = {
  WifiJoiner,
  WifiJoinError,
  buildProfileXml,
  parseInterfaces,
  isLocationBlocked,
  profileNameFor,
  escapeXml,
  probeLocalShare
};
