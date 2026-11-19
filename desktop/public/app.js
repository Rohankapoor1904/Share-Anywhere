// LocalShare PC Desktop Application Frontend
(function () {
  let peers = [];
  let stagedFiles = [];
  let selectedPeer = null;
  let currentTheme = localStorage.getItem('localshare_desktop_theme') || 'midnight';

  // Apply Initial Theme
  document.documentElement.setAttribute('data-theme', currentTheme);

  // Shared 24x24 vector icon geometry, mirrored from the mobile icon set so both
  // clients draw identical shapes without a runtime dependency.
  const ICON_SHAPES = {
    android: '<path d="M6 10.5a6 6 0 0 1 12 0v5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 15.5z"/><path d="M8.4 5.2L6.7 2.6"/><path d="M15.6 5.2l1.7-2.6"/><path d="M9.6 10.4h.01"/><path d="M14.4 10.4h.01"/>',
    desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    ios: '<path d="M16.4 12.7c0-1.9 1.5-2.8 1.6-2.9-.9-1.3-2.3-1.5-2.8-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.1 1.9-1.4 2.3-.4 5.8.9 7.7.7.9 1.4 2 2.4 1.9 1 0 1.3-.6 2.5-.6s1.5.6 2.5.6 1.7-.9 2.3-1.8c.7-1.1 1-2.1 1-2.2-.1 0-1.9-.8-1.9-3.1z"/><path d="M14.3 6.6c.5-.6.9-1.5.8-2.4-.8 0-1.8.5-2.4 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.5 2.4-1.2z"/>',
    localsend: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
    devices: '<rect x="2" y="6" width="8" height="15" rx="2"/><path d="M6 17.5h.01"/><rect x="13" y="4" width="9" height="7" rx="1.5"/><path d="M17.5 11v4"/><path d="M15 16.5h5"/>',
    radar: '<circle cx="12" cy="12" r="2"/><path d="M12 12l6.4-6.4"/><path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5"/><path d="M12 2.8a9.2 9.2 0 0 1 9.2 9.2"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    file: '<path d="M13 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M13 2v7h7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15.5l-4.5-4.5L5.5 22"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2.5"/><path d="M16 10.5l6-3.2v9.4l-6-3.2z"/>',
    audio: '<path d="M9 18V5.5l12-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    document: '<path d="M14 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    archive: '<rect x="2" y="3.5" width="20" height="5" rx="1.5"/><path d="M4 8.5v10A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-10"/><path d="M10 13h4"/>',
    transfers: '<path d="M3 8.5l4-4 4 4"/><path d="M7 4.5v9"/><path d="M21 15.5l-4 4-4-4"/><path d="M17 19.5v-9"/>',
    received: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4.2A1.2 1.2 0 0 1 9.2 3h5.6A1.2 1.2 0 0 1 16 4.2V6"/><path d="M19 6l-.9 13.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    close: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16.2 16.2"/>',
    share: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'
  };

  /**
   * Render an inline SVG icon.
   * @param {string} name Icon key from ICON_SHAPES.
   * @param {number} [size] Pixel size.
   * @param {number} [strokeWidth] Stroke weight.
   * @returns {string} SVG markup.
   */
  function icon(name, size = 18, strokeWidth = 2) {
    const shapes = ICON_SHAPES[name] || ICON_SHAPES.file;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
  }

  // Tab Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      navItems.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`tab-${target}`);
      if (pane) pane.classList.add('active');

      if (target === 'received') loadReceivedFiles();
      if (target === 'transfers') loadTransfers();
      if (target === 'remotefiles') renderRemotePeerChips();
    });
  });

  // Theme Switching
  const themeCards = document.querySelectorAll('.theme-card');
  themeCards.forEach((card) => {
    if (card.dataset.themeId === currentTheme) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }

    card.addEventListener('click', () => {
      const themeId = card.dataset.themeId;
      currentTheme = themeId;
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('localshare_desktop_theme', themeId);

      themeCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  // Load Self Device
  async function loadSelfInfo() {
    try {
      const res = await fetch('/api/self');
      const data = await res.json();
      document.getElementById('self-name').textContent = data.displayName || 'PC Device';
      document.getElementById('self-ip').textContent = `${data.address}:${data.port}`;
      document.getElementById('self-device-name').textContent = data.displayName || 'Windows PC';
      document.getElementById('self-device-details').textContent = `${data.address}:${data.port} • LocalSend: 53317`;

      document.getElementById('info-hostname').textContent = data.displayName;
      document.getElementById('info-ip').textContent = data.address;
      document.getElementById('info-folder').textContent = data.storageDir || 'Downloads/LocalShare';

      const subnetEl = document.getElementById('telem-subnet');
      if (subnetEl) subnetEl.textContent = subnetOf(data.address);

      const lanIpEl = document.getElementById('telemetry-lan-ip');
      if (lanIpEl) lanIpEl.textContent = data.address || '--';
      const portsEl = document.getElementById('telemetry-ports');
      if (portsEl) portsEl.textContent = `${data.port || 53318} / 53317`;

      // Quick Pair PIN and SVG QR Code
      const pinDisplay = document.getElementById('pairing-code-display');
      if (pinDisplay && data.pairingCode) {
        pinDisplay.textContent = data.pairingCode;
      }
      const qrBox = document.getElementById('qr-code-box');
      if (qrBox && data.qrSvg) {
        qrBox.innerHTML = data.qrSvg;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load self device info:', err);
    }
  }

  // Load Peers
  async function loadPeers() {
    try {
      const res = await fetch('/api/peers');
      peers = await res.json();
      renderPeers();
      renderRadar();
      renderRecipientChips();
      renderRemotePeerChips();
      document.getElementById('devices-badge').textContent = peers.length;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load peers:', err);
    }
  }

  function getPlatformIcon(platform) {
    switch (platform) {
      case 'android': return icon('android', 20, 1.9);
      case 'ios': return icon('ios', 20, 1.9);
      case 'desktop': return icon('desktop', 20, 1.9);
      case 'localsend': return icon('localsend', 20, 1.9);
      default: return icon('devices', 20, 1.9);
    }
  }

  /**
   * Pick a vector icon for a remote filesystem entry.
   * @param {{isDirectory?: boolean, mimeType?: string, name?: string}} entry
   * @returns {string} Icon key.
   */
  function remoteEntryIcon(entry) {
    if (entry.isDirectory) return 'folder';
    const mime = entry.mimeType || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'document';
    if (mime.includes('zip') || mime.includes('compressed')) return 'archive';
    if (mime.startsWith('text/') || mime === 'application/json') return 'document';
    return 'file';
  }

  function renderPeers() {
    const list = document.getElementById('devices-list');
    if (peers.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <span class="empty-icon" style="display: block; margin-bottom: 8px;">${icon('radar', 36, 1.7)}</span>
          <h3>Looking for nearby devices...</h3>
          <p style="color: var(--text-secondary); margin-top: 4px;">Make sure your phones or other computers have LocalShare or LocalSend open on this Wi-Fi.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = peers.map((p) => `
      <div class="device-card" data-device-id="${p.deviceId}">
        <div class="device-avatar">${getPlatformIcon(p.platform)}</div>
        <div class="device-info">
          <h4>${escapeHtml(p.displayName)}</h4>
          <p>${escapeHtml(p.address)}:${p.port} • ${p.platform}</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-connect-to" data-device-id="${p.deviceId}">
            <span>Connect</span>
          </button>
          <button class="btn btn-primary btn-send-to" data-device-id="${p.deviceId}">
            <span>Send</span>${icon('arrow-right', 13, 2.3)}
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-connect-to').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.dataset.deviceId;
        const peer = peers.find((p) => p.deviceId === devId);
        if (peer) {
          connectToPeerLive(peer);
        }
      });
    });

    list.querySelectorAll('.btn-send-to').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const devId = btn.dataset.deviceId;
        const peer = peers.find((p) => p.deviceId === devId);
        if (peer) {
          selectPeer(peer);
          document.querySelector('[data-tab="share"]').click();
        }
      });
    });
  }

  /**
   * Derive the /24 network label from an IPv4 address.
   * @param {string} address
   * @returns {string} e.g. "192.168.1.0/24"
   */
  function subnetOf(address) {
    const parts = String(address || '').split('.');
    if (parts.length !== 4) return '--';
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  /**
   * Draw the 24 rim tick marks around the radar once, at startup.
   */
  function buildRadarTicks() {
    const container = document.getElementById('radar-ticks');
    if (!container || container.childElementCount > 0) return;
    const ticks = [];
    for (let i = 0; i < 24; i += 1) {
      const major = i % 6 === 0;
      ticks.push(
        `<div class="radar-tick-anchor" style="transform: rotate(${i * 15}deg);">
           <span class="radar-tick${major ? ' major' : ''}" style="height:${major ? 9 : 4}px; margin-top:2px;"></span>
         </div>`
      );
    }
    container.innerHTML = ticks.join('');
  }

  function renderRadar() {
    const container = document.getElementById('radar-blips-container');
    if (!container) return;

    container.innerHTML = peers.map((p, idx) => {
      const angle = (idx / Math.max(1, peers.length)) * 2 * Math.PI - Math.PI / 2;
      const radius = 130;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return `
        <div class="radar-blip" data-device-id="${p.deviceId}" style="position: absolute; transform: translate(${x}px, ${y}px); display: flex; flex-direction: column; align-items: center; cursor: pointer;" title="${escapeHtml(p.displayName)}">
          <div class="radar-blip-node">${getPlatformIcon(p.platform)}</div>
          <span class="radar-blip-label">
            ${escapeHtml(p.displayName)}
          </span>
          <span class="radar-blip-ip">${escapeHtml(p.address)}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.radar-blip').forEach((blip) => {
      blip.addEventListener('click', () => {
        const peer = peers.find((p) => p.deviceId === blip.dataset.deviceId);
        if (peer) {
          selectPeer(peer);
          document.querySelector('[data-tab="share"]').click();
        }
      });
    });

    const peersEl = document.getElementById('telem-peers');
    if (peersEl) peersEl.textContent = String(peers.length);

    const peerCountEl = document.getElementById('telemetry-peer-count');
    if (peerCountEl) peerCountEl.textContent = String(peers.length);
  }

  function selectPeer(peer) {
    selectedPeer = peer;
    const box = document.getElementById('selected-peer-box');
    box.className = 'selected-peer-active';
    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="font-size: 16px;">${getPlatformIcon(peer.platform)} ${escapeHtml(peer.displayName)}</strong>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">${peer.address}:${peer.port}</p>
        </div>
        <button id="btn-change-peer" class="btn btn-secondary">Change</button>
      </div>
    `;

    document.getElementById('btn-change-peer').addEventListener('click', () => {
      selectedPeer = null;
      renderRecipientChips();
      updateSendButtonState();
    });

    updateSendButtonState();
  }

  function renderRecipientChips() {
    if (selectedPeer) return;
    const container = document.getElementById('recipient-chips');
    if (!container) return;

    if (peers.length === 0) {
      container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">No peers detected. Click "Scan Network" on the Devices tab.</p>`;
      return;
    }

    container.innerHTML = peers.map((p) => `
      <button class="chip chip-primary recipient-chip" data-device-id="${p.deviceId}" style="cursor: pointer; margin-right: 6px; margin-bottom: 6px;">
        ${getPlatformIcon(p.platform)} ${escapeHtml(p.displayName)}
      </button>
    `).join('');

    container.querySelectorAll('.recipient-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const peer = peers.find((p) => p.deviceId === btn.dataset.deviceId);
        if (peer) selectPeer(peer);
      });
    });
  }

  // File Staging & Drag-and-Drop
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowse = document.getElementById('btn-browse-files');

  if (btnBrowse) {
    btnBrowse.addEventListener('click', async () => {
      if (window.electronAPI && typeof window.electronAPI.selectFiles === 'function') {
        const files = await window.electronAPI.selectFiles();
        if (files && files.length > 0) {
          addFilesToStaging(files);
        }
      } else {
        fileInput.click();
      }
    });
  }

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).map((f) => ({
      name: f.name,
      path: f.path || '',
      size: f.size || 0,
      type: f.type || 'application/octet-stream',
      fileObj: f
    }));
    addFilesToStaging(files);
  });

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files).map((f) => ({
      name: f.name,
      path: f.path || '',
      size: f.size || 0,
      type: f.type || 'application/octet-stream',
      fileObj: f
    }));
    addFilesToStaging(files);
    fileInput.value = '';
  });

  function addFilesToStaging(files) {
    files.forEach((f) => {
      stagedFiles.push({
        name: f.name,
        path: f.path || '',
        size: f.size || 0,
        type: f.type || 'application/octet-stream',
        fileObj: f.fileObj || f
      });
    });
    renderStagedFiles();
    updateSendButtonState();
  }

  function renderStagedFiles() {
    const list = document.getElementById('staged-list');
    const countEl = document.getElementById('staged-count');
    const sizeEl = document.getElementById('staged-size');

    countEl.textContent = stagedFiles.length;
    const totalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);
    sizeEl.textContent = formatBytes(totalBytes);

    if (stagedFiles.length === 0) {
      list.innerHTML = `<li class="empty-list-notice" style="color: var(--text-muted); padding: 12px 0;">No files staged yet.</li>`;
      return;
    }

    list.innerHTML = stagedFiles.map((f, idx) => `
      <li class="staged-file-item">
        <div>
          <strong>${escapeHtml(f.name)}</strong>
          <span style="color: var(--text-secondary); margin-left: 8px;">${formatBytes(f.size)}</span>
        </div>
        <button class="btn-remove" data-index="${idx}" aria-label="Remove ${escapeHtml(f.name)}">${icon('close', 12, 2.8)}</button>
      </li>
    `).join('');

    list.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        stagedFiles.splice(idx, 1);
        renderStagedFiles();
        updateSendButtonState();
      });
    });
  }

  function updateSendButtonState() {
    const btn = document.getElementById('btn-send-files');
    if (selectedPeer && stagedFiles.length > 0) {
      btn.disabled = false;
      btn.innerHTML = `${icon('share', 15, 2.2)}<span>Send ${stagedFiles.length} File${stagedFiles.length === 1 ? '' : 's'} to ${escapeHtml(selectedPeer.displayName)}</span>`;
    } else if (!selectedPeer) {
      btn.disabled = true;
      btn.innerHTML = '<span>Select a recipient above</span>';
    } else {
      btn.disabled = true;
      btn.innerHTML = '<span>Add files to send</span>';
    }
  }

  // Send Files Action
  document.getElementById('btn-send-files').addEventListener('click', async () => {
    if (!selectedPeer || stagedFiles.length === 0) return;
    const btn = document.getElementById('btn-send-files');
    btn.disabled = true;
    btn.innerHTML = '<span>Initiating Transfer...</span>';

    try {
      const payload = {
        peer: selectedPeer,
        files: stagedFiles.map((f) => ({
          name: f.name,
          path: f.path || '',
          size: f.size || 0,
          type: f.type || 'application/octet-stream'
        }))
      };

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status === 'started') {
        stagedFiles = [];
        renderStagedFiles();
        updateSendButtonState();

        // Switch to Transfers tab to show live progress
        navItems.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => p.classList.remove('active'));
        const transfersTab = document.querySelector('[data-tab="transfers"]');
        const transfersPane = document.getElementById('tab-transfers');
        if (transfersTab) transfersTab.classList.add('active');
        if (transfersPane) transfersPane.classList.add('active');
        loadTransfers();
      } else {
        alert(`Failed to start transfer: ${data.error || 'Unknown error'}`);
        updateSendButtonState();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Transfer initiation failed:', err);
      alert(`Transfer failed: ${err.message}`);
      updateSendButtonState();
    }
  });

  // Load Received Files
  async function loadReceivedFiles() {
    try {
      const res = await fetch('/api/received');
      const files = await res.json();
      const grid = document.getElementById('received-list');

      if (files.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
            <span class="empty-icon" style="display: block; margin-bottom: 8px;">${icon('folder', 36, 1.7)}</span>
            <h3>No Received Files Yet</h3>
            <p style="color: var(--text-secondary); margin-top: 4px;">Files sent from nearby phones or PCs will automatically appear here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = files.map((f) => `
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="file-icon-badge">${icon('file', 20, 1.9)}</span>
            <div>
              <h4 style="font-size: 15px;">${escapeHtml(f.name)}</h4>
              <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                ${formatBytes(f.size)} • ${new Date(f.receivedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button class="btn btn-secondary btn-open-file" data-path="${escapeHtml(f.path)}">Open File</button>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-open-file').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const filePath = btn.dataset.path;
          if (window.electronAPI && typeof window.electronAPI.showInFolder === 'function') {
            await window.electronAPI.showInFolder(filePath);
          } else {
            await fetch('/api/open-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath })
            });
          }
        });
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load received files:', err);
    }
  }

  // Load Transfers
  async function loadTransfers() {
    try {
      const res = await fetch('/api/transfers');
      const transfers = await res.json();
      const list = document.getElementById('transfers-list');
      document.getElementById('transfers-badge').textContent = transfers.length;

      if (transfers.length === 0) {
        list.innerHTML = `
          <div class="empty-state" style="padding: 40px; text-align: center;">
            <span class="empty-icon" style="display: block; margin-bottom: 8px;">${icon('transfers', 36, 1.7)}</span>
            <h3>No Active Transfers</h3>
            <p style="color: var(--text-secondary); margin-top: 4px;">Active streaming sessions will show progress, speed, and SHA-256 verification here.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = transfers.map((t) => `
        <div class="transfer-card">
          <div class="transfer-header">
            <div>
              <span class="transfer-title">${escapeHtml(t.files ? t.files.join(', ') : 'File')}</span>
              <div class="transfer-peer">Peer: ${escapeHtml(t.peer)} • Status: <strong style="color: ${t.status === 'completed' ? 'var(--success)' : t.status === 'failed' ? 'var(--danger)' : 'var(--primary)'}">${escapeHtml(t.status)}</strong></div>
            </div>
            <span class="chip ${t.status === 'completed' ? 'chip-success' : t.status === 'failed' ? 'chip-danger' : 'chip-primary'}">${t.progress}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${t.status}" style="width: ${t.progress}%;"></div>
          </div>
          <div class="transfer-footer">
            <span>${formatBytes(t.bytesTransferred)} of ${formatBytes(t.totalBytes)}</span>
            <span>${new Date(t.startTime).toLocaleTimeString()}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load transfers:', err);
    }
  }

  // Explorer Open Actions
  document.getElementById('btn-open-folder').addEventListener('click', () => {
    fetch('/api/open-folder', { method: 'POST' });
  });

  document.getElementById('btn-open-received-folder').addEventListener('click', () => {
    fetch('/api/open-folder', { method: 'POST' });
  });

  // Manual IP Modal
  const modal = document.getElementById('modal-manual');
  document.getElementById('btn-manual').addEventListener('click', () => {
    modal.classList.add('active');
  });
  document.getElementById('btn-cancel-manual').addEventListener('click', () => {
    modal.classList.remove('active');
  });
  document.getElementById('btn-confirm-manual').addEventListener('click', async () => {
    const ip = document.getElementById('manual-ip-input').value.trim();
    const port = document.getElementById('manual-port-input').value.trim();
    const name = document.getElementById('manual-name-input').value.trim();
    if (ip) {
      await fetch('/api/manual-peer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port, name })
      });
      modal.classList.remove('active');
      buildRadarTicks();
  loadPeers();
    }
  });

  // Scan Network Button
  document.getElementById('btn-scan').addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan');
    btn.disabled = true;
    btn.innerHTML = `<span>Scanning...</span>`;
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `${icon('radar', 15, 2.2)}<span>Scan Network</span>`;
      loadPeers();
    }, 2000);
  });

  // Telemetry pill: kick a discovery sweep and refresh the counters.
  document.getElementById('btn-telemetry-scan').addEventListener('click', async () => {
    const btn = document.getElementById('btn-telemetry-scan');
    btn.disabled = true;
    try {
      await fetch('/api/scan', { method: 'POST' });
      await loadPeers();
    } finally {
      btn.disabled = false;
    }
  });

  // Telemetry pill: copy this PC's clipboard to the local clipboard endpoint so
  // the value is available to paired phones.
  document.getElementById('btn-telemetry-clipboard').addEventListener('click', async () => {
    const label = document.getElementById('btn-telemetry-clipboard-label');
    const original = label.textContent;
    try {
      const res = await fetch('/api/clipboard');
      const data = await res.json();
      const chars = typeof data.text === 'string' ? data.text.length : 0;
      label.textContent = chars > 0 ? `Copied ${chars} chars` : 'Clipboard empty';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed reading local clipboard:', err);
      label.textContent = 'Clipboard failed';
    }
    setTimeout(() => {
      label.textContent = original;
    }, 2000);
  });

  // Incoming Transfer Approval
  const incomingModal = document.getElementById('modal-incoming');
  let activeRequestId = null;

  function showIncomingRequest(req) {
    activeRequestId = req.requestId;
    document.getElementById('incoming-summary').textContent =
      `${req.senderName || 'Nearby Device'} wants to send you ${req.fileCount || 0} file(s) (${formatBytes(req.totalBytes || 0)}).`;

    const list = document.getElementById('incoming-file-list');
    list.innerHTML = (req.files || [])
      .map((f) => `<li>${escapeHtml(f.fileName)} <span class="chip">${formatBytes(f.fileSize)}</span></li>`)
      .join('');

    incomingModal.classList.add('active');
  }

  function hideIncomingRequest() {
    activeRequestId = null;
    incomingModal.classList.remove('active');
  }

  async function respondToIncoming(accepted) {
    if (!activeRequestId) return;
    const requestId = activeRequestId;
    hideIncomingRequest();
    await fetch('/api/respond-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, accepted })
    });
  }

  document.getElementById('btn-accept-incoming').addEventListener('click', () => respondToIncoming(true));
  document.getElementById('btn-reject-incoming').addEventListener('click', () => respondToIncoming(false));

  // Server-Sent Events (SSE) for Real-Time Updates
  function initSSE() {
    const sse = new EventSource('/events');
    sse.addEventListener('peer_found', () => loadPeers());
    sse.addEventListener('scan_state', () => loadPeers());
    sse.addEventListener('transfer_update', () => loadTransfers());
    sse.addEventListener('received_updated', () => {
      loadReceivedFiles();
      loadTransfers();
    });
    sse.addEventListener('live_connected', () => updateLiveStatus());
    sse.addEventListener('live_disconnected', () => updateLiveStatus());
    sse.addEventListener('clipboard_sync', () => {
      // Subtle pulse on telemetry clipboard icon
      const btn = document.getElementById('btn-telemetry-clipboard');
      if (btn) {
        btn.classList.add('telemetry-pill-accent');
        setTimeout(() => btn.classList.remove('telemetry-pill-accent'), 800);
      }
    });
    sse.addEventListener('incoming_request', (e) => {
      try {
        showIncomingRequest(JSON.parse(e.data));
      } catch (err) {
        console.error('Failed to parse incoming request:', err);
      }
    });
    sse.addEventListener('incoming_request_closed', () => hideIncomingRequest());
  }

  // Live Link Session Management
  async function connectToPeerLive(peer) {
    try {
      const res = await fetch('/api/live/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer })
      });
      if (res.ok) {
        await updateLiveStatus();
      }
    } catch (err) {
      console.error('Live connect failed', err);
    }
  }

  async function disconnectPeerLive() {
    try {
      await fetch('/api/live/disconnect', { method: 'POST' });
      await updateLiveStatus();
    } catch (err) {
      console.error('Live disconnect failed', err);
    }
  }

  async function toggleLiveClipboard() {
    try {
      await fetch('/api/live/toggle-clipboard', { method: 'POST' });
      await updateLiveStatus();
    } catch (err) {
      console.error('Toggle clipboard failed', err);
    }
  }

  let connectedLivePeer = null;
  let activeHeroCategory = 'photos';
  let heroRemotePath = '';
  let isDrawerOpen = true;

  async function updateLiveStatus() {
    try {
      const res = await fetch('/api/live/status');
      const data = await res.json();
      const banner = document.getElementById('live-connection-banner');
      const stateUnconnected = document.getElementById('state-unconnected');
      const stateConnected = document.getElementById('state-connected');

      if (data.connected && data.peer) {
        connectedLivePeer = data.peer;
        remotePeer = data.peer; // Bind remote files explorer

        if (banner) {
          banner.style.display = 'flex';
          const bannerPeer = document.getElementById('live-banner-peer');
          if (bannerPeer) bannerPeer.textContent = `${data.peer.displayName || data.peer.address}`;
          const clipToggle = document.getElementById('live-banner-clip-btn');
          if (clipToggle) {
            clipToggle.textContent = data.clipboardSync ? 'Clipboard Sync: ON' : 'Clipboard Sync: OFF';
            clipToggle.classList.toggle('active', data.clipboardSync);
          }
        }

        // Switch to State B: Connected Workspace
        if (stateUnconnected) stateUnconnected.style.display = 'none';
        if (stateConnected) stateConnected.style.display = 'block';

        const heroName = document.getElementById('hero-device-name');
        if (heroName) heroName.textContent = connectedLivePeer.displayName || 'Phone Device';
        const heroSub = document.getElementById('hero-device-sub');
        if (heroSub) heroSub.textContent = `${connectedLivePeer.address}:${connectedLivePeer.port || 53318}`;
        const heroTarget = document.getElementById('hero-target-name');
        if (heroTarget) heroTarget.textContent = connectedLivePeer.displayName || 'Phone';
        const overlayTarget = document.getElementById('overlay-target-name');
        if (overlayTarget) overlayTarget.textContent = connectedLivePeer.displayName || 'Phone';

        const btnHeroClipText = document.getElementById('btn-hero-clip-text');
        if (btnHeroClipText) {
          btnHeroClipText.textContent = data.clipboardSync ? 'Clipboard Synced ✓' : 'Clipboard Paused';
        }

        fetchTelemetry(connectedLivePeer);
        loadHeroCategory(activeHeroCategory);
        loadClipboardHistory();
      } else {
        connectedLivePeer = null;
        if (banner) banner.style.display = 'none';
        if (stateUnconnected) stateUnconnected.style.display = 'block';
        if (stateConnected) stateConnected.style.display = 'none';
      }
    } catch (_) {}
  }

  async function fetchTelemetry(peer) {
    if (!peer) return;
    try {
      const res = await fetch(`/api/remote-telemetry?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.battery) {
        const bText = document.getElementById('hero-battery-text');
        if (bText) {
          bText.textContent = `${data.battery.level}%${data.battery.isCharging ? ' ⚡' : ''}`;
        }
      }
      if (data.storage) {
        const sText = document.getElementById('hero-storage-text');
        if (sText) {
          sText.textContent = `${formatBytes(data.storage.free)} Free`;
        }
      }
    } catch (_) {}
  }

  async function loadHeroCategory(cat) {
    activeHeroCategory = cat;
    if (!connectedLivePeer) return;

    // Update active tab buttons
    document.querySelectorAll('.cat-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.cat === cat);
    });

    const grid = document.getElementById('hero-thumbnail-grid');
    const filesList = document.getElementById('hero-files-list');
    const pathBar = document.getElementById('hero-path-bar');

    if (cat === 'photos' || cat === 'videos') {
      if (grid) grid.style.display = 'grid';
      if (filesList) filesList.style.display = 'none';
      if (pathBar) pathBar.style.display = 'none';

      if (grid) grid.innerHTML = '<p style="grid-column: 1 / -1; padding: 24px; color: var(--text-secondary); text-align: center;">Loading media...</p>';

      try {
        const res = await fetch(`/api/remote-categories?ip=${encodeURIComponent(connectedLivePeer.address)}&port=${connectedLivePeer.port || 53318}&type=${cat}&limit=60`);
        const data = await res.json();
        const items = data.items || [];
        if (items.length === 0) {
          if (grid) grid.innerHTML = `<p style="grid-column: 1 / -1; padding: 24px; color: var(--text-secondary); text-align: center;">No ${cat} found on phone.</p>`;
          return;
        }

        if (grid) {
          grid.innerHTML = items.map((item) => {
            const thumbUrl = `/api/remote-fs/thumbnail?ip=${encodeURIComponent(connectedLivePeer.address)}&port=${connectedLivePeer.port || 53318}&path=${encodeURIComponent(item.path)}`;
            return `
              <div class="thumb-card" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-size="${item.size}">
                <img src="${thumbUrl}" alt="${escapeHtml(item.name)}" loading="lazy">
                <span class="thumb-size-pill">${formatBytes(item.size)}</span>
                <div class="thumb-actions">
                  <button class="thumb-action-btn thumb-dl" title="Download to PC" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-size="${item.size}">${icon('download', 14, 2)}</button>
                  <button class="thumb-action-btn thumb-del" title="Delete from Phone" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}">${icon('trash', 14, 2)}</button>
                </div>
              </div>
            `;
          }).join('');

          grid.querySelectorAll('.thumb-card').forEach((card) => {
            card.addEventListener('click', (e) => {
              if (e.target.closest('.thumb-actions')) return;
              openLightbox({ path: card.dataset.path, name: card.dataset.name, size: Number(card.dataset.size) }, connectedLivePeer);
            });
          });

          grid.querySelectorAll('.thumb-dl').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              pullRemoteFile(btn.dataset.path, btn.dataset.name, btn.dataset.size);
            });
          });

          grid.querySelectorAll('.thumb-del').forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${btn.dataset.name}" from phone?`)) {
                remoteFsAction('/api/remote-fs/delete', { path: btn.dataset.path }).then(() => {
                  loadHeroCategory(activeHeroCategory);
                });
              }
            });
          });
        }
      } catch (err) {
        if (grid) grid.innerHTML = `<p style="grid-column: 1 / -1; padding: 24px; color: var(--danger); text-align: center;">Failed to load: ${escapeHtml(err.message)}</p>`;
      }
    } else if (cat === 'documents' || cat === 'downloads') {
      if (grid) grid.style.display = 'none';
      if (filesList) filesList.style.display = 'block';
      if (pathBar) pathBar.style.display = 'none';

      if (filesList) filesList.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">Loading files...</p>';

      try {
        const res = await fetch(`/api/remote-categories?ip=${encodeURIComponent(connectedLivePeer.address)}&port=${connectedLivePeer.port || 53318}&type=${cat}&limit=60`);
        const data = await res.json();
        const items = data.items || [];
        renderHeroFileList(items);
      } catch (err) {
        if (filesList) filesList.innerHTML = `<p style="padding: 20px; color: var(--danger); text-align: center;">Failed to load: ${escapeHtml(err.message)}</p>`;
      }
    } else if (cat === 'all') {
      if (grid) grid.style.display = 'none';
      if (filesList) filesList.style.display = 'block';
      if (pathBar) pathBar.style.display = 'flex';
      loadHeroRemoteDir(heroRemotePath || '');
    }
  }

  async function loadHeroRemoteDir(path) {
    if (!connectedLivePeer) return;
    const filesList = document.getElementById('hero-files-list');
    const pathText = document.getElementById('hero-path-text');
    if (filesList) filesList.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">Loading directory...</p>';

    try {
      const res = await fetch(`/api/remote-fs/list?ip=${encodeURIComponent(connectedLivePeer.address)}&port=${connectedLivePeer.port || 53318}&path=${encodeURIComponent(path || '')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list directory');
      heroRemotePath = data.currentPath || '';
      if (pathText) pathText.textContent = heroRemotePath || '/';
      renderHeroFileList(data.entries || []);
    } catch (err) {
      if (filesList) filesList.innerHTML = `<p style="padding: 20px; color: var(--danger); text-align: center;">Failed: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderHeroFileList(entries) {
    const list = document.getElementById('hero-files-list');
    if (!list) return;
    if (entries.length === 0) {
      list.innerHTML = '<p style="padding: 24px; color: var(--text-secondary); text-align: center;">No files found.</p>';
      return;
    }

    list.innerHTML = entries.map((e) => `
      <div class="device-card" style="margin-bottom: 8px;">
        <div class="device-avatar">${icon(remoteEntryIcon(e), 19, 1.9)}</div>
        <div class="device-info" style="cursor: ${e.isDirectory ? 'pointer' : 'default'};" ${e.isDirectory ? `data-open-hero-path="${escapeHtml(e.path)}"` : ''}>
          <h4>${escapeHtml(e.name)}</h4>
          <p>${e.isDirectory ? 'Folder' : formatBytes(e.size)}</p>
        </div>
        <div style="display: flex; gap: 6px;">
          ${e.isDirectory ? '' : `<button class="btn btn-secondary hero-pull-file" data-path="${escapeHtml(e.path)}" data-name="${escapeHtml(e.name)}" data-size="${e.size}">${icon('download', 14, 2)}</button>`}
          <button class="btn btn-secondary hero-delete-file" data-path="${escapeHtml(e.path)}" data-name="${escapeHtml(e.name)}">${icon('trash', 14, 2)}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-open-hero-path]').forEach((el) => {
      el.addEventListener('click', () => loadHeroRemoteDir(el.dataset.openHeroPath));
    });
    list.querySelectorAll('.hero-pull-file').forEach((btn) => {
      btn.addEventListener('click', () => pullRemoteFile(btn.dataset.path, btn.dataset.name, btn.dataset.size));
    });
    list.querySelectorAll('.hero-delete-file').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.confirm(`Delete "${btn.dataset.name}" from phone?`)) {
          remoteFsAction('/api/remote-fs/delete', { path: btn.dataset.path }).then(() => {
            if (activeHeroCategory === 'all') loadHeroRemoteDir(heroRemotePath);
            else loadHeroCategory(activeHeroCategory);
          });
        }
      });
    });
  }

  async function performHeroSearch(query) {
    if (!connectedLivePeer) return;
    if (!query.trim()) {
      loadHeroCategory(activeHeroCategory);
      return;
    }

    const grid = document.getElementById('hero-thumbnail-grid');
    const filesList = document.getElementById('hero-files-list');
    const pathBar = document.getElementById('hero-path-bar');
    const clearBtn = document.getElementById('btn-clear-search');

    if (grid) grid.style.display = 'none';
    if (filesList) filesList.style.display = 'block';
    if (pathBar) pathBar.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-block';

    if (filesList) filesList.innerHTML = '<p style="padding: 20px; color: var(--text-secondary); text-align: center;">Searching files...</p>';

    try {
      const res = await fetch(`/api/remote-search?ip=${encodeURIComponent(connectedLivePeer.address)}&port=${connectedLivePeer.port || 53318}&q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      renderHeroFileList(data.entries || []);
    } catch (err) {
      if (filesList) filesList.innerHTML = `<p style="padding: 20px; color: var(--danger); text-align: center;">Search failed: ${escapeHtml(err.message)}</p>`;
    }
  }

  // Full-Screen Media Lightbox
  let currentLightboxItem = null;
  function openLightbox(item, peer) {
    currentLightboxItem = item;
    const modal = document.getElementById('modal-lightbox');
    const titleEl = document.getElementById('lightbox-filename');
    const sizeEl = document.getElementById('lightbox-filesize');
    const bodyEl = document.getElementById('lightbox-media-container');

    if (titleEl) titleEl.textContent = item.name;
    if (sizeEl) sizeEl.textContent = formatBytes(item.size);

    const streamUrl = `http://${peer.address}:${peer.port || 53318}/v1/fs/stream?path=${encodeURIComponent(item.path)}`;

    if (item.name.match(/\.(mp4|mkv|mov|avi|webm)$/i)) {
      if (bodyEl) bodyEl.innerHTML = `<video src="${streamUrl}" controls autoplay style="max-width: 100%; max-height: 60vh; border-radius: 8px;"></video>`;
    } else {
      if (bodyEl) bodyEl.innerHTML = `<img src="${streamUrl}" alt="${escapeHtml(item.name)}" style="max-width: 100%; max-height: 60vh; border-radius: 8px;">`;
    }

    if (modal) modal.style.display = 'flex';
  }

  function closeLightbox() {
    const modal = document.getElementById('modal-lightbox');
    if (modal) modal.style.display = 'none';
    const bodyEl = document.getElementById('lightbox-media-container');
    if (bodyEl) bodyEl.innerHTML = '';
    currentLightboxItem = null;
  }

  // Live Clipboard Drawer History
  async function loadClipboardHistory() {
    try {
      const res = await fetch('/api/clipboard-history');
      if (!res.ok) return;
      const history = await res.json();
      const countEl = document.getElementById('clipboard-history-count');
      if (countEl) countEl.textContent = `${history.length} items`;

      const listEl = document.getElementById('drawer-clip-list');
      if (!listEl) return;

      if (!history || history.length === 0) {
        listEl.innerHTML = '<p style="padding: 12px; font-size: 12px; color: var(--text-muted);">No clipboard history recorded yet.</p>';
        return;
      }

      listEl.innerHTML = history.map((item) => `
        <div class="clip-row-item">
          <span class="clip-row-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
          <div class="clip-row-meta">
            <span class="chip chip-primary" style="font-size: 10px;">${escapeHtml(item.sender || 'LocalShare')}</span>
            <button class="btn btn-secondary btn-sm btn-drawer-copy" data-clip="${escapeHtml(item.text)}">Copy to PC</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-drawer-copy').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.clip).then(() => {
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = orig; }, 1500);
          });
        });
      });
    } catch (_) {}
  }

  // Full-Window Quick-Drop Zone Sender
  async function sendFilesDirectlyToPeer(peer, files) {
    if (!peer || !files || files.length === 0) return;
    const filePayloads = Array.from(files).map((f) => ({
      path: f.path || f.name,
      name: f.name,
      size: f.size
    }));

    try {
      const res = await fetch('/api/transfer/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, files: filePayloads })
      });
      if (res.ok) {
        document.querySelector('[data-tab="transfers"]').click();
      }
    } catch (err) {
      console.error('Send dropped files failed:', err);
    }
  }

  // Global Event Listeners & UI Binding
  window.addEventListener('DOMContentLoaded', () => {
    // Copy 6-digit PIN
    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        const pin = document.getElementById('pairing-code-display').textContent;
        navigator.clipboard.writeText(pin).then(() => {
          btnCopyCode.textContent = 'Copied!';
          setTimeout(() => { btnCopyCode.textContent = 'Copy'; }, 2000);
        });
      });
    }

    // Hero Hero Disconnect & Clip
    const heroDisc = document.getElementById('btn-hero-disconnect');
    if (heroDisc) heroDisc.addEventListener('click', () => disconnectPeerLive());
    const heroClip = document.getElementById('btn-hero-clip');
    if (heroClip) heroClip.addEventListener('click', () => toggleLiveClipboard());

    // Hero Browse & Send
    const heroBrowse = document.getElementById('btn-hero-browse');
    if (heroBrowse) {
      heroBrowse.addEventListener('click', async () => {
        if (!connectedLivePeer) return;
        if (window.electronAPI && typeof window.electronAPI.selectFiles === 'function') {
          const files = await window.electronAPI.selectFiles();
          if (files && files.length > 0) {
            sendFilesDirectlyToPeer(connectedLivePeer, files);
          }
        } else {
          fileInput.click();
        }
      });
    }

    // Category Buttons
    document.querySelectorAll('.cat-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        loadHeroCategory(tab.dataset.cat);
      });
    });

    // Search Box
    const searchInput = document.getElementById('hero-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performHeroSearch(searchInput.value);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearBtn.style.display = 'none';
        loadHeroCategory(activeHeroCategory);
      });
    }

    // Path bar controls for All Storage
    const btnPathUp = document.getElementById('btn-hero-path-up');
    if (btnPathUp) {
      btnPathUp.addEventListener('click', () => {
        if (!heroRemotePath) return;
        const parts = heroRemotePath.split(/[\\/]/).filter(Boolean);
        parts.pop();
        loadHeroRemoteDir(parts.join('/') || '/');
      });
    }
    const btnPathRefresh = document.getElementById('btn-hero-path-refresh');
    if (btnPathRefresh) {
      btnPathRefresh.addEventListener('click', () => loadHeroRemoteDir(heroRemotePath));
    }

    // Lightbox Modal Controls
    const btnCloseLightbox = document.getElementById('btn-lightbox-close');
    if (btnCloseLightbox) btnCloseLightbox.addEventListener('click', closeLightbox);
    const btnDlLightbox = document.getElementById('btn-lightbox-download');
    if (btnDlLightbox) {
      btnDlLightbox.addEventListener('click', () => {
        if (currentLightboxItem && connectedLivePeer) {
          pullRemoteFile(currentLightboxItem.path, currentLightboxItem.name, currentLightboxItem.size);
        }
      });
    }
    const btnDelLightbox = document.getElementById('btn-lightbox-delete');
    if (btnDelLightbox) {
      btnDelLightbox.addEventListener('click', () => {
        if (currentLightboxItem && connectedLivePeer) {
          if (window.confirm(`Delete "${currentLightboxItem.name}" from phone?`)) {
            remoteFsAction('/api/remote-fs/delete', { path: currentLightboxItem.path }).then(() => {
              closeLightbox();
              loadHeroCategory(activeHeroCategory);
            });
          }
        }
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });

    // Clipboard Drawer Accordion
    const drawerToggle = document.getElementById('drawer-toggle');
    const drawerBody = document.getElementById('drawer-body');
    const drawerArrow = document.getElementById('drawer-arrow');
    if (drawerToggle && drawerBody) {
      drawerToggle.addEventListener('click', () => {
        isDrawerOpen = !isDrawerOpen;
        drawerBody.style.display = isDrawerOpen ? 'block' : 'none';
        if (drawerArrow) drawerArrow.style.transform = isDrawerOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    }

    // Full-Window Drag and Drop Zone
    let dragCounter = 0;
    const dropOverlay = document.getElementById('full-window-drop-overlay');
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter += 1;
      if (connectedLivePeer && dropOverlay) {
        dropOverlay.style.display = 'flex';
      }
    });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter -= 1;
      if (dragCounter <= 0 && dropOverlay) {
        dragCounter = 0;
        dropOverlay.style.display = 'none';
      }
    });
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (dropOverlay) dropOverlay.style.display = 'none';
      if (!connectedLivePeer) return;
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        sendFilesDirectlyToPeer(connectedLivePeer, files);
      }
    });
  });

  const liveClipBtn = document.getElementById('live-banner-clip-btn');
  if (liveClipBtn) {
    liveClipBtn.addEventListener('click', () => toggleLiveClipboard());
  }

  const liveDiscBtn = document.getElementById('live-banner-disconnect-btn');
  if (liveDiscBtn) {
    liveDiscBtn.addEventListener('click', () => disconnectPeerLive());
  }

  // ---- Remote File Explorer ----
  let remotePeer = null;
  let remotePath = '';

  function renderRemotePeerChips() {
    const container = document.getElementById('remote-peer-chips');
    if (!container) return;

    if (peers.length === 0) {
      container.innerHTML = `<p style="font-size: 13px; color: var(--text-muted);">No peers detected. Scan the network from the Devices tab.</p>`;
      return;
    }

    container.innerHTML = peers.map((p) => `
      <button class="chip ${remotePeer && remotePeer.deviceId === p.deviceId ? 'chip-success' : 'chip-primary'} remote-peer-chip" data-device-id="${p.deviceId}" style="cursor: pointer; margin-right: 6px; margin-bottom: 6px;">
        ${getPlatformIcon(p.platform)} ${escapeHtml(p.displayName)}
      </button>
    `).join('');

    container.querySelectorAll('.remote-peer-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        remotePeer = peers.find((p) => p.deviceId === btn.dataset.deviceId) || null;
        renderRemotePeerChips();
        if (remotePeer) loadRemoteDir('');
      });
    });
  }

  async function loadRemoteDir(path) {
    if (!remotePeer) return;
    const list = document.getElementById('remote-files-list');
    list.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">Loading…</p>';
    try {
      const res = await fetch(`/api/remote-fs/list?ip=${encodeURIComponent(remotePeer.address)}&port=${remotePeer.port}&path=${encodeURIComponent(path || '')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list');
      remotePath = data.currentPath || '';
      document.getElementById('remote-current-path').textContent = remotePath;
      renderRemoteEntries(data.entries || []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Remote listing failed:', err);
      list.innerHTML = `<p style="padding: 20px; color: var(--danger);">Failed to load: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderRemoteEntries(entries) {
    const list = document.getElementById('remote-files-list');
    if (entries.length === 0) {
      list.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">This folder is empty.</p>';
      return;
    }

    list.innerHTML = entries.map((e) => `
      <div class="device-card" style="margin-bottom: 8px;">
        <div class="device-avatar">${icon(remoteEntryIcon(e), 19, 1.9)}</div>
        <div class="device-info" style="cursor: ${e.isDirectory ? 'pointer' : 'default'};" ${e.isDirectory ? `data-open-path="${escapeHtml(e.path)}"` : ''}>
          <h4>${escapeHtml(e.name)}</h4>
          <p>${e.isDirectory ? 'Folder' : formatBytes(e.size)}</p>
        </div>
        <div style="display: flex; gap: 6px;">
          ${e.isDirectory ? '' : `<button class="btn btn-secondary remote-preview" data-path="${escapeHtml(e.path)}" data-mime="${escapeHtml(e.mimeType || '')}" aria-label="Preview ${escapeHtml(e.name)}">${icon('eye', 14, 2.1)}</button>`}
          ${e.isDirectory ? '' : `<button class="btn btn-secondary remote-pull" data-path="${escapeHtml(e.path)}" data-name="${escapeHtml(e.name)}" data-size="${e.size}" aria-label="Download ${escapeHtml(e.name)}">${icon('download', 14, 2.1)}</button>`}
          <button class="btn btn-secondary remote-copy" data-path="${escapeHtml(e.path)}" aria-label="Copy path of ${escapeHtml(e.name)}">${icon('copy', 14, 2.1)}</button>
          <button class="btn btn-secondary remote-delete" data-path="${escapeHtml(e.path)}" aria-label="Delete ${escapeHtml(e.name)}">${icon('trash', 14, 2.1)}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-open-path]').forEach((el) => {
      el.addEventListener('click', () => loadRemoteDir(el.dataset.openPath));
    });
    list.querySelectorAll('.remote-preview').forEach((btn) => {
      btn.addEventListener('click', () => previewRemoteFile(btn.dataset.path, btn.dataset.mime));
    });
    list.querySelectorAll('.remote-pull').forEach((btn) => {
      btn.addEventListener('click', () => pullRemoteFile(btn.dataset.path, btn.dataset.name, btn.dataset.size));
    });
    list.querySelectorAll('.remote-copy').forEach((btn) => {
      btn.addEventListener('click', () => remoteFsAction('/api/remote-fs/copy', { sourcePath: btn.dataset.path }));
    });
    list.querySelectorAll('.remote-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (window.confirm('Delete this item on the remote device?')) {
          remoteFsAction('/api/remote-fs/delete', { path: btn.dataset.path });
        }
      });
    });
  }

  async function remoteFsAction(endpoint, payload) {
    if (!remotePeer) return;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: remotePeer.address, port: remotePeer.port, ...payload })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Operation failed');
      }
      loadRemoteDir(remotePath);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Remote action failed:', err);
      alert(`Remote action failed: ${err.message}`);
    }
  }

  async function previewRemoteFile(path, mimeType) {
    if (!remotePeer) return;
    const modalEl = document.getElementById('modal-preview');
    const body = document.getElementById('preview-body');
    document.getElementById('preview-title').textContent = path.split(/[\\/]/).pop();
    body.innerHTML = '<p style="color: var(--text-secondary);">Loading…</p>';
    modalEl.classList.add('active');

    const streamUrl = `http://${remotePeer.address}:${remotePeer.port}/v1/fs/stream?path=${encodeURIComponent(path)}`;

    if (mimeType && mimeType.startsWith('image/')) {
      body.innerHTML = `<img src="${streamUrl}" style="max-width: 100%; max-height: 60vh; border-radius: 8px;">`;
    } else if (mimeType && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
      const tag = mimeType.startsWith('video/') ? 'video' : 'audio';
      body.innerHTML = `<${tag} src="${streamUrl}" controls style="max-width: 100%; max-height: 60vh;"></${tag}>`;
    } else {
      try {
        const textRes = await fetch(streamUrl);
        const text = await textRes.text();
        body.innerHTML = `<pre style="white-space: pre-wrap; font-size: 12px; max-height: 60vh; overflow: auto;">${escapeHtml(text.slice(0, 20000))}</pre>`;
      } catch (err) {
        body.innerHTML = `<p style="color: var(--danger);">Preview failed: ${escapeHtml(err.message)}</p>`;
      }
    }
  }

  async function pullRemoteFile(path, name, size) {
    if (!remotePeer) return;
    try {
      const res = await fetch('/api/remote-fs/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: remotePeer.address, port: remotePeer.port, path, name, size: Number(size) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      alert(`Saved to ${data.savedPath}`);
      loadTransfers();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Remote pull failed:', err);
      alert(`Pull failed: ${err.message}`);
    }
  }

  document.getElementById('btn-remote-refresh').addEventListener('click', () => loadRemoteDir(remotePath));
  document.getElementById('btn-remote-up').addEventListener('click', () => {
    if (!remotePath) return;
    const parts = remotePath.split(/[\\/]/).filter(Boolean);
    parts.pop();
    const parent = parts.join('/') || '/';
    loadRemoteDir(parent);
  });
  document.getElementById('btn-remote-clipboard-push').addEventListener('click', async () => {
    if (!remotePeer) { alert('Select a device first.'); return; }
    try {
      await fetch('/api/remote-clipboard/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: remotePeer.address, port: remotePeer.port })
      });
      alert('Clipboard pushed to the remote device.');
    } catch (err) {
      alert(`Clipboard push failed: ${err.message}`);
    }
  });
  document.getElementById('btn-remote-clipboard-pull').addEventListener('click', async () => {
    if (!remotePeer) { alert('Select a device first.'); return; }
    try {
      const res = await fetch('/api/remote-clipboard/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: remotePeer.address, port: remotePeer.port })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      alert(`Clipboard received: ${(data.text || '').slice(0, 120)}`);
    } catch (err) {
      alert(`Clipboard pull failed: ${err.message}`);
    }
  });
  document.getElementById('btn-close-preview').addEventListener('click', () => {
    document.getElementById('modal-preview').classList.remove('active');
  });

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialization
  loadSelfInfo();
  loadPeers();
  initSSE();
  updateLiveStatus();
})();
