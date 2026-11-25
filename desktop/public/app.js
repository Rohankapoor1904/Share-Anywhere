// Share Anywhere — LocalShare desktop UI
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
    if (!timestamp) return '0000/00/00';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '0000/00/00';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  /** "Today", "Yesterday", "Monday", or "23 Nov 2025" for a YYYY/MM/DD key. */
  function formatDateLabel(dateKey) {
    if (!dateKey || dateKey === '0000/00/00') return 'Unknown date';
    const [y, m, d] = dateKey.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - date.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
    const sameYear = date.getFullYear() === today.getFullYear();
    return date.toLocaleDateString(undefined, sameYear
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** "just now", "5 min ago", "3 h ago", or a date. */
  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - Number(timestamp);
    if (!Number.isFinite(diff)) return '';
    if (diff < 45000) return 'just now';
    if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))} min ago`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)} h ago`;
    return new Date(Number(timestamp)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function fileKindIcon(name) {
    const n = String(name || '').toLowerCase();
    if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|svg)$/.test(n)) return 'image';
    if (/\.(mp4|mkv|webm|mov|avi|3gp|m4v)$/.test(n)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(n)) return 'audio';
    if (/\.(zip|rar|7z|tar|gz|bz2|iso|apk|xapk)$/.test(n)) return 'archive';
    if (/\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|json|xml|html)$/.test(n)) return 'document';
    return 'file';
  }

  function isApk(name) {
    return /\.apk$/i.test(name) || /\.xapk$/i.test(name);
  }

  // ========================================================
  // DESKTOP TOAST SYSTEM & GLASS CONFIRM MODAL
  // ========================================================

  function showToast(message, type = 'info') {
    const container = document.getElementById('desktop-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `desktop-toast toast-${type}`;
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  function showConfirmModal({ title = 'Confirm Action', message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('desktop-confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const btnConfirm = document.getElementById('confirm-modal-confirm');
      const btnCancel = document.getElementById('confirm-modal-cancel');
      const backdrop = document.getElementById('confirm-modal-backdrop');

      if (!modal || !btnConfirm || !btnCancel) {
        resolve(true);
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      btnConfirm.textContent = confirmLabel;
      if (danger) {
        btnConfirm.className = 'op-btn-danger op-btn-sm';
      } else {
        btnConfirm.className = 'op-btn-primary op-btn-sm';
      }

      modal.style.display = 'flex';

      function cleanup(result) {
        modal.style.display = 'none';
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        if (backdrop) backdrop.removeEventListener('click', onCancel);
        resolve(result);
      }

      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      if (backdrop) backdrop.addEventListener('click', onCancel);
    });
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
    } else if (viewName === 'settings') {
      loadPairedDevices();
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
      gallery.innerHTML = '<div class="op-empty-card"><div class="op-spinner"></div><p>Loading files from your phone…</p></div>';
    }

    const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
    if (!peer) {
      if (gallery) {
        gallery.innerHTML = `
          <div class="op-empty-card">
            ${icon('radar', 36, 1.7)}
            <h3>No phone connected</h3>
            <p>Pair your phone to browse its photos, videos and documents here.</p>
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
          <h3>Nothing here</h3>
          <p>Your phone has no files of this type.</p>
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
            <input type="checkbox" class="op-date-checkbox" data-date="${dateKey}" title="Select all from ${escapeHtml(formatDateLabel(dateKey))}" />
            <span class="op-date-title">${escapeHtml(formatDateLabel(dateKey))}</span>
            <span class="op-date-count">${dateItems.length}</span>
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
            <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(itemName)}" loading="lazy" />
            <div class="op-play-overlay">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <polygon points="6 4 20 12 6 20 6 4"/>
              </svg>
            </div>
          `;
        } else if (isImage(itemName, item.mimeType)) {
          const thumbUrl = `/api/remote-fs/thumbnail?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&path=${encodeURIComponent(itemPath)}`;
          previewHtml = `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(itemName)}" loading="lazy" />`;
        } else {
          previewHtml = `
            <div class="op-doc-sheet">
              ${icon(remoteEntryIcon(item), 32, 1.8)}
            </div>
          `;
        }

        html += `
          <div class="op-file-card ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(itemPath)}" data-name="${escapeHtml(itemName)}" data-size="${escapeHtml(String(itemSize))}">
            <div class="op-card-select">
              <input type="checkbox" class="op-card-checkbox" data-path="${escapeHtml(itemPath)}" ${isSelected ? 'checked' : ''} />
            </div>
            <div class="op-card-actions">
              <button class="op-quick-btn op-quick-dl" title="Download to PC" data-path="${escapeHtml(itemPath)}" data-name="${escapeHtml(itemName)}" data-size="${escapeHtml(String(itemSize))}">
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
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmModal({
          title: 'Delete Remote File',
          message: `Delete "${btn.dataset.name}" from phone?`,
          confirmLabel: 'Delete',
          danger: true
        });
        if (confirmed) {
          remoteFsAction('/api/remote-fs/delete', { path: btn.dataset.path }).then(() => {
            showToast(`Deleted "${btn.dataset.name}"`, 'info');
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
      const confirmed = await showConfirmModal({
        title: 'Delete Selected Files',
        message: `Delete ${selectedFilePaths.size} selected file(s) from phone?`,
        confirmLabel: 'Delete All',
        danger: true
      });
      if (confirmed) {
        for (const p of selectedFilePaths) {
          await remoteFsAction('/api/remote-fs/delete', { path: p });
        }
        showToast(`Deleted ${selectedFilePaths.size} file(s)`, 'info');
        selectedFilePaths.clear();
        updateBatchActionBar();
        loadCategory(activeCategory);
      }
    });
  }

  // Category counts updating (Single fast HTTP request including bluetooth)
  async function updateCategoryCounts(peer) {
    if (!peer) return;
    try {
      const res = await fetch(`/api/remote-category-counts?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}`);
      const data = await res.json();
      const cats = ['images', 'videos', 'audio', 'documents', 'archives', 'apks', 'whatsapp', 'downloads', 'bluetooth'];
      cats.forEach((c) => {
        const countEl = document.getElementById(`count-${c}`);
        if (countEl && typeof data[c] === 'number') {
          countEl.textContent = String(data[c]);
        }
      });
    } catch (err) {
      console.warn('Failed to load category counts:', err);
    }
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
        showToast('Please pair or connect your phone first before importing files.', 'warning');
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
    if (gallery) gallery.innerHTML = '<div class="op-empty-card"><div class="op-spinner"></div><p>Loading folder…</p></div>';

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
      if (bodyEl) bodyEl.innerHTML = `<video src="${escapeHtml(streamUrl)}" controls autoplay style="max-width: 100%; max-height: 75vh; border-radius: 8px;"></video>`;
    } else if (isImage(item.name)) {
      if (bodyEl) bodyEl.innerHTML = `<img src="${escapeHtml(streamUrl)}" alt="${escapeHtml(item.name)}" style="max-width: 100%; max-height: 75vh; border-radius: 8px;">`;
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
    btnDelLightbox.addEventListener('click', async () => {
      if (currentLightboxItem) {
        const confirmed = await showConfirmModal({
          title: 'Delete Photo',
          message: `Delete "${currentLightboxItem.name}" from phone?`,
          confirmLabel: 'Delete',
          danger: true
        });
        if (confirmed) {
          remoteFsAction('/api/remote-fs/delete', { path: currentLightboxItem.path }).then(() => {
            showToast(`Deleted "${currentLightboxItem.name}"`, 'info');
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
        if (nameEl) nameEl.textContent = data.peer.displayName || 'Connected Device';

        const treeConnected = document.getElementById('op-device-tree-connected');
        if (treeConnected) treeConnected.style.display = 'flex';
        const unconnPrompt = document.getElementById('op-unconnected-prompt');
        if (unconnPrompt) unconnPrompt.style.display = 'none';

        const clipTag = document.getElementById('op-clip-tag');
        if (clipTag) {
          clipTag.textContent = data.clipboardSync ? 'On' : 'Off';
          clipTag.classList.toggle('is-off', !data.clipboardSync);
        }
        const clipBtnText = document.getElementById('btn-hero-clip-text');
        if (clipBtnText) clipBtnText.textContent = data.clipboardSync ? 'Pause sync' : 'Resume sync';
        const liveBadge = document.querySelector('.op-badge-live');
        if (liveBadge) {
          liveBadge.textContent = data.clipboardSync ? 'Syncing' : 'Paused';
          liveBadge.classList.toggle('is-off', !data.clipboardSync);
        }

        if (currentView === 'pair') {
          switchView('files');
        }
      } else {
        connectedLivePeer = null;
        const treeConnected = document.getElementById('op-device-tree-connected');
        if (treeConnected) treeConnected.style.display = 'none';
        const unconnPrompt = document.getElementById('op-unconnected-prompt');
        if (unconnPrompt) unconnPrompt.style.display = 'flex';
        if (currentView === 'files') {
          switchView('pair');
        }
      }
    } catch (err) {
      console.warn('Failed to refresh live status:', err);
    }
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
      if (opProfileUser) opProfileUser.textContent = (data.displayName || 'This PC').replace(/\s*\(PC\)$/i, '');

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
        btnCopyCode.textContent = 'Copied';
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
          <h3>Looking for devices…</h3>
          <p>Open LocalShare on your phone and make sure it's on the same Wi-Fi as this PC.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = peers.map((p) => `
      <div class="op-device-card" data-device-id="${escapeHtml(p.deviceId)}">
        <div class="op-device-avatar-circle">${getPlatformIcon(p.platform)}</div>
        <div class="op-device-meta-info">
          <h4 class="op-device-main-title">${escapeHtml(p.displayName)}</h4>
          <p class="op-device-ip-sub">${escapeHtml(p.address)}:${escapeHtml(String(p.port || 53318))} • ${escapeHtml(p.platform)}</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="op-btn-primary op-btn-sm btn-connect-peer" data-device-id="${escapeHtml(p.deviceId)}">Connect</button>
          <button class="op-btn-secondary op-btn-sm btn-send-peer" data-device-id="${escapeHtml(p.deviceId)}">Send</button>
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
      btnScan.innerHTML = '<span>Scanning…</span>';
      await fetch('/api/scan', { method: 'POST' });
      setTimeout(() => {
        btnScan.disabled = false;
        btnScan.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M12 12l6.4-6.4"/></svg><span>Scan</span>`;
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
      if (countEl) countEl.textContent = history.length === 1 ? '1 item' : `${history.length} items`;

      const listEl = document.getElementById('drawer-clip-list');
      if (!listEl) return;

      if (!history || history.length === 0) {
        listEl.innerHTML = '<p class="op-empty-text">Nothing yet. Copy text on either device and it shows up here.</p>';
        return;
      }

      listEl.innerHTML = history.map((item) => `
        <div class="op-clip-item">
          <span class="op-clip-text">${escapeHtml(item.text)}</span>
          <button class="op-clip-copy-btn" data-clip="${escapeHtml(item.text)}">Copy</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.op-clip-copy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.clip).then(() => {
            const orig = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = orig; }, 1500);
          });
        });
      });
    } catch (err) {
      console.warn('Failed to load clipboard history:', err);
    }
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
        btnSendClipboard.textContent = 'Sent';
        setTimeout(() => { btnSendClipboard.textContent = 'Send to phone'; }, 1500);
      } catch (err) {
        showToast(`Failed to push clipboard: ${err.message}`, 'error');
      }
    });
  }

  // ========================================================
  // FILE TRANSFERS & STREAMING
  // ========================================================

  async function sendFilesDirectlyToPeer(peer, files) {
    if (!peer || !files || files.length === 0) return;
    const getPath = (f) => {
      if (f.path) return f.path;
      if (window.electronAPI && typeof window.electronAPI.getPathForFile === 'function') {
        return window.electronAPI.getPathForFile(f) || '';
      }
      return '';
    };
    const filePayloads = Array.from(files).map((f) => ({
      path: getPath(f),
      name: f.name,
      size: f.size
    }));
    if (filePayloads.some((f) => !f.path)) {
      showToast('Some files could not be read from disk. Try adding them again.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peer, files: filePayloads })
      });
      if (res.ok) {
        switchView('transfers');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(`Couldn't start the transfer: ${data.error || `HTTP ${res.status}`}`, 'error');
      }
    } catch (err) {
      console.error('Send files failed:', err);
      showToast(`Couldn't start the transfer: ${err.message}`, 'error');
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
      showToast(`Saved "${name}" to Downloads/LocalShare`, 'success');
      loadTransfers();
    } catch (err) {
      showToast(`Download failed: ${err.message}`, 'error');
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
      showToast(`Operation failed: ${err.message}`, 'error');
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
            <h3>No transfers yet</h3>
            <p>Files you send or receive show up here with live progress.</p>
          </div>
        `;
        return;
      }

      const rows = transfers.map((t) => {
        const status = String(t.status || '');
        const isDone = status === 'completed';
        const isFailed = status === 'failed' || status === 'rejected' || status === 'cancelled';
        const isActive = !isDone && !isFailed;
        const isReceive = t.direction === 'receive' || String(t.id || '').startsWith('pull-');
        const pct = Math.max(0, Math.min(100, Math.round(Number(t.progress) || 0)));
        const names = Array.isArray(t.files) && t.files.length > 0 ? t.files : ['File'];
        const title = names.length > 1 ? `${names[0]} and ${names.length - 1} more` : names[0];
        let label;
        if (isDone) label = isReceive ? 'Received' : 'Sent';
        else if (isFailed) label = status === 'failed' ? 'Failed' : status.charAt(0).toUpperCase() + status.slice(1);
        else if (status === 'connecting' || status === 'queued' || status === 'pending') label = 'Waiting';
        else label = `${pct}%`;
        const stateClass = isDone ? 'is-done' : isFailed ? 'is-failed' : 'is-active';
        const speed = isActive && Number(t.speed) > 0 ? `<span class="op-meta-sep">·</span><span>${formatBytes(Number(t.speed))}/s</span>` : '';
        const sizes = isDone
          ? formatBytes(Number(t.totalBytes) || 0)
          : `${formatBytes(Number(t.bytesTransferred) || 0)} of ${formatBytes(Number(t.totalBytes) || 0)}`;
        return `
          <div class="op-transfer-row ${stateClass}">
            <div class="op-transfer-icon">${icon(isReceive ? 'download' : 'upload', 16, 2)}</div>
            <div class="op-transfer-main">
              <div class="op-transfer-top">
                <span class="op-transfer-name" title="${escapeHtml(names.join(', '))}">${escapeHtml(title)}</span>
                <span class="op-status-chip ${stateClass}">${escapeHtml(label)}</span>
              </div>
              ${isDone ? '' : `<div class="op-progress"><div class="op-progress-fill" style="width: ${pct}%;"></div></div>`}
              <div class="op-transfer-meta">
                <span>${isReceive ? 'From' : 'To'} ${escapeHtml(t.peer || 'device')}</span>
                <span class="op-meta-sep">·</span>
                <span>${sizes}</span>
                ${speed}
                <span class="op-meta-end">${escapeHtml(formatRelativeTime(t.startTime))}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
      list.innerHTML = `<div class="op-transfer-list">${rows}</div>`;
    } catch (err) {
      console.warn('Failed to load transfers:', err);
    }
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
            <h3>Nothing received yet</h3>
            <p>Files your devices send to this PC are saved here.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = `<div class="op-received-list">${files.map((f) => `
        <div class="op-received-row">
          <div class="op-file-tile">${icon(fileKindIcon(f.name), 16, 1.9)}</div>
          <div class="op-received-info">
            <div class="op-received-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
            <div class="op-received-meta">${formatBytes(f.size)} · ${escapeHtml(formatRelativeTime(f.receivedAt))}</div>
          </div>
          <button class="op-btn-secondary op-btn-sm btn-open-rcvd-file" data-path="${escapeHtml(f.path)}">Show in folder</button>
        </div>
      `).join('')}</div>`;

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
    } catch (err) {
      console.warn('Failed to load received files:', err);
    }
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
        <div class="radar-blip" data-device-id="${escapeHtml(p.deviceId)}" style="position: absolute; transform: translate(${x}px, ${y}px); display: flex; flex-direction: column; align-items: center; cursor: pointer;" title="${escapeHtml(p.displayName)}">
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
            <p style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(peer.address)}:${escapeHtml(String(peer.port || 53318))}</p>
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
      list.innerHTML = '<p style="font-size: 12.5px; color: var(--text-muted);">No devices found yet. Open LocalShare on your phone.</p>';
      return;
    }
    list.innerHTML = peers.map((p) => `
      <button class="op-btn-secondary op-btn-sm recipient-chip" data-device-id="${escapeHtml(p.deviceId)}">
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
      listEl.innerHTML = '<li class="empty-list-notice">No files added yet.</li>';
      updateSendButtonState();
      return;
    }

    listEl.innerHTML = stagedFiles.map((f, idx) => `
      <li class="staged-item">
        <span class="op-file-tile">${icon(fileKindIcon(f.name), 15, 1.9)}</span>
        <span class="staged-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="staged-size">${formatBytes(f.size)}</span>
        <button class="btn-remove-staged" data-idx="${idx}" title="Remove" aria-label="Remove ${escapeHtml(f.name)}">&times;</button>
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
      btnSendFiles.textContent = 'Sending…';
      await sendFilesDirectlyToPeer(selectedPeer, stagedFiles);
      stagedFiles = [];
      renderStagedFiles();
      btnSendFiles.textContent = 'Send';
    });
  }

  // ========================================================
  // PAIRED DEVICES
  // ========================================================

  function platformLabel(platform) {
    switch (platform) {
      case 'android': return 'Android';
      case 'ios': return 'iPhone';
      case 'desktop': return 'Computer';
      default: return 'Device';
    }
  }

  async function loadPairedDevices() {
    const list = document.getElementById('paired-devices-list');
    const toggle = document.getElementById('chk-auto-accept-paired');
    try {
      const res = await fetch('/api/paired-devices');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (toggle) toggle.checked = data.autoAcceptPaired !== false;
      if (!list) return;
      const devices = Array.isArray(data.devices) ? data.devices : [];
      if (devices.length === 0) {
        list.innerHTML = '<p class="op-empty-text">No paired devices yet. Phones you connect show up here.</p>';
        return;
      }
      list.innerHTML = devices.map((d) => `
        <div class="op-paired-row">
          <div class="op-file-tile">${getPlatformIcon(d.platform)}</div>
          <div class="op-received-info">
            <div class="op-received-name">${escapeHtml(d.displayName || 'Unnamed device')}</div>
            <div class="op-received-meta">${escapeHtml(platformLabel(d.platform))} · last seen ${escapeHtml(formatRelativeTime(d.lastSeen))}</div>
          </div>
          <button class="op-btn-secondary op-btn-sm btn-forget-device" data-id="${escapeHtml(d.id)}" data-name="${escapeHtml(d.displayName || 'this device')}">Forget</button>
        </div>
      `).join('');
      list.querySelectorAll('.btn-forget-device').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ok = await showConfirmModal({
            title: `Forget ${btn.dataset.name}?`,
            message: 'It will need your approval, or the pairing code, to connect again.',
            confirmLabel: 'Forget',
            danger: true
          });
          if (!ok) return;
          try {
            const r = await fetch('/api/paired-devices/forget', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: btn.dataset.id })
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            showToast(`Forgot ${btn.dataset.name}`, 'info');
          } catch (err) {
            showToast(`Couldn't forget the device: ${err.message}`, 'error');
          }
          loadPairedDevices();
        });
      });
    } catch (err) {
      console.warn('Failed to load paired devices:', err);
      if (list) list.innerHTML = '<p class="op-empty-text">Couldn\'t load paired devices.</p>';
    }
  }

  const autoAcceptToggle = document.getElementById('chk-auto-accept-paired');
  if (autoAcceptToggle) {
    autoAcceptToggle.addEventListener('change', async () => {
      const wanted = autoAcceptToggle.checked;
      try {
        const r = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoAcceptPaired: wanted })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      } catch (err) {
        autoAcceptToggle.checked = !wanted;
        showToast(`Couldn't save the setting: ${err.message}`, 'error');
      }
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
  // CONNECT WITHOUT WI-FI (BLE handshake + phone hotspot)
  // ========================================================
  // The renderer only moves Bluetooth bytes; the engine does the crypto and the Wi-Fi join
  // (desktop/engine/offline-bootstrap.js, offline-session.js, wifi-join.js).
  const OFFLINE_BLE = {
    service: '6c4c6f63-616c-7368-6172-650000000010',
    info: '6c4c6f63-616c-7368-6172-650000000011',
    hello: '6c4c6f63-616c-7368-6172-650000000012',
    status: '6c4c6f63-616c-7368-6172-650000000013',
    creds: '6c4c6f63-616c-7368-6172-650000000014'
  };
  const OFFLINE_STATUS = { WAITING: 1, READY: 2, DECLINED: 3, ERROR: 4 };
  const OFFLINE_STEPS = ['bluetooth', 'code', 'joining', 'connecting'];
  const OFFLINE_PANES = ['intro', 'picker', 'code', 'progress', 'manual'];
  const modalOffline = document.getElementById('modal-offline');
  const offlineTitle = document.getElementById('offline-title');
  const offlineError = document.getElementById('offline-error');
  const btnOfflinePrimary = document.getElementById('btn-offline-primary');
  const btnOfflineCancel = document.getElementById('btn-offline-cancel');
  const btnOfflineManual = document.getElementById('btn-offline-manual');
  const btnOfflineSettings = document.getElementById('btn-offline-settings');
  let offlinePrimaryAction = null;
  let offlineSettingsUri = '';
  let offlineConnected = false;
  /** @type {null | { cancelled: boolean, device: any }} */
  let offlineBle = null;
  let stopBluetoothDeviceListener = null;

  function dataViewToBase64(view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function offlineApi(path, body) {
    const res = await fetch(path, body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      console.warn(`Offline API ${path} returned no JSON:`, err);
    }
    if (!res.ok) {
      const error = new Error(data.error || `HTTP ${res.status}`);
      error.code = data.code;
      error.settingsUri = data.settingsUri;
      throw error;
    }
    return data;
  }

  function setOfflineButtons({ primary, onPrimary, cancel = 'Cancel', manual = false }) {
    btnOfflinePrimary.style.display = primary ? '' : 'none';
    if (primary) btnOfflinePrimary.textContent = primary;
    offlinePrimaryAction = onPrimary || null;
    btnOfflineCancel.textContent = cancel;
    btnOfflineManual.style.display = manual ? '' : 'none';
  }

  function showOfflinePane(name) {
    OFFLINE_PANES.forEach((pane) => {
      const el = document.getElementById(`offline-${pane}`);
      if (el) el.style.display = pane === name ? '' : 'none';
    });
  }

  function setOfflineError(message, settingsUri) {
    offlineError.textContent = message || '';
    offlineError.style.display = message ? '' : 'none';
    offlineSettingsUri = settingsUri || '';
    btnOfflineSettings.style.display = offlineSettingsUri && window.electronAPI && window.electronAPI.openWindowsSettings ? '' : 'none';
  }

  function markOfflineStep(active) {
    const activeIndex = OFFLINE_STEPS.indexOf(active);
    document.querySelectorAll('.offline-steps li').forEach((li) => {
      const index = OFFLINE_STEPS.indexOf(li.dataset.step);
      li.classList.toggle('done', active === 'done' || index < activeIndex);
      li.classList.toggle('active', index === activeIndex);
    });
  }

  function stopDeviceListener() {
    if (stopBluetoothDeviceListener) {
      stopBluetoothDeviceListener();
      stopBluetoothDeviceListener = null;
    }
  }

  function renderBluetoothDevices(devices) {
    const list = document.getElementById('offline-device-list');
    if (!list) return;
    list.innerHTML = '';
    if (!devices.length) {
      const p = document.createElement('p');
      p.className = 'op-empty-text';
      p.textContent = 'Searching over Bluetooth… Keep the phone on the "Connect a PC" screen.';
      list.appendChild(p);
      return;
    }
    devices.forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'offline-device';
      btn.type = 'button';
      const label = document.createElement('span');
      label.textContent = d.name || 'LocalShare phone';
      const hint = document.createElement('span');
      hint.className = 'op-empty-text';
      hint.textContent = 'Connect';
      btn.appendChild(label);
      btn.appendChild(hint);
      btn.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.selectBluetoothDevice) {
          window.electronAPI.selectBluetoothDevice(d.id);
        }
      });
      list.appendChild(btn);
    });
  }

  function resetOfflineModal() {
    offlineConnected = false;
    offlineTitle.textContent = 'Connect without Wi-Fi';
    setOfflineError('');
    showOfflinePane('intro');
    markOfflineStep('none');
    setOfflineButtons({ primary: 'Search via Bluetooth', onPrimary: startOfflineBluetooth, manual: true });
  }

  function openOfflineModal() {
    if (!offlineConnected) resetOfflineModal();
    modalOffline.classList.add('active');
  }

  /**
   * Subscribe to STATUS, write HELLO, and wait for the phone user's answer.
   * Notifications are used when available; STATUS is also polled because some
   * adapters drop notifications.
   */
  async function waitForPhoneAnswer(statusChar, helloChar, helloBytes, session) {
    let notificationsOn = false;
    let resolveAnswer;
    const answer = new Promise((resolve) => { resolveAnswer = resolve; });
    const onChange = (event) => {
      const value = event.target.value.getUint8(0);
      if (value >= OFFLINE_STATUS.READY) resolveAnswer(value);
    };
    try {
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', onChange);
      notificationsOn = true;
    } catch (err) {
      console.warn('Bluetooth notifications unavailable; polling the phone instead:', err);
    }
    if (typeof helloChar.writeValueWithResponse === 'function') {
      await helloChar.writeValueWithResponse(helloBytes);
    } else {
      await helloChar.writeValue(helloBytes);
    }
    const deadline = Date.now() + 130000;
    try {
      while (Date.now() < deadline) {
        if (session.cancelled) throw new Error('Cancelled');
        const winner = await Promise.race([answer, new Promise((resolve) => setTimeout(() => resolve(0), 2000))]);
        if (winner) return winner;
        try {
          const value = (await statusChar.readValue()).getUint8(0);
          if (value >= OFFLINE_STATUS.READY) return value;
        } catch (err) {
          console.warn('Reading the phone status failed:', err);
        }
      }
      throw new Error('No answer from the phone. Tap Allow on the phone within 2 minutes.');
    } finally {
      if (notificationsOn) {
        statusChar.removeEventListener('characteristicvaluechanged', onChange);
        statusChar.stopNotifications().catch((err) => console.warn('stopNotifications failed:', err));
      }
    }
  }

  async function startOfflineBluetooth() {
    setOfflineError('');
    if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') {
      setOfflineError('Bluetooth is not available on this PC. Use "Enter details" instead.');
      return;
    }
    const session = { cancelled: false, device: null };
    offlineBle = session;
    showOfflinePane('picker');
    renderBluetoothDevices([]);
    setOfflineButtons({ primary: '', manual: false });
    if (window.electronAPI && window.electronAPI.onBluetoothDevices) {
      stopDeviceListener();
      stopBluetoothDeviceListener = window.electronAPI.onBluetoothDevices(renderBluetoothDevices);
    }
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [OFFLINE_BLE.service] }] });
      session.device = device;
      stopDeviceListener();
      showOfflinePane('progress');
      markOfflineStep('bluetooth');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(OFFLINE_BLE.service);
      const infoChar = await service.getCharacteristic(OFFLINE_BLE.info);
      const helloChar = await service.getCharacteristic(OFFLINE_BLE.hello);
      const statusChar = await service.getCharacteristic(OFFLINE_BLE.status);
      const credsChar = await service.getCharacteristic(OFFLINE_BLE.creds);

      const begin = await offlineApi('/api/offline/begin', { info: dataViewToBase64(await infoChar.readValue()) });
      offlineTitle.textContent = `Connecting to ${begin.phone && begin.phone.displayName ? begin.phone.displayName : 'your phone'}`;
      document.getElementById('offline-code-digits').textContent = begin.code;
      showOfflinePane('code');

      const status = await waitForPhoneAnswer(statusChar, helloChar, base64ToBytes(begin.hello), session);
      if (status === OFFLINE_STATUS.DECLINED) throw new Error('The phone declined this PC.');
      if (status !== OFFLINE_STATUS.READY) throw new Error('The phone could not start its hotspot. Check the phone for details.');

      const blob = dataViewToBase64(await credsChar.readValue());
      showOfflinePane('progress');
      markOfflineStep('joining');
      await offlineApi('/api/offline/creds', { blob });
      // The PC is moving to the phone's Wi-Fi; Bluetooth is no longer needed.
      if (device.gatt.connected) device.gatt.disconnect();
    } catch (err) {
      stopDeviceListener();
      if (session.device && session.device.gatt && session.device.gatt.connected) session.device.gatt.disconnect();
      if (session.cancelled) return;
      if (err && err.name === 'NotFoundError') {
        // The chooser was closed without picking a phone.
        resetOfflineModal();
        return;
      }
      const message = err && err.message ? err.message : String(err);
      offlineApi('/api/offline/cancel', { reason: message }).catch((cancelErr) => console.warn('Offline cancel failed:', cancelErr));
      showOfflinePane('intro');
      setOfflineError(message, err && err.settingsUri);
      setOfflineButtons({ primary: 'Try again', onPrimary: startOfflineBluetooth, manual: true, cancel: 'Close' });
    } finally {
      if (offlineBle === session) offlineBle = null;
    }
  }

  function showOfflineManual() {
    setOfflineError('');
    showOfflinePane('manual');
    setOfflineButtons({ primary: 'Connect', onPrimary: submitOfflineManual, manual: false });
  }

  async function submitOfflineManual() {
    const ssid = document.getElementById('offline-ssid').value.trim();
    const password = document.getElementById('offline-password').value;
    const address = document.getElementById('offline-address').value.trim();
    const match = address.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/);
    if (!ssid || !match) {
      setOfflineError('Enter the Wi-Fi name and the phone address exactly as the phone shows them.');
      return;
    }
    setOfflineError('');
    showOfflinePane('progress');
    markOfflineStep('joining');
    setOfflineButtons({ primary: '', manual: false });
    try {
      await offlineApi('/api/offline/manual', { ssid, password, ip: match[1], port: Number(match[2] || 53318) });
    } catch (err) {
      showOfflinePane('manual');
      setOfflineError(err.message, err.settingsUri);
      setOfflineButtons({ primary: 'Connect', onPrimary: submitOfflineManual, manual: false });
    }
  }

  async function cancelOffline() {
    if (offlineBle) {
      offlineBle.cancelled = true;
      if (window.electronAPI && window.electronAPI.selectBluetoothDevice) window.electronAPI.selectBluetoothDevice('');
      const device = offlineBle.device;
      if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
      offlineBle = null;
    }
    stopDeviceListener();
    try {
      if (offlineConnected) {
        await offlineApi('/api/offline/end', {});
        showToast('Disconnected. Your Wi-Fi is being restored.', 'info');
      } else {
        await offlineApi('/api/offline/cancel', {});
      }
    } catch (err) {
      showToast(`Couldn't restore your Wi-Fi: ${err.message}`, 'error');
    }
    offlineConnected = false;
    modalOffline.classList.remove('active');
  }

  /** Engine progress for the join (offline_state events). */
  function handleOfflineState(state) {
    if (!state || !state.step) return;
    const open = modalOffline.classList.contains('active');
    if (state.step === 'joining' || state.step === 'waiting') {
      if (open) {
        showOfflinePane('progress');
        markOfflineStep('joining');
      }
    } else if (state.step === 'connecting') {
      if (open) markOfflineStep('connecting');
    } else if (state.step === 'connected') {
      offlineConnected = true;
      const name = state.phone && state.phone.displayName ? state.phone.displayName : 'your phone';
      offlineTitle.textContent = `Connected to ${name}`;
      showOfflinePane('progress');
      markOfflineStep('done');
      setOfflineError('');
      setOfflineButtons({ primary: 'Done', onPrimary: () => modalOffline.classList.remove('active'), cancel: 'Disconnect' });
      showToast(`Connected to ${name} without Wi-Fi`, 'success');
      updateLiveStatus();
      loadPeers();
    } else if (state.step === 'failed') {
      offlineConnected = false;
      if (open && state.code !== 'ERR_OFFLINE_CANCELLED') {
        showOfflinePane('intro');
        setOfflineError(state.error || 'Connecting without Wi-Fi failed.', state.settingsUri);
        setOfflineButtons({ primary: 'Try again', onPrimary: startOfflineBluetooth, manual: true, cancel: 'Close' });
      } else if (!open && state.error) {
        showToast(state.error, 'error');
      }
    } else if (state.step === 'idle') {
      offlineConnected = false;
    }
  }

  const btnOfflineConnect = document.getElementById('btn-offline-connect');
  if (btnOfflineConnect && modalOffline) {
    btnOfflineConnect.addEventListener('click', openOfflineModal);
    btnOfflinePrimary.addEventListener('click', () => {
      if (offlinePrimaryAction) offlinePrimaryAction();
    });
    btnOfflineCancel.addEventListener('click', cancelOffline);
    btnOfflineManual.addEventListener('click', showOfflineManual);
    btnOfflineSettings.addEventListener('click', () => {
      if (offlineSettingsUri && window.electronAPI && window.electronAPI.openWindowsSettings) {
        window.electronAPI.openWindowsSettings(offlineSettingsUri);
      }
    });
  }

  // ========================================================
  // SSE REAL-TIME SYSTEM EVENTS
  // ========================================================

  function initSSE() {
    const sse = new EventSource('/events');
    sse.addEventListener('offline_state', (e) => {
      try {
        handleOfflineState(JSON.parse(e.data));
      } catch (err) {
        console.warn('Ignoring malformed offline_state event:', err);
      }
    });
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
      } catch (err) {
        console.warn('Ignoring malformed incoming_request event:', err);
      }
    });
    sse.addEventListener('incoming_request_closed', () => hideIncomingRequest());
    sse.addEventListener('paired_devices_changed', () => {
      if (currentView === 'settings') loadPairedDevices();
    });
    sse.addEventListener('transfer_auto_accepted', (e) => {
      try {
        const d = JSON.parse(e.data);
        const count = Number(d.fileCount) || 0;
        showToast(`Receiving ${count === 1 ? '1 file' : `${count} files`} from ${d.senderName || 'a paired device'}`, 'info');
      } catch (err) {
        console.warn('Ignoring malformed transfer_auto_accepted event:', err);
      }
      loadTransfers();
    });
  }

  // Incoming Modal
  const incomingModal = document.getElementById('modal-incoming');
  let activeRequestId = null;

  function showIncomingRequest(req) {
    activeRequestId = req.requestId;
    const sender = req.senderName || 'Nearby Device';
    document.getElementById('incoming-summary').textContent = req.kind === 'connect'
      ? `${sender} wants to connect to this PC. Approving lets it browse and download your files and sync the clipboard.`
      : `${sender} wants to send you ${req.fileCount || 0} file(s) (${formatBytes(req.totalBytes || 0)}).`;

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

  // ========================================================
  // GLOBAL SEARCH & DEVICE SUBNAV TOGGLE
  // ========================================================

  const globalSearchInput = document.getElementById('op-global-search');
  let searchDebounceTimer = null;

  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(async () => {
        if (!q) {
          if (currentView === 'files') {
            loadCategory(activeCategory);
          } else if (currentView === 'transfers') {
            loadTransfers();
          } else if (currentView === 'received') {
            loadReceivedFiles();
          }
          return;
        }

        const peer = connectedLivePeer || (peers.length > 0 ? peers[0] : null);
        if (currentView === 'files' && peer) {
          try {
            const gallery = document.getElementById('op-date-gallery');
            if (gallery) gallery.innerHTML = '<div class="op-empty-card"><div class="op-spinner"></div><p>Searching your phone…</p></div>';
            const res = await fetch(`/api/remote-search?ip=${encodeURIComponent(peer.address)}&port=${peer.port || 53318}&q=${encodeURIComponent(q)}`);
            const data = await res.json();
            const entries = data.entries || [];
            if (gallery) {
              if (entries.length === 0) {
                gallery.innerHTML = `<div class="op-empty-card"><p>No files match "${escapeHtml(q)}"</p><button class="op-btn-secondary op-btn-sm" style="margin-top:10px;" id="btn-clear-search">Clear Search</button></div>`;
                const btnClear = document.getElementById('btn-clear-search');
                if (btnClear) {
                  btnClear.addEventListener('click', () => {
                    globalSearchInput.value = '';
                    loadCategory(activeCategory);
                  });
                }
              } else {
                renderDateGroupedGallery(entries, peer);
              }
            }
          } catch (err) {
            console.error('Remote search error:', err);
          }
        } else if (currentView === 'transfers') {
          const list = document.getElementById('transfers-list');
          if (list) {
            const items = list.querySelectorAll('.op-transfer-card');
            items.forEach((item) => {
              const text = item.textContent.toLowerCase();
              item.style.display = text.includes(q.toLowerCase()) ? 'flex' : 'none';
            });
          }
        } else if (currentView === 'received') {
          const grid = document.getElementById('received-files-grid');
          if (grid) {
            const items = grid.querySelectorAll('.op-received-card');
            items.forEach((item) => {
              const text = item.textContent.toLowerCase();
              item.style.display = text.includes(q.toLowerCase()) ? 'flex' : 'none';
            });
          }
        } else if (currentView === 'radar' || currentView === 'share') {
          const chips = document.querySelectorAll('.recipient-chip, .radar-peer-card');
          chips.forEach((c) => {
            const text = c.textContent.toLowerCase();
            c.style.display = text.includes(q.toLowerCase()) ? '' : 'none';
          });
        }
      }, 300);
    });
  }

  // Device Subnav Collapsible Toggle
  const deviceToggle = document.getElementById('op-device-toggle');
  const deviceSubnav = document.getElementById('op-device-subnav');
  const deviceChevron = document.getElementById('op-device-chevron');

  if (deviceToggle && deviceSubnav) {
    deviceToggle.addEventListener('click', () => {
      const isCollapsed = deviceSubnav.style.display === 'none';
      deviceSubnav.style.display = isCollapsed ? 'flex' : 'none';
      if (deviceChevron) {
        deviceChevron.style.display = 'inline-block';
        deviceChevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
        deviceChevron.style.transition = 'transform 0.2s ease';
      }
    });
  }

  // Initialize
  loadSelfInfo();
  loadPeers();
  initSSE();
  updateLiveStatus();
})();
