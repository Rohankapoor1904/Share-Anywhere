const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Remote filesystem service implementing the /v1/fs/* wire protocol on the PC.
 * All operations touch the real local filesystem.
 */

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.js': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.xml': 'text/plain; charset=utf-8'
};

/**
 * Resolve the MIME type for a file path.
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * The default browsing root for this platform.
 * @returns {string}
 */
function getDefaultRoot() {
  return os.homedir();
}

/**
 * Get available drive letters on Windows or root on Unix.
 * @returns {Array<object>}
 */
function getAvailableDrives() {
  if (process.platform !== 'win32') {
    return [{
      name: 'Root (/)',
      path: '/',
      isDirectory: true,
      size: 0,
      lastModified: 0,
      mimeType: 'inode/directory'
    }];
  }
  const drives = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    const drive = `${letter}:\\`;
    try {
      if (fs.existsSync(drive)) {
        drives.push({
          name: `Drive (${letter}:)`,
          path: drive,
          isDirectory: true,
          size: 0,
          lastModified: 0,
          mimeType: 'inode/directory'
        });
      }
    } catch (_) {}
  }
  return drives;
}

/**
 * Get well-known user directories (Desktop, Downloads, Documents, etc.).
 * @returns {Array<object>}
 */
function getQuickFolders() {
  const home = os.homedir();
  const list = [
    { name: 'Desktop', path: path.join(home, 'Desktop') },
    { name: 'Downloads', path: path.join(home, 'Downloads') },
    { name: 'Documents', path: path.join(home, 'Documents') },
    { name: 'Pictures', path: path.join(home, 'Pictures') },
    { name: 'Videos', path: path.join(home, 'Videos') },
    { name: 'LocalShare', path: path.join(home, 'Downloads', 'LocalShare') }
  ];
  const folders = [];
  for (const item of list) {
    try {
      if (fs.existsSync(item.path)) {
        const stat = fs.statSync(item.path);
        if (stat.isDirectory()) {
          folders.push({
            name: item.name,
            path: item.path,
            isDirectory: true,
            size: 0,
            lastModified: stat.mtimeMs,
            mimeType: 'inode/directory'
          });
        }
      }
    } catch (_) {}
  }
  return folders;
}

/**
 * Normalize a client-supplied path against the browsing root.
 * @param {string} rootDir
 * @param {string} requestedPath
 * @returns {string}
 */
function resolvePath(rootDir, requestedPath) {
  if (requestedPath === '__ROOT__' || requestedPath === 'ROOT') {
    return '__ROOT__';
  }
  const root = rootDir || getDefaultRoot();
  if (!requestedPath) return path.resolve(root);
  return path.resolve(requestedPath);
}

/**
 * List a directory, sorting directories first (A-Z) then files (A-Z).
 * Supports '__ROOT__' virtual root for multi-drive and quick-folder browsing.
 * @param {string} rootDir
 * @param {string} requestedPath
 * @returns {{ currentPath: string, parentPath: string|null, entries: Array<object> }}
 */
