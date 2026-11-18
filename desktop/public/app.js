// LocalShare PC Desktop Application Frontend
(function () {
  let peers = [];
  let stagedFiles = [];
  let selectedPeer = null;
  let currentTheme = localStorage.getItem('localshare_desktop_theme') || 'midnight';

  // Apply Initial Theme
  document.documentElement.setAttribute('data-theme', currentTheme);

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
      document.getElementById('devices-badge').textContent = peers.length;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load peers:', err);
    }
  }

  function getPlatformIcon(platform) {
    switch (platform) {
      case 'android': return '🤖';
      case 'ios': return '🍏';
      case 'desktop': return '💻';
      case 'localsend': return '⚡';
      default: return '📱';
    }
  }

  function renderPeers() {
    const list = document.getElementById('devices-list');
    if (peers.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <span style="font-size: 36px; display: block; margin-bottom: 8px;">📡</span>
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
        <button class="btn btn-secondary btn-send-to" data-device-id="${p.deviceId}">Send →</button>
      </div>
    `).join('');

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

  function renderRadar() {
    const container = document.getElementById('radar-blips-container');
    if (!container) return;

    container.innerHTML = peers.map((p, idx) => {
      const angle = (idx / Math.max(1, peers.length)) * 2 * Math.PI - Math.PI / 2;
      const radius = 130;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return `
        <div class="radar-blip" style="position: absolute; transform: translate(${x}px, ${y}px); display: flex; flex-direction: column; align-items: center; cursor: pointer;" title="${escapeHtml(p.displayName)}">
          <div style="width: 14px; height: 14px; border-radius: 50%; background: var(--primary); border: 2px solid #fff; box-shadow: 0 0 8px var(--primary);"></div>
          <span style="font-size: 10px; font-weight: 700; background: var(--bg-card-solid); border: 1px solid var(--border-highlight); padding: 2px 6px; border-radius: 6px; margin-top: 4px; white-space: nowrap;">
            ${escapeHtml(p.displayName)}
          </span>
        </div>
      `;
    }).join('');
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
        <button class="btn-remove" data-index="${idx}">✕</button>
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
      btn.textContent = `🚀 Send ${stagedFiles.length} File${stagedFiles.length === 1 ? '' : 's'} to ${selectedPeer.displayName}`;
    } else if (!selectedPeer) {
      btn.disabled = true;
      btn.textContent = 'Select a recipient above';
    } else {
      btn.disabled = true;
      btn.textContent = 'Add files to send';
    }
  }

  // Send Files Action
  document.getElementById('btn-send-files').addEventListener('click', async () => {
    if (!selectedPeer || stagedFiles.length === 0) return;
    const btn = document.getElementById('btn-send-files');
    btn.disabled = true;
    btn.textContent = 'Initiating Transfer...';

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
            <span style="font-size: 36px; display: block; margin-bottom: 8px;">📂</span>
            <h3>No Received Files Yet</h3>
            <p style="color: var(--text-secondary); margin-top: 4px;">Files sent from nearby phones or PCs will automatically appear here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = files.map((f) => `
        <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 26px;">📄</span>
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
            <span style="font-size: 36px; display: block; margin-bottom: 8px;">🔄</span>
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
      loadPeers();
    }
  });

  // Scan Network Button
  document.getElementById('btn-scan').addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan');
    btn.disabled = true;
    btn.textContent = 'Scanning...';
    await fetch('/api/scan', { method: 'POST' });
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '▶ Scan Network';
      loadPeers();
    }, 2000);
  });

  // Server-Sent Events (SSE) for Real-Time Updates
  function initSSE() {
    const sse = new EventSource('/events');
    sse.addEventListener('peer_found', () => loadPeers());
    sse.addEventListener('scan_state', () => loadPeers());
    sse.addEventListener('transfer_update', () => loadTransfers());
  }

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
})();
