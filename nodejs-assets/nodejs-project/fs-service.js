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
 * Report an error that is deliberately not surfaced to the caller (an unreadable
 * entry during a scan, a drive that cannot be probed). Printed only when
 * LOCALSHARE_DEBUG is set so normal scans stay quiet.
 * @param {string} context
 * @param {any} err
 */
function logIgnored(context, err) {
  if (process.env.LOCALSHARE_DEBUG) {
    console.warn(`[fs-service] ${context}:`, err && err.message ? err.message : err);
  }
}

/**
 * Resolve a path through symlinks/junctions so a containment check cannot be
 * bypassed by a link that points outside a shared root. Paths that do not exist
 * yet (a copy destination) are resolved through their nearest existing ancestor.
 * @param {string} p
 * @returns {string}
 */
function canonicalPath(p) {
  const absolute = path.resolve(p);
  let current = absolute;
  const tail = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(current);
      return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
    } catch (err) {
      const parent = path.dirname(current);
      if (parent === current) {
        logIgnored(`realpath ${absolute}`, err);
        return absolute;
      }
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * True when `child` is `parent` or lies underneath it.
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * True when `targetPath` lies inside at least one of `allowedRoots`.
 * Without roots there is no restriction (local callers such as unit tests);
 * network-facing callers must always pass them.
 * @param {string} targetPath
 * @param {string[]} [allowedRoots]
 * @returns {boolean}
 */
function isPathAllowed(targetPath, allowedRoots) {
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) return true;
  const target = canonicalPath(targetPath);
  return allowedRoots.some((root) => Boolean(root) && isInside(target, canonicalPath(root)));
}

/**
 * Throw an EOUTSIDEROOT error when `targetPath` is outside the shared roots.
 * @param {string} targetPath
 * @param {string[]} [allowedRoots]
 */
function assertPathAllowed(targetPath, allowedRoots) {
  if (!isPathAllowed(targetPath, allowedRoots)) {
    throw Object.assign(new Error('Path is outside the shared folders'), { code: 'EOUTSIDEROOT' });
  }
}

/**
 * Turn a sender-supplied file name into one safe path segment: no directory
 * parts, no reserved Windows characters, never "." or "..".
 * @param {any} name
 * @param {string} fallback
 * @returns {string}
 */
function sanitizeFileName(name, fallback) {
  const raw = typeof name === 'string' ? name : '';
  const last = raw.replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = last.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned;
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
    } catch (err) {
      logIgnored(`probe drive ${drive}`, err);
    }
  }
  return drives;
}

/**
 * Root paths of every available drive (or "/" on Unix).
 * @returns {string[]}
 */
function getDriveRoots() {
  return getAvailableDrives().map((drive) => drive.path);
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
    } catch (err) {
      logIgnored(`stat quick folder ${item.path}`, err);
    }
  }
  return folders;
}

/**
 * Normalize a client-supplied path against the browsing root.
 * Relative paths resolve against the root. When `allowedRoots` is given the
 * result must lie inside one of them, otherwise an EOUTSIDEROOT error is thrown.
 * @param {string} rootDir
 * @param {string} requestedPath
 * @param {string[]} [allowedRoots]
 * @returns {string}
 */
function resolvePath(rootDir, requestedPath, allowedRoots) {
  if (requestedPath === '__ROOT__' || requestedPath === 'ROOT') {
    return '__ROOT__';
  }
  const root = rootDir || getDefaultRoot();
  const target = requestedPath ? path.resolve(root, requestedPath) : path.resolve(root);
  assertPathAllowed(target, allowedRoots);
  return target;
}

/**
 * List a directory, sorting directories first (A-Z) then files (A-Z).
 * Supports the '__ROOT__' virtual root (drives + quick folders) when drives are
 * shared; otherwise '__ROOT__' is the browse root itself.
 * @param {string} rootDir
 * @param {string} requestedPath
 * @param {{ allowedRoots?: string[], exposeDrives?: boolean }} [options]
 * @returns {{ currentPath: string, parentPath: string|null, entries: Array<object> }}
 */