function listDirectory(rootDir, requestedPath) {
  // Virtual root for drives and common quick folders
  if (requestedPath === '__ROOT__' || requestedPath === 'ROOT' || (!rootDir && !requestedPath)) {
    const drives = getAvailableDrives();
    const quick = getQuickFolders();
    const entries = [...drives, ...quick];
    return {
      currentPath: '__ROOT__',
      parentPath: null,
      entries
    };
  }

  const root = rootDir || getDefaultRoot();
  const currentPath = resolvePath(root, requestedPath);
  const stat = fs.statSync(currentPath);
  if (!stat.isDirectory()) {
    throw new Error('Requested path is not a directory');
  }

  const names = fs.readdirSync(currentPath);
  const entries = names.map((name) => {
    const fullPath = path.join(currentPath, name);
    let entryStat;
    try {
      entryStat = fs.statSync(fullPath);
    } catch (err) {
      entryStat = null;
    }
    return {
      name,
      path: fullPath,
      isDirectory: entryStat ? entryStat.isDirectory() : false,
      size: entryStat && entryStat.isFile() ? entryStat.size : 0,
      lastModified: entryStat ? entryStat.mtimeMs : 0,
      mimeType: entryStat && entryStat.isDirectory() ? 'inode/directory' : getMimeType(fullPath)
    };
  });

  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const parsed = path.parse(path.resolve(currentPath));
  const isDriveRoot = parsed.root === path.resolve(currentPath);
  const isCustomRoot = rootDir && path.resolve(currentPath) === path.resolve(rootDir);

  let parentPath = null;
  if (isDriveRoot) {
    parentPath = '__ROOT__';
  } else if (!isCustomRoot) {
    parentPath = path.dirname(currentPath);
  }

  return {
    currentPath,
    parentPath,
    entries
  };
}

/**
 * Build a unique destination path that does not yet exist.
 * @param {string} candidate
 * @returns {string}
 */
function uniquePath(candidate) {
  if (!fs.existsSync(candidate)) return candidate;
  const dir = path.dirname(candidate);
  const ext = path.extname(candidate);
  const base = path.basename(candidate, ext);
  let counter = 2;
  let next = path.join(dir, `${base} (${counter})${ext}`);
  while (fs.existsSync(next)) {
    counter += 1;
    next = path.join(dir, `${base} (${counter})${ext}`);
  }
  return next;
}

/**
 * Copy a file or directory recursively.
 * @param {string} sourcePath
 * @param {string} destinationPath
 * @returns {string} The new path.
 */
function copyEntry(sourcePath, destinationPath) {
  const source = path.resolve(sourcePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Source does not exist: ${source}`);
  }

  let destination;
  if (!destinationPath || path.resolve(destinationPath) === source) {
    const dir = path.dirname(source);
    const ext = path.extname(source);
    const base = path.basename(source, ext);
    destination = uniquePath(path.join(dir, `${base} (Copy)${ext}`));
  } else {
    destination = uniquePath(path.resolve(destinationPath));
  }

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, destination, { recursive: true });
  } else {
    fs.copyFileSync(source, destination);
  }
  return destination;
}

/**
 * Delete a file or directory recursively.
 * @param {string} targetPath
 * @returns {string} The deleted path.
 */
function deleteEntry(targetPath) {
  const target = path.resolve(targetPath);
  if (!fs.existsSync(target)) {
    throw new Error(`Path does not exist: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  return target;
}

const CATEGORY_EXTENSIONS = {
  photos: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']),
  videos: new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v']),
  audio: new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']),
  documents: new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.json', '.xml', '.html', '.js', '.ts'])
};

/**
 * Scan directory recursively up to a depth limit, gathering files matching a predicate.
 */
function walkFiles(dir, predicate, maxDepth = 4, currentDepth = 0, results = [], maxResults = 150) {
  if (currentDepth > maxDepth || results.length >= maxResults) return results;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (_) {
    return results;
  }
  for (const name of names) {
    if (results.length >= maxResults) break;
    if (name.startsWith('.') || name === 'node_modules' || name === '$RECYCLE.BIN' || name === 'System Volume Information') continue;
    const fullPath = path.join(dir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkFiles(fullPath, predicate, maxDepth, currentDepth + 1, results, maxResults);
      } else if (stat.isFile() && predicate(name, fullPath, stat)) {
        results.push({
          name,
          path: fullPath,
          isDirectory: false,
          size: stat.size,
          lastModified: stat.mtimeMs,
          mimeType: getMimeType(fullPath)
        });
      }
    } catch (_) {}
  }
  return results;
}

/**
 * List files by smart category (photos, videos, documents, downloads, audio).
 * @param {string} type
 * @param {number} [limit=60]
 * @param {number} [offset=0]
 * @param {string} [rootDir]
 * @returns {{ type: string, total: number, offset: number, limit: number, entries: Array<object> }}
 */
