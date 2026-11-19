// O+ Connect — LocalShare PC Desktop Application
(function () {
  let peers = [];
  let stagedFiles = [];
  let selectedPeer = null;
  let connectedLivePeer = null;
  let currentTheme = localStorage.getItem('localshare_desktop_theme') || 'daylight';
  let activeCategory = 'recent';
  let currentView = 'pair'; // 'files', 'clipboard', 'screencast', 'pair', 'transfers', 'radar', 'received', 'share', 'settings'
  let galleryItems = [];
  let selectedFilePaths = new Set();
  let currentLightboxItem = null;
  let heroRemotePath = '';

  // Apply Theme
  document.documentElement.setAttribute('data-theme', currentTheme);

  // SVG Shapes
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

  function icon(name, size = 18, strokeWidth = 2) {
    const shapes = ICON_SHAPES[name] || ICON_SHAPES.file;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
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

  function remoteEntryIcon(entry) {
    if (entry.isDirectory) return 'folder';
    const mime = entry.mimeType || '';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'document';
    if (mime.includes('zip') || mime.includes('compressed')) return 'archive';
    return 'file';
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

  function formatDateKey(timestamp) {
    if (!timestamp) return '2026/11/19';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '2026/11/19';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  function isApk(name) {
    return /\.apk$/i.test(name) || /\.xapk$/i.test(name);
  }

  function isVideo(name, mime) {
    return (mime && mime.startsWith('video/')) || /\.(mp4|mkv|webm|mov|avi|3gp)$/i.test(name);
  }

  function isImage(name, mime) {
    return (mime && mime.startsWith('image/')) || /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/i.test(name);
  }

  // ========================================================
  // VIEW NAVIGATION (O+ CONNECT 3-PANE)
  // ========================================================

  function switchView(viewName) {
    currentView = viewName;
    const catSidebar = document.getElementById('op-category-sidebar');

    // Only show secondary category sidebar in 'files' mode
    if (catSidebar) {
      catSidebar.style.display = viewName === 'files' ? 'flex' : 'none';
    }

    // Toggle active state on view panes
    document.querySelectorAll('.op-view-pane').forEach((pane) => {
      pane.classList.remove('active');
    });
    const activePane = document.getElementById(`view-${viewName}`);
    if (activePane) activePane.classList.add('active');

    // Update primary sidebar subnav buttons
    document.querySelectorAll('.op-subnav-item, .op-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    if (viewName === 'files') {
      loadCategory(activeCategory);
    } else if (viewName === 'transfers') {
      loadTransfers();
    } else if (viewName === 'received') {
      loadReceivedFiles();
    } else if (viewName === 'radar') {
      renderRadar();
    } else if (viewName === 'clipboard') {
      loadClipboardHistory();
    }
  }

  // Bind Sidebar Navigation Buttons
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(btn.dataset.view);
    });
  });

  // Bind Header Transfers button
  const btnHdrTransfers = document.getElementById('btn-header-transfers');
  if (btnHdrTransfers) {
    btnHdrTransfers.addEventListener('click', () => switchView('transfers'));
  }

  // Back button on Files canvas
  const btnFilesBack = document.getElementById('btn-files-back');
  if (btnFilesBack) {
    btnFilesBack.addEventListener('click', () => {
      if (activeCategory !== 'recent') {
        loadCategory('recent');
      } else {
        switchView('pair');
      }
    });
  }

  // Sidebar Collapse Toggle
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      document.getElementById('op-sidebar').classList.toggle('collapsed');
    });
  }

  // ========================================================
  // CATEGORIES & DATE-GROUPED GALLERY (O+ CONNECT SIGNATURE)
  // ========================================================

  async function loadCategory(cat) {
    activeCategory = cat;
    const titleEl = document.getElementById('files-view-title');
    const pathBar = document.getElementById('hero-path-bar');
    const gallery = document.getElementById('op-gallery-container');

    // Update active category pills
    document.querySelectorAll('.op-category-pill, .op-cat-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.cat === cat);
    });

    const categoryTitles = {
      recent: 'Recent files',
      all: 'All files',
      images: 'Images',
      photos: 'Images',
      videos: 'Videos',
      audio: 'Audio',
      documents: 'Documents',
      archives: 'Archives',
      apks: 'APKs',
      whatsapp: 'WhatsApp',
      downloads: 'Downloads',
      bluetooth: 'Bluetooth'
    };
    if (titleEl) titleEl.textContent = categoryTitles[cat] || 'Files';

    if (cat === 'all') {
      if (pathBar) pathBar.style.display = 'flex';
      loadRemoteDirectory(heroRemotePath || '');
      return;
    }

    if (pathBar) pathBar.style.display = 'none';
    if (gallery) {
      gallery.innerHTML = '<div class="op-empty-card"><p>Loading files from phone...</p></div>';
    }

    const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
    if (!peer) {
      if (gallery) {
        gallery.innerHTML = `
          <div class="op-empty-card">
            ${icon('radar', 36, 1.7)}
            <h3>No Phone Connected</h3>
            <p>Scan the QR code or pair your phone to browse photos, APKs, and documents.</p>
            <button class="op-btn-primary" style="margin-top: 12px;" onclick="window.__switchView('pair')">Pair Phone</button>
          </div>
        `;
      }
      return;
    }

    try {
      const typeParam = (cat === 'recent') ? 'recent' : cat;
      const res = await fetch(`/api/remote-categories?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&type=${typeParam}&limit=120`);
      const data = await res.json();
      const entries = data.entries || [];
      galleryItems = entries;
      renderDateGroupedGallery(entries, peer);
      updateCategoryCounts(peer);
    } catch (err) {
      if (gallery) {
        gallery.innerHTML = `<div class="op-empty-card"><p style="color: var(--danger);">Failed to load files: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  window.__switchView = switchView;

  function renderDateGroupedGallery(items, peer) {
    const gallery = document.getElementById('op-gallery-container');
    if (!gallery) return;

    if (!items || items.length === 0) {
      gallery.innerHTML = `
        <div class="op-empty-card">
          ${icon('folder', 40, 1.8)}
          <h3>No Files Found</h3>
          <p>No files match this category on your device.</p>
        </div>
      `;
      return;
    }

    // Group items by Date (YYYY/MM/DD)
    const groups = {};
    items.forEach((item) => {
      const dateKey = formatDateKey(item.lastModified);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    // Sort date keys descending
    const sortedDates = Object.keys(groups).sort().reverse();

    let html = '';
    sortedDates.forEach((dateKey) => {
      const dateItems = groups[dateKey];
      html += `
        <div class="op-date-section" data-date="${dateKey}">
          <div class="op-date-header">
            <input type="checkbox" class="op-date-checkbox" data-date="${dateKey}" title="Select all from ${dateKey}" />
            <span class="op-date-title">${dateKey}</span>
          </div>
          <div class="op-date-grid">
      `;

      dateItems.forEach((item) => {
        const itemPath = item.path || item.name;
        const itemName = item.name;
        const itemSize = item.size || 0;
        const isSelected = selectedFilePaths.has(itemPath);

        let previewHtml = '';
        if (isApk(itemName)) {
          previewHtml = `
            <div class="op-apk-sheet">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="#22c55e">
                <path d="M6 10.5a6 6 0 0 1 12 0v5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 15.5z"/>
                <path d="M8.4 5.2L6.7 2.6" stroke="#22c55e" stroke-width="1.8"/>
                <path d="M15.6 5.2l1.7-2.6" stroke="#22c55e" stroke-width="1.8"/>
                <circle cx="9.5" cy="11.5" r="1" fill="#ffffff"/>
                <circle cx="14.5" cy="11.5" r="1" fill="#ffffff"/>
              </svg>
            </div>
          `;
        } else if (isVideo(itemName, item.mimeType)) {
          const thumbUrl = `/api/remote-fs/thumbnail?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&path=${encodeURIComponent(itemPath)}`;
          previewHtml = `
            <img src="${thumbUrl}" alt="${escapeHtml(itemName)}" loading="lazy" />
            <div class="op-play-overlay">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <polygon points="6 4 20 12 6 20 6 4"/>
              </svg>
            </div>
          `;
        } else if (isImage(itemName, item.mimeType)) {
          const thumbUrl = `/api/remote-fs/thumbnail?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&path=${encodeURIComponent(itemPath)}`;
          previewHtml = `<img src="${thumbUrl}" alt="${escapeHtml(itemName)}" loading="lazy" />`;
        } else {
          previewHtml = `
            <div class="op-doc-sheet">
              ${icon(remoteEntryIcon(item), 32, 1.8)}
            </div>
          `;
        }

        html += `
          <div class="op-file-card ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(itemPath)}" data-name="${escapeHtml(itemName)}" data-size="${itemSize}">
            <div class="op-card-select">
              <input type="checkbox" class="op-card-checkbox" data-path="${escapeHtml(itemPath)}" ${isSelected ? 'checked' : ''} />
            </div>
            <div class="op-card-actions">
              <button class="op-quick-btn op-quick-dl" title="Download to PC" data-path="${escapeHtml(itemPath)}" data-name="${escapeHtml(itemName)}" data-size="${itemSize}">
                ${icon('download', 13, 2)}
              </button>
              <button class="op-quick-btn op-quick-del" title="Delete from Phone" data-path="${escapeHtml(itemPath)}" data-name="${escapeHtml(itemName)}">
                ${icon('trash', 13, 2)}
              </button>
            </div>
            <div class="op-card-preview">
              ${previewHtml}
            </div>
            <div class="op-card-meta">
              <span class="op-card-filename" title="${escapeHtml(itemName)}">${escapeHtml(itemName)}</span>
              <span class="op-card-filesize">${formatBytes(itemSize)}</span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    gallery.innerHTML = html;

    // Attach Event Handlers
    // 1. Card Click -> Lightbox
    gallery.querySelectorAll('.op-file-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.op-card-select') || e.target.closest('.op-card-actions')) return;
        const path = card.dataset.path;
        const name = card.dataset.name;
        const size = Number(card.dataset.size);
        openLightbox({ path, name, size }, peer);
      });
    });

    // 2. Card Checkbox Click
    gallery.querySelectorAll('.op-card-checkbox').forEach((chk) => {
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = chk.dataset.path;
        if (chk.checked) selectedFilePaths.add(p);
        else selectedFilePaths.delete(p);
        const card = chk.closest('.op-file-card');
        if (card) card.classList.toggle('selected', chk.checked);
        updateBatchActionBar();
      });
    });

    // 3. Date Header Checkbox Click
    gallery.querySelectorAll('.op-date-checkbox').forEach((dateChk) => {
      dateChk.addEventListener('click', (e) => {
        e.stopPropagation();
        const dateKey = dateChk.dataset.date;
        const section = gallery.querySelector(`.op-date-section[data-date="${dateKey}"]`);
        if (!section) return;
        const checked = dateChk.checked;
        section.querySelectorAll('.op-card-checkbox').forEach((chk) => {
          chk.checked = checked;
          const p = chk.dataset.path;
          if (checked) selectedFilePaths.add(p);
          else selectedFilePaths.delete(p);
          const card = chk.closest('.op-file-card');
          if (card) card.classList.toggle('selected', checked);
        });
        updateBatchActionBar();
      });
    });

    // 4. Download Quick-button
    gallery.querySelectorAll('.op-quick-dl').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        pullRemoteFile(btn.dataset.path, btn.dataset.name, btn.dataset.size);
      });
    });

    // 5. Delete Quick-button
    gallery.querySelectorAll('.op-quick-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete "${btn.dataset.name}" from phone?`)) {
          remoteFsAction('/api/remote-fs/delete', { path: btn.dataset.path }).then(() => {
            loadCategory(activeCategory);
          });
        }
      });
    });
  }

  function updateBatchActionBar() {
    const bar = document.getElementById('batch-actions-bar');
    const selectAllChk = document.getElementById('chk-select-all');
    const labelText = document.getElementById('select-all-label');
    const count = selectedFilePaths.size;

    if (count > 0) {
      if (bar) bar.style.display = 'flex';
      if (labelText) labelText.textContent = `${count} selected`;
      if (selectAllChk) selectAllChk.checked = (count === galleryItems.length);
    } else {
      if (bar) bar.style.display = 'none';
      if (labelText) labelText.textContent = 'Select all';
      if (selectAllChk) selectAllChk.checked = false;
    }
  }

  // Select all checkbox
  const chkSelectAll = document.getElementById('chk-select-all');
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', () => {
      const checked = chkSelectAll.checked;
      selectedFilePaths.clear();
      document.querySelectorAll('.op-card-checkbox').forEach((chk) => {
        chk.checked = checked;
        if (checked) selectedFilePaths.add(chk.dataset.path);
        const card = chk.closest('.op-file-card');
        if (card) card.classList.toggle('selected', checked);
      });
      document.querySelectorAll('.op-date-checkbox').forEach((chk) => {
        chk.checked = checked;
      });
      updateBatchActionBar();
    });
  }

  // Batch Download
  const btnBatchDownload = document.getElementById('btn-batch-download');
  if (btnBatchDownload) {
    btnBatchDownload.addEventListener('click', async () => {
      const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
      if (!peer || selectedFilePaths.size === 0) return;
      btnBatchDownload.disabled = true;
      btnBatchDownload.textContent = 'Downloading...';
      for (const p of selectedFilePaths) {
        const item = galleryItems.find((i) => i.path === p);
        const name = item ? item.name : p.split(/[\\/]/).pop();
        const size = item ? item.size : 0;
        await pullRemoteFile(p, name, size);
      }
      btnBatchDownload.disabled = false;
      btnBatchDownload.textContent = 'Download';
      selectedFilePaths.clear();
      updateBatchActionBar();
    });
  }

  // Batch Delete
  const btnBatchDelete = document.getElementById('btn-batch-delete');
  if (btnBatchDelete) {
    btnBatchDelete.addEventListener('click', async () => {
      if (selectedFilePaths.size === 0) return;
      if (window.confirm(`Delete ${selectedFilePaths.size} selected file(s) from phone?`)) {
        for (const p of selectedFilePaths) {
          await remoteFsAction('/api/remote-fs/delete', { path: p });
        }
        selectedFilePaths.clear();
        updateBatchActionBar();
        loadCategory(activeCategory);
      }
    });
  }

  // Category counts updating
  async function updateCategoryCounts(peer) {
    if (!peer) return;
    const cats = ['images', 'videos', 'audio', 'documents', 'archives', 'apks', 'whatsapp', 'downloads'];
    cats.forEach(async (c) => {
      try {
        const res = await fetch(`/api/remote-categories?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&type=${c}&limit=1`);
        const data = await res.json();
        const countEl = document.getElementById(`count-${c}`);
        if (countEl && typeof data.total === 'number') {
          countEl.textContent = String(data.total);
        }
      } catch (_) {}
    });
  }

  // Bind Category Sub-sidebar Buttons
  document.querySelectorAll('.op-category-pill, .op-cat-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadCategory(btn.dataset.cat);
    });
  });

  // Collapsible Group Headers in Category Sidebar
  document.querySelectorAll('.op-group-header').forEach((hdr) => {
    hdr.addEventListener('click', () => {
      const toggleTarget = hdr.dataset.toggle;
      const body = document.getElementById(`group-${toggleTarget}-body`);
      if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'flex' : 'none';
        const chevron = hdr.querySelector('.op-group-chevron');
        if (chevron) chevron.textContent = isHidden ? '\u2304' : '\u203A';
      }
    });
  });

  // Refresh files button
  const btnRefreshFiles = document.getElementById('btn-refresh-files');
  if (btnRefreshFiles) {
    btnRefreshFiles.addEventListener('click', () => {
      loadCategory(activeCategory);
    });
  }

  // View Mode Toggles (Grid vs List)
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewList = document.getElementById('btn-view-list');
  const galleryContainer = document.getElementById('op-gallery-container');

  if (btnViewGrid && btnViewList) {
    btnViewGrid.addEventListener('click', () => {
      btnViewGrid.classList.add('active');
      btnViewList.classList.remove('active');
      if (galleryContainer) galleryContainer.classList.remove('op-gallery-list-view');
    });

    btnViewList.addEventListener('click', () => {
      btnViewList.classList.add('active');
      btnViewGrid.classList.remove('active');
      if (galleryContainer) galleryContainer.classList.add('op-gallery-list-view');
    });
  }

  // ========================================================
  // + IMPORT FILES (DIRECT STREAMING TO PHONE)
  // ========================================================

  const btnImport = document.getElementById('btn-import-files');
  const importInput = document.getElementById('op-import-file-input');

  if (btnImport && importInput) {
    btnImport.addEventListener('click', async () => {
      const targetPeer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
      if (!targetPeer) {
        alert('Please pair or connect your phone first before importing files.');
        switchView('pair');
        return;
      }

      if (window.electronAPI && typeof window.electronAPI.selectFiles === 'function') {
        const files = await window.electronAPI.selectFiles();
        if (files && files.length > 0) {
          sendFilesDirectlyToPeer(targetPeer, files);
        }
      } else {
        importInput.click();
      }
    });

    importInput.addEventListener('change', () => {
      const targetPeer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
      if (targetPeer && importInput.files.length > 0) {
        sendFilesDirectlyToPeer(targetPeer, importInput.files);
        importInput.value = '';
      }
    });
  }

  // ========================================================
  // ALL FILES (REMOTE DIRECTORY LISTING)
  // ========================================================

  async function loadRemoteDirectory(path) {
    const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
    if (!peer) return;

    const gallery = document.getElementById('op-gallery-container');
    const pathText = document.getElementById('hero-path-text');
    if (gallery) gallery.innerHTML = '<div class="op-empty-card"><p>Loading directory...</p></div>';

    try {
      const res = await fetch(`/api/remote-fs/list?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&path=${encodeURIComponent(path || '')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list directory');
      heroRemotePath = data.currentPath || '';
      if (pathText) pathText.textContent = heroRemotePath || '/';
      renderDateGroupedGallery(data.entries || [], peer);
    } catch (err) {
      if (gallery) {
        gallery.innerHTML = `<div class="op-empty-card"><p style="color: var(--danger);">Failed: ${escapeHtml(err.message)}</p></div>`;
      }
    }
  }

  const btnPathUp = document.getElementById('btn-hero-path-up');
  if (btnPathUp) {
    btnPathUp.addEventListener('click', () => {
      if (!heroRemotePath) return;
      const parts = heroRemotePath.split(/[\\/]/).filter(Boolean);
      parts.pop();
      loadRemoteDirectory(parts.join('/') || '/');
    });
  }

  const btnPathRefresh = document.getElementById('btn-hero-path-refresh');
  if (btnPathRefresh) {
    btnPathRefresh.addEventListener('click', () => loadRemoteDirectory(heroRemotePath));
  }

  // ========================================================
  // LIGHTBOX FULLSCREEN PREVIEW
  // ========================================================

  function openLightbox(item, peer) {
    currentLightboxItem = item;
    const modal = document.getElementById('modal-lightbox');
    const titleEl = document.getElementById('lightbox-filename');
    const sizeEl = document.getElementById('lightbox-filesize');
    const bodyEl = document.getElementById('lightbox-media-container');

    if (titleEl) titleEl.textContent = item.name;
    if (sizeEl) sizeEl.textContent = formatBytes(item.size);

    const streamUrl = `http://${peer.address}:${peer.port || 53318}/v1/fs/stream?path=${encodeURIComponent(item.path)}`;

    if (isVideo(item.name)) {
      if (bodyEl) bodyEl.innerHTML = `<video src="${streamUrl}" controls autoplay style="max-width: 100%; max-height: 75vh; border-radius: 8px;"></video>`;
    } else if (isImage(item.name)) {
      if (bodyEl) bodyEl.innerHTML = `<img src="${streamUrl}" alt="${escapeHtml(item.name)}" style="max-width: 100%; max-height: 75vh; border-radius: 8px;">`;
    } else {
      if (bodyEl) bodyEl.innerHTML = `<div style="padding: 40px; color: #ffffff; text-align: center;">${icon(remoteEntryIcon(item), 64, 1.8)}<p style="margin-top: 14px;">${escapeHtml(item.name)}</p></div>`;
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

  const btnCloseLightbox = document.getElementById('btn-lightbox-close');
  if (btnCloseLightbox) btnCloseLightbox.addEventListener('click', closeLightbox);

  const btnDlLightbox = document.getElementById('btn-lightbox-download');
  if (btnDlLightbox) {
    btnDlLightbox.addEventListener('click', () => {
      const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
      if (currentLightboxItem && peer) {
        pullRemoteFile(currentLightboxItem.path, currentLightboxItem.name, currentLightboxItem.size);
      }
    });
  }

  const btnDelLightbox = document.getElementById('btn-lightbox-delete');
  if (btnDelLightbox) {
    btnDelLightbox.addEventListener('click', () => {
      if (currentLightboxItem) {
        if (window.confirm(`Delete "${currentLightboxItem.name}" from phone?`)) {
          remoteFsAction('/api/remote-fs/delete', { path: currentLightboxItem.path }).then(() => {
            closeLightbox();
            loadCategory(activeCategory);
          });
        }
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // ========================================================
  // LIVE PEER CONNECTION & PAIRING
  // ========================================================

  async function updateLiveStatus() {
    try {
      const res = await fetch('/api/live/status');
      const data = await res.json();

      if (data.connected && data.peer) {
        connectedLivePeer = data.peer;

        // Update UI elements
        const nameEl = document.getElementById('op-connected-device-name');
        if (nameEl) nameEl.textContent = data.peer.displayName || 'realme GT 6T';

        const treeConnected = document.getElementById('op-device-tree-connected');
        if (treeConnected) treeConnected.style.display = 'flex';
        const unconnPrompt = document.getElementById('op-unconnected-prompt');
        if (unconnPrompt) unconnPrompt.style.display = 'none';

        const clipTag = document.getElementById('op-clip-tag');
        if (clipTag) {
          clipTag.textContent = data.clipboardSync ? 'ON' : 'OFF';
          clipTag.style.background = data.clipboardSync ? 'var(--success)' : 'var(--text-muted)';
        }

        if (currentView === 'pair') {
          switchView('files');
        }
      } else {
        connectedLivePeer = null;
        const unconnPrompt = document.getElementById('op-unconnected-prompt');
        if (unconnPrompt) unconnPrompt.style.display = 'block';
        if (currentView === 'files') {
          switchView('pair');
        }
      }
    } catch (_) {}
  }

  async function connectToPeerLive(peer) {
    try {
      const res = await fetch('/api/live/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer })
      });
      if (res.ok) {
        await updateLiveStatus();
        switchView('files');
      }
    } catch (err) {
      console.error('Live connect failed', err);
    }
  }

  async function disconnectPeerLive() {
    try {
      await fetch('/api/live/disconnect', { method: 'POST' });
      await updateLiveStatus();
      switchView('pair');
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

  const btnHeroClip = document.getElementById('btn-hero-clip');
  if (btnHeroClip) {
    btnHeroClip.addEventListener('click', toggleLiveClipboard);
  }

  const btnHeroDisconnect = document.getElementById('btn-hero-disconnect');
  if (btnHeroDisconnect) {
    btnHeroDisconnect.addEventListener('click', disconnectPeerLive);
  }

  // ========================================================
  // SELF DEVICE & PAIRING QR/PIN
  // ========================================================

  async function loadSelfInfo() {
    try {
      const res = await fetch('/api/self');
      const data = await res.json();

      const selfNameEl = document.getElementById('self-name');
      if (selfNameEl) selfNameEl.textContent = data.displayName || 'PC Device';
      const opProfileUser = document.getElementById('op-profile-username');
      if (opProfileUser) opProfileUser.textContent = (data.displayName || 'Rohan (PC)').replace(/\s*\(PC\)$/i, '');

      const infoHost = document.getElementById('info-hostname');
      if (infoHost) infoHost.textContent = data.displayName;
      const infoIp = document.getElementById('info-ip');
      if (infoIp) infoIp.textContent = data.address;
      const infoFolder = document.getElementById('info-folder');
      if (infoFolder) infoFolder.textContent = data.storageDir || 'Downloads/LocalShare';

      // 6-digit PIN & SVG QR Code
      const pinDisplay = document.getElementById('pairing-code-display');
      if (pinDisplay && data.pairingCode) {
        pinDisplay.textContent = data.pairingCode;
      }

      const qrBox = document.getElementById('qr-code-box');
      if (qrBox && data.qrSvg) {
        qrBox.innerHTML = data.qrSvg;
      }
    } catch (err) {
      console.warn('Failed to load self device info:', err);
    }
  }

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

  // ========================================================
  // PEERS & DISCOVERY
  // ========================================================

  async function loadPeers() {
    try {
      const res = await fetch('/api/peers');
      peers = await res.json();
      renderPeers();
      renderRadar();
      renderRecipientChips();
    } catch (err) {
      console.warn('Failed to load peers:', err);
    }
  }

  function renderPeers() {
    const list = document.getElementById('devices-list');
    if (!list) return;

    if (peers.length === 0) {
      list.innerHTML = `
        <div class="op-empty-card" style="padding: 24px;">
          ${icon('radar', 28, 1.8)}
          <p style="font-size: 13px;">Looking for nearby phones or computers...</p>
          <span style="font-size: 11.5px; color: var(--text-muted);">Ensure LocalShare is open on your phone connected to the same Wi-Fi.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = peers.map((p) => `
      <div class="op-device-card" data-device-id="${p.deviceId}">
        <div class="op-device-avatar-circle">${getPlatformIcon(p.platform)}</div>
        <div class="op-device-meta-info">
          <h4 class="op-device-main-title">${escapeHtml(p.displayName)}</h4>
          <p class="op-device-ip-sub">${escapeHtml(p.address)}:${p.port || 53318} • ${p.platform}</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="op-btn-primary op-btn-sm btn-connect-peer" data-device-id="${p.deviceId}">Connect</button>
          <button class="op-btn-secondary op-btn-sm btn-send-peer" data-device-id="${p.deviceId}">Send</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-connect-peer').forEach((btn) => {
      btn.addEventListener('click', () => {
        const peer = peers.find((p) => p.deviceId === btn.dataset.deviceId);
        if (peer) connectToPeerLive(peer);
      });
    });

    list.querySelectorAll('.btn-send-peer').forEach((btn) => {
      btn.addEventListener('click', () => {
        const peer = peers.find((p) => p.deviceId === btn.dataset.deviceId);
        if (peer) {
          selectPeer(peer);
          switchView('share');
        }
      });
    });
  }

  // Scan Network Button
  const btnScan = document.getElementById('btn-scan');
  if (btnScan) {
    btnScan.addEventListener('click', async () => {
      btnScan.disabled = true;
      btnScan.innerHTML = '<span>Scanning...</span>';
      await fetch('/api/scan', { method: 'POST' });
      setTimeout(() => {
        btnScan.disabled = false;
        btnScan.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M12 12l6.4-6.4"/></svg><span>Scan Network</span>`;
        loadPeers();
      }, 2000);
    });
  }

  // Manual IP Modal
  const modalManual = document.getElementById('modal-manual');
  const btnManual = document.getElementById('btn-manual');
  const btnCancelManual = document.getElementById('btn-cancel-manual');
  const btnConfirmManual = document.getElementById('btn-confirm-manual');

  if (btnManual && modalManual) {
    btnManual.addEventListener('click', () => modalManual.classList.add('active'));
  }
  if (btnCancelManual && modalManual) {
    btnCancelManual.addEventListener('click', () => modalManual.classList.remove('active'));
  }
  if (btnConfirmManual && modalManual) {
    btnConfirmManual.addEventListener('click', async () => {
      const ip = document.getElementById('manual-ip-input').value.trim();
      const port = document.getElementById('manual-port-input').value.trim();
      const name = document.getElementById('manual-name-input').value.trim();
      if (ip) {
        await fetch('/api/manual-peer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port, name })
        });
        modalManual.classList.remove('active');
        loadPeers();
      }
    });
  }

  // ========================================================
  // LIVE CLIPBOARD SYNC
  // ========================================================

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
        listEl.innerHTML = '<p class="op-empty-text">No clipboard entries captured yet. Copy text on either device to start syncing.</p>';
        return;
      }

      listEl.innerHTML = history.map((item) => `
        <div class="op-clip-item">
          <span class="op-clip-text">${escapeHtml(item.text)}</span>
          <button class="op-clip-copy-btn" data-clip="${escapeHtml(item.text)}">Copy to PC</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.op-clip-copy-btn').forEach((btn) => {
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

  const btnSendClipboard = document.getElementById('btn-send-clipboard');
  const clipSendInput = document.getElementById('clip-send-input');
  if (btnSendClipboard && clipSendInput) {
    btnSendClipboard.addEventListener('click', async () => {
      const text = clipSendInput.value.trim();
      const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
      if (!text || !peer) return;

      try {
        await fetch(`http://${peer.address}:${peer.port || 53318}/v1/clipboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, senderId: 'pc-localshare' })
        });
        clipSendInput.value = '';
        btnSendClipboard.textContent = 'Sent!';
        setTimeout(() => { btnSendClipboard.textContent = 'Push to Phone'; }, 1500);
      } catch (err) {
        alert(`Failed to push clipboard: ${err.message}`);
      }
    });
  }

  // ========================================================
  // FILE TRANSFERS & STREAMING
  // ========================================================

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
        switchView('transfers');
      }
    } catch (err) {
      console.error('Send files failed:', err);
    }
  }

  async function pullRemoteFile(path, name, size) {
    const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
    if (!peer) return;
    try {
      const res = await fetch('/api/remote-fs/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: peer.address, port: peer.port, path, name, size: Number(size) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      alert(`Saved "${name}" to Downloads/LocalShare`);
      loadTransfers();
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  }

  async function remoteFsAction(endpoint, payload) {
    const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
    if (!peer) return;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: peer.address, port: peer.port, ...payload })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Operation failed');
      }
    } catch (err) {
      console.error('Remote action failed:', err);
      alert(`Operation failed: ${err.message}`);
    }
  }

  async function loadTransfers() {
    try {
      const res = await fetch('/api/transfers');
      const transfers = await res.json();
      const list = document.getElementById('transfers-list');
      const badge = document.getElementById('transfers-badge');
      if (badge) badge.textContent = transfers.length;

      if (!list) return;
      if (transfers.length === 0) {
        list.innerHTML = `
          <div class="op-empty-card">
            ${icon('transfers', 36, 1.7)}
            <h3>No Active Transfers</h3>
            <p>When you send or receive files, real-time speed and progress bars will stream here.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = transfers.map((t) => `
        <div class="op-card-box" style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 14px;">${escapeHtml(t.files ? t.files.join(', ') : 'File')}</strong>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">Peer: ${escapeHtml(t.peer)} • Status: <strong style="color: ${t.status === 'completed' ? 'var(--success)' : t.status === 'failed' ? 'var(--danger)' : 'var(--primary)'}">${escapeHtml(t.status)}</strong></div>
            </div>
            <span class="op-pill-tag">${t.progress}%</span>
          </div>
          <div style="height: 6px; background: var(--border-subtle); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
            <div style="height: 100%; width: ${t.progress}%; background: ${t.status === 'completed' ? 'var(--success)' : t.status === 'failed' ? 'var(--danger)' : 'var(--primary)'}; border-radius: 3px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted);">
            <span>${formatBytes(t.bytesTransferred)} of ${formatBytes(t.totalBytes)}</span>
            <span>${new Date(t.startTime).toLocaleTimeString()}</span>
          </div>
        </div>
      `).join('');
    } catch (_) {}
  }

  async function loadReceivedFiles() {
    try {
      const res = await fetch('/api/received');
      const files = await res.json();
      const grid = document.getElementById('received-list');
      if (!grid) return;

      if (files.length === 0) {
        grid.innerHTML = `
          <div class="op-empty-card">
            ${icon('folder', 36, 1.7)}
            <h3>No Received Files Yet</h3>
            <p>Files received from your phone will automatically appear here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = files.map((f) => `
        <div class="op-card-box" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${icon('file', 22, 1.8)}
            <div>
              <h4 style="font-size: 13.5px; font-weight: 600;">${escapeHtml(f.name)}</h4>
              <p style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
                ${formatBytes(f.size)} • ${new Date(f.receivedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button class="op-btn-secondary op-btn-sm btn-open-rcvd-file" data-path="${escapeHtml(f.path)}">Open File</button>
        </div>
      `).join('');

      grid.querySelectorAll('.btn-open-rcvd-file').forEach((btn) => {
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
    } catch (_) {}
  }

  const btnOpenReceivedFolder = document.getElementById('btn-open-received-folder');
  if (btnOpenReceivedFolder) {
    btnOpenReceivedFolder.addEventListener('click', () => {
      fetch('/api/open-folder', { method: 'POST' });
    });
  }

  // ========================================================
  // RADAR DISCOVERY
  // ========================================================

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
    buildRadarTicks();
    const container = document.getElementById('radar-blips-container');
    if (!container) return;

    container.innerHTML = peers.map((p, idx) => {
      const angle = (idx / Math.max(1, peers.length)) * 2 * Math.PI - Math.PI / 2;
      const radius = 120;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return `
        <div class="radar-blip" data-device-id="${p.deviceId}" style="position: absolute; transform: translate(${x}px, ${y}px); display: flex; flex-direction: column; align-items: center; cursor: pointer;" title="${escapeHtml(p.displayName)}">
          <div class="radar-blip-node">${getPlatformIcon(p.platform)}</div>
          <span style="font-size: 11px; font-weight: 600; color: var(--text-main); background: var(--bg-card); padding: 1px 6px; border-radius: 4px; margin-top: 4px;">
            ${escapeHtml(p.displayName)}
          </span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.radar-blip').forEach((blip) => {
      blip.addEventListener('click', () => {
        const peer = peers.find((p) => p.deviceId === blip.dataset.deviceId);
        if (peer) connectToPeerLive(peer);
      });
    });

    const peersEl = document.getElementById('telem-peers');
    if (peersEl) peersEl.textContent = String(peers.length);
  }

  // ========================================================
  // SHARE HUB (MANUAL STAGING)
  // ========================================================

  function selectPeer(peer) {
    selectedPeer = peer;
    const box = document.getElementById('selected-peer-box');
    if (box) {
      box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="font-size: 14px;">${getPlatformIcon(peer.platform)} ${escapeHtml(peer.displayName)}</strong>
            <p style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(peer.address)}:${peer.port || 53318}</p>
          </div>
          <button class="op-btn-secondary op-btn-sm" id="btn-change-peer">Change</button>
        </div>
      `;
      const btnChange = document.getElementById('btn-change-peer');
      if (btnChange) btnChange.addEventListener('click', () => selectPeer(null));
    }
    updateSendButtonState();
  }

  function renderRecipientChips() {
    const list = document.getElementById('recipient-chips');
    if (!list) return;
    if (peers.length === 0) {
      list.innerHTML = '<p style="font-size: 12px; color: var(--text-muted);">No devices found.</p>';
      return;
    }
    list.innerHTML = peers.map((p) => `
      <button class="op-btn-secondary op-btn-sm recipient-chip" data-device-id="${p.deviceId}">
        ${getPlatformIcon(p.platform)} <span>${escapeHtml(p.displayName)}</span>
      </button>
    `).join('');

    list.querySelectorAll('.recipient-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = peers.find((peer) => peer.deviceId === btn.dataset.deviceId);
        if (p) selectPeer(p);
      });
    });
  }

  function updateSendButtonState() {
    const sendBtn = document.getElementById('btn-send-files');
    if (sendBtn) {
      sendBtn.disabled = !selectedPeer || stagedFiles.length === 0;
    }
  }

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowse = document.getElementById('btn-browse-files');

  if (btnBrowse && fileInput) {
    btnBrowse.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      addStagedFiles(fileInput.files);
      fileInput.value = '';
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      addStagedFiles(e.dataTransfer.files);
    });
  }

  function addStagedFiles(fileList) {
    const list = Array.from(fileList || []);
    list.forEach((f) => {
      if (!stagedFiles.some((s) => s.name === f.name && s.size === f.size)) {
        stagedFiles.push(f);
      }
    });
    renderStagedFiles();
  }

  function renderStagedFiles() {
    const countEl = document.getElementById('staged-count');
    const sizeEl = document.getElementById('staged-size');
    const listEl = document.getElementById('staged-list');

    if (countEl) countEl.textContent = String(stagedFiles.length);
    const totalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);
    if (sizeEl) sizeEl.textContent = formatBytes(totalBytes);

    if (!listEl) return;
    if (stagedFiles.length === 0) {
      listEl.innerHTML = '<li class="empty-list-notice">No files staged yet.</li>';
      updateSendButtonState();
      return;
    }

    listEl.innerHTML = stagedFiles.map((f, idx) => `
      <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">${escapeHtml(f.name)}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--text-muted); font-size: 11px;">${formatBytes(f.size)}</span>
          <button class="btn-remove-staged" data-idx="${idx}" style="color: var(--danger); font-size: 14px;">&times;</button>
        </div>
      </li>
    `).join('');

    listEl.querySelectorAll('.btn-remove-staged').forEach((btn) => {
      btn.addEventListener('click', () => {
        stagedFiles.splice(Number(btn.dataset.idx), 1);
        renderStagedFiles();
      });
    });

    updateSendButtonState();
  }

  const btnSendFiles = document.getElementById('btn-send-files');
  if (btnSendFiles) {
    btnSendFiles.addEventListener('click', async () => {
      if (!selectedPeer || stagedFiles.length === 0) return;
      btnSendFiles.disabled = true;
      btnSendFiles.textContent = 'Sending...';
      await sendFilesDirectlyToPeer(selectedPeer, stagedFiles);
      stagedFiles = [];
      renderStagedFiles();
      btnSendFiles.textContent = 'Send Files';
    });
  }

  // ========================================================
  // THEME SWITCHING (4 THEMES PERSISTED)
  // ========================================================

  document.querySelectorAll('.theme-card').forEach((card) => {
    card.addEventListener('click', () => {
      const themeId = card.dataset.themeId;
      currentTheme = themeId;
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('localshare_desktop_theme', themeId);
      document.querySelectorAll('.theme-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  // ========================================================
  // WINDOW TITLEBAR CONTROLS (ELECTRON IPC)
  // ========================================================

  const btnMin = document.getElementById('op-btn-minimize');
  const btnMax = document.getElementById('op-btn-maximize');
  const btnClose = document.getElementById('op-btn-close');

  if (btnMin) {
    btnMin.addEventListener('click', () => {
      if (window.electronAPI && typeof window.electronAPI.minimizeWindow === 'function') {
        window.electronAPI.minimizeWindow();
      }
    });
  }
  if (btnMax) {
    btnMax.addEventListener('click', () => {
      if (window.electronAPI && typeof window.electronAPI.maximizeWindow === 'function') {
        window.electronAPI.maximizeWindow();
      }
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.electronAPI && typeof window.electronAPI.closeWindow === 'function') {
        window.electronAPI.closeWindow();
      } else {
        window.close();
      }
    });
  }

  // ========================================================
  // SSE REAL-TIME SYSTEM EVENTS
  // ========================================================

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
    sse.addEventListener('clipboard_sync', () => loadClipboardHistory());
    sse.addEventListener('incoming_request', (e) => {
      try {
        showIncomingRequest(JSON.parse(e.data));
      } catch (_) {}
    });
    sse.addEventListener('incoming_request_closed', () => hideIncomingRequest());
  }

  // Incoming Modal
  const incomingModal = document.getElementById('modal-incoming');
  let activeRequestId = null;

  function showIncomingRequest(req) {
    activeRequestId = req.requestId;
    document.getElementById('incoming-summary').textContent =
      `${req.senderName || 'Nearby Device'} wants to send you ${req.fileCount || 0} file(s) (${formatBytes(req.totalBytes || 0)}).`;

    const list = document.getElementById('incoming-file-list');
    list.innerHTML = (req.files || [])
      .map((f) => `<li>${escapeHtml(f.fileName)} <span class="op-pill-tag">${formatBytes(f.fileSize)}</span></li>`)
      .join('');

    incomingModal.classList.add('active');
  }

  function hideIncomingRequest() {
    activeRequestId = null;
    incomingModal.classList.remove('active');
  }

  async function respondToIncoming(accepted) {
    if (!activeRequestId) return;
    const reqId = activeRequestId;
    hideIncomingRequest();
    await fetch('/api/respond-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: reqId, accepted })
    });
  }

  const btnAcceptInc = document.getElementById('btn-accept-incoming');
  const btnRejectInc = document.getElementById('btn-reject-incoming');
  if (btnAcceptInc) btnAcceptInc.addEventListener('click', () => respondToIncoming(true));
  if (btnRejectInc) btnRejectInc.addEventListener('click', () => respondToIncoming(false));

  // Initialize
  loadSelfInfo();
  loadPeers();
  initSSE();
  updateLiveStatus();
})();