function listDirectory(rootDir, requestedPath, options = {}) {
  const allowedRoots = options.allowedRoots;
  const restricted = Array.isArray(allowedRoots) && allowedRoots.length > 0;
  const exposeDrives = !restricted || options.exposeDrives === true;
  let requested = requestedPath;

  const wantsVirtualRoot = requested === '__ROOT__' || requested === 'ROOT' || (!rootDir && !requested);
  if (wantsVirtualRoot) {
    if (exposeDrives) {
      const drives = getAvailableDrives();
      const quick = getQuickFolders().filter((item) => isPathAllowed(item.path, allowedRoots));
      return {
        currentPath: '__ROOT__',
        parentPath: null,
        entries: [...drives, ...quick]
      };
    }
    requested = '';
  }

  const root = rootDir || getDefaultRoot();
  const currentPath = resolvePath(root, requested, allowedRoots);
  const stat = fs.statSync(currentPath);
  if (!stat.isDirectory()) {
    throw new Error('Requested path is not a directory');
  }

  const names = fs.readdirSync(currentPath);
  const entries = names.map((name) => {
    const fullPath = path.join(currentPath, name);
    let entryStat = null;
    try {
      entryStat = fs.statSync(fullPath);
    } catch (err) {
      logIgnored(`stat ${fullPath}`, err);
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

  const resolvedCurrent = path.resolve(currentPath);
  const isDriveRoot = path.parse(resolvedCurrent).root === resolvedCurrent;
  const isCustomRoot = Boolean(rootDir) && resolvedCurrent === path.resolve(rootDir);

  let parentPath = null;
  if (isDriveRoot) {
    parentPath = exposeDrives ? '__ROOT__' : null;
  } else if (!isCustomRoot) {
    const parent = path.dirname(resolvedCurrent);
    parentPath = isPathAllowed(parent, allowedRoots) ? parent : null;
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
 * @param {string} [destinationPath]
 * @param {string[]} [allowedRoots] - When given, source and destination must both lie inside these roots.
 * @returns {string} The new path.
 */
function copyEntry(sourcePath, destinationPath, allowedRoots) {
  if (!sourcePath || typeof sourcePath !== 'string') {
    throw new Error('Missing sourcePath');
  }
  const source = path.resolve(sourcePath);
  assertPathAllowed(source, allowedRoots);
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
  assertPathAllowed(destination, allowedRoots);

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    if (isInside(destination, source)) {
      throw new Error('Cannot copy a folder into itself');
    }
    fs.cpSync(source, destination, { recursive: true });
  } else {
    fs.copyFileSync(source, destination);
  }
  return destination;
}

/**
 * Delete a file or directory recursively.
 * @param {string} targetPath
 * @param {string[]} [allowedRoots] - When given, the target must lie inside, and not be, one of these roots.
 * @returns {string} The deleted path.
 */
function deleteEntry(targetPath, allowedRoots) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Missing path');
  }
  const target = path.resolve(targetPath);
  assertPathAllowed(target, allowedRoots);
  if (path.parse(target).root === target) {
    throw Object.assign(new Error('Refusing to delete a drive root'), { code: 'EOUTSIDEROOT' });
  }
  if (Array.isArray(allowedRoots)) {
    const canonicalTarget = canonicalPath(target);
    if (allowedRoots.some((root) => Boolean(root) && canonicalPath(root) === canonicalTarget)) {
      throw Object.assign(new Error('Refusing to delete a shared root folder'), { code: 'EOUTSIDEROOT' });
    }
  }
  if (!fs.existsSync(target)) {
    throw new Error(`Path does not exist: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  return target;
}

const CATEGORY_EXTENSIONS = {
  photos: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif']),
  images: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif']),
  videos: new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.3gp']),
  audio: new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']),
  documents: new Set(['.pdf', '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.json', '.xml', '.html', '.js', '.ts']),
  archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso']),
  apks: new Set(['.apk', '.xapk'])
};

/**
 * Comparable form of a folder path (case-insensitive on Windows).
 * @param {string} p
 * @returns {string}
 */
function dirKey(p) {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Scan directory recursively up to a depth limit, gathering files matching a predicate.
 * Folders whose dirKey is in `excluded` are skipped entirely.
 */
function walkFiles(dir, predicate, maxDepth = 4, currentDepth = 0, results = [], maxResults = 150, excluded = null) {
  if (currentDepth > maxDepth || results.length >= maxResults) return results;
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    logIgnored(`read ${dir}`, err);
    return results;
  }
  for (const name of names) {
    if (results.length >= maxResults) break;
    if (name.startsWith('.') || name === 'node_modules' || name === '$RECYCLE.BIN' || name === 'System Volume Information') continue;
    const fullPath = path.join(dir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (excluded && excluded.has(dirKey(fullPath))) continue;
        walkFiles(fullPath, predicate, maxDepth, currentDepth + 1, results, maxResults, excluded);
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
    } catch (err) {
      logIgnored(`stat ${fullPath}`, err);
    }
  }
  return results;
}

/**
 * List files by smart category (photos, videos, documents, downloads, audio).
 * @param {string} type
 * @param {number} [limit=60]
 * @param {number} [offset=0]
 * @param {string} [rootDir]
 * @param {{ excludeDirs?: string[] }} [options] - Folders left out of every category except
 *   'downloads' (e.g. the folder holding files received from the phone, so the phone's
 *   own photos aren't shown back to it as this device's media).
 * @returns {{ type: string, total: number, offset: number, limit: number, entries: Array<object> }}
 */
function listCategory(type = 'photos', limit = 60, offset = 0, rootDir = null, options = {}) {
  const home = rootDir || getDefaultRoot();
  let searchRoots = [];

  if (type === 'downloads') {
    searchRoots = [path.join(home, 'Downloads'), path.join(home, 'Downloads', 'LocalShare')];
  } else if (type === 'photos' || type === 'images') {
    searchRoots = [path.join(home, 'Pictures'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'videos') {
    searchRoots = [path.join(home, 'Videos'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'audio') {
    searchRoots = [path.join(home, 'Music'), path.join(home, 'Downloads')];
  } else if (type === 'documents') {
    searchRoots = [path.join(home, 'Documents'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'archives' || type === 'apks') {
    searchRoots = [path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  } else if (type === 'recent') {
    searchRoots = [path.join(home, 'Downloads'), path.join(home, 'Pictures'), path.join(home, 'Desktop'), path.join(home, 'Documents')];
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

  const excluded = type !== 'downloads' && Array.isArray(options.excludeDirs) && options.excludeDirs.length > 0
    ? new Set(options.excludeDirs.filter(Boolean).map(dirKey))
    : null;

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    if (excluded && excluded.has(dirKey(root))) continue;
    const found = walkFiles(root, predicate, 3, 0, [], 120, excluded);
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
  } catch (err) {
    logIgnored('statfs', err);
  }

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
  getDriveRoots,
  isPathAllowed,
  sanitizeFileName,
  uniquePath,
  resolvePath,
  listDirectory,
  copyEntry,
  deleteEntry,
  listCategory,
  searchFiles,
  getTelemetry
};