function listCategory(type = 'photos', limit = 60, offset = 0, rootDir = null) {
  const home = rootDir || getDefaultRoot();
  let searchRoots = [];

  if (type === 'downloads') {
    searchRoots = [path.join(home, 'Downloads'), path.join(home, 'Downloads', 'LocalShare')];
  } else if (type === 'photos') {
    searchRoots = [path.join(home, 'Pictures'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'videos') {
    searchRoots = [path.join(home, 'Videos'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'audio') {
    searchRoots = [path.join(home, 'Music'), path.join(home, 'Downloads')];
  } else if (type === 'documents') {
    searchRoots = [path.join(home, 'Documents'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else {
    searchRoots = [home];
  }

  const exts = CATEGORY_EXTENSIONS[type];
  const predicate = (name) => {
    if (type === 'downloads') return true;
    if (!exts) return true;
    const ext = path.extname(name).toLowerCase();
    return exts.has(ext);
  };

  const allEntries = [];
  const seenPaths = new Set();

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    const found = walkFiles(root, predicate, 3, 0, [], 120);
    for (const item of found) {
      if (!seenPaths.has(item.path)) {
        seenPaths.add(item.path);
        allEntries.push(item);
      }
    }
  }

  allEntries.sort((a, b) => b.lastModified - a.lastModified);
  const paged = allEntries.slice(offset, offset + limit);

  return {
    type,
    total: allEntries.length,
    offset,
    limit,
    entries: paged
  };
}

/**
 * Fast search files by filename across common user directories.
 * @param {string} query
 * @param {number} [limit=50]
 * @param {number} [maxDepth=4]
 * @param {string} [rootDir]
 * @returns {Array<object>}
 */
function searchFiles(query = '', limit = 50, maxDepth = 4, rootDir = null) {
  if (!query || typeof query !== 'string') return [];
  const q = query.toLowerCase().trim();
  const home = rootDir || getDefaultRoot();
  const searchRoots = [
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(home, 'Documents'),
    path.join(home, 'Pictures'),
    path.join(home, 'Videos')
  ];

  const results = [];
  const seenPaths = new Set();
  const predicate = (name) => name.toLowerCase().includes(q);

  for (const root of searchRoots) {
    if (results.length >= limit) break;
    if (!fs.existsSync(root)) continue;
    const found = walkFiles(root, predicate, maxDepth, 0, [], limit - results.length);
    for (const item of found) {
      if (!seenPaths.has(item.path)) {
        seenPaths.add(item.path);
        results.push(item);
        if (results.length >= limit) break;
      }
    }
  }

  results.sort((a, b) => b.lastModified - a.lastModified);
  return results;
}

/**
 * Get system telemetry: disk storage, memory, platform, hostname.
 * @returns {object}
 */
function getTelemetry() {
  const home = getDefaultRoot();
  let freeStorage = 0;
  let totalStorage = 0;
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(home);
      freeStorage = Number(s.bfree) * Number(s.bsize);
      totalStorage = Number(s.blocks) * Number(s.bsize);
    }
  } catch (_) {}

  const memTotal = os.totalmem();
  const memFree = os.freemem();

  return {
    platform: process.platform,
    hostname: os.hostname(),
    deviceModel: `${os.type()} ${os.arch()}`,
    storage: {
      freeBytes: freeStorage,
      totalBytes: totalStorage
    },
    memory: {
      freeBytes: memFree,
      totalBytes: memTotal
    },
    battery: {
      level: 100,
      charging: true,
      hasBattery: false
    }
  };
}

module.exports = {
  getMimeType,
  getDefaultRoot,
  resolvePath,
  listDirectory,
  copyEntry,
  deleteEntry,
  listCategory,
  searchFiles,
  getTelemetry
};
