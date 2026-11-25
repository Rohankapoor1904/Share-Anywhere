/**
 * Vector icon geometry for the LocalShare design system.
 *
 * Every icon is described as pure data on a 24x24 grid so it can be unit tested
 * without a renderer. Shape descriptors are rendered by `Icon.js` using
 * react-native-svg primitives.
 *
 * @typedef {{ t: 'path', d: string }} PathShape
 * @typedef {{ t: 'rect', x: number, y: number, width: number, height: number, rx?: number }} RectShape
 * @typedef {{ t: 'circle', cx: number, cy: number, r: number }} CircleShape
 * @typedef {{ t: 'line', x1: number, y1: number, x2: number, y2: number }} LineShape
 * @typedef {{ t: 'polyline', points: string }} PolylineShape
 * @typedef {PathShape | RectShape | CircleShape | LineShape | PolylineShape} IconShape
 */

/** @type {Record<string, IconShape[]>} */
export const ICON_PATHS = {
  // Navigation
  devices: [
    { t: 'rect', x: 2, y: 6, width: 8, height: 15, rx: 2 },
    { t: 'path', d: 'M6 17.5h.01' },
    { t: 'rect', x: 13, y: 4, width: 9, height: 7, rx: 1.5 },
    { t: 'path', d: 'M17.5 11v4' },
    { t: 'path', d: 'M15 16.5h5' }
  ],
  radar: [
    { t: 'circle', cx: 12, cy: 12, r: 2 },
    { t: 'path', d: 'M12 12l6.4-6.4' },
    { t: 'path', d: 'M12 6.5a5.5 5.5 0 0 1 5.5 5.5' },
    { t: 'path', d: 'M12 2.8a9.2 9.2 0 0 1 9.2 9.2' }
  ],
  share: [
    { t: 'path', d: 'M22 2L11 13' },
    { t: 'path', d: 'M22 2l-7 20-4-9-9-4 20-7z' }
  ],
  files: [
    { t: 'path', d: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { t: 'path', d: 'M8 12.5h8' },
    { t: 'path', d: 'M8 16h5' }
  ],
  transfers: [
    { t: 'path', d: 'M3 8.5l4-4 4 4' },
    { t: 'path', d: 'M7 4.5v9' },
    { t: 'path', d: 'M21 15.5l-4 4-4-4' },
    { t: 'path', d: 'M17 19.5v-9' }
  ],
  received: [
    { t: 'path', d: 'M22 12h-6l-2 3h-4l-2-3H2' },
    { t: 'path', d: 'M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z' }
  ],
  settings: [
    { t: 'path', d: 'M4 21v-7' },
    { t: 'path', d: 'M4 10V3' },
    { t: 'path', d: 'M12 21v-9' },
    { t: 'path', d: 'M12 8V3' },
    { t: 'path', d: 'M20 21v-5' },
    { t: 'path', d: 'M20 12V3' },
    { t: 'path', d: 'M1.5 14h5' },
    { t: 'path', d: 'M9.5 8h5' },
    { t: 'path', d: 'M17.5 16h5' }
  ],

  // Platforms
  android: [
    { t: 'path', d: 'M6 10.5a6 6 0 0 1 12 0v5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 15.5z' },
    { t: 'path', d: 'M8.4 5.2L6.7 2.6' },
    { t: 'path', d: 'M15.6 5.2l1.7-2.6' },
    { t: 'path', d: 'M9.6 10.4h.01' },
    { t: 'path', d: 'M14.4 10.4h.01' }
  ],
  desktop: [
    { t: 'rect', x: 2, y: 4, width: 20, height: 13, rx: 2 },
    { t: 'path', d: 'M8 21h8' },
    { t: 'path', d: 'M12 17v4' }
  ],
  ios: [
    { t: 'path', d: 'M16.4 12.7c0-1.9 1.5-2.8 1.6-2.9-.9-1.3-2.3-1.5-2.8-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.1 1.9-1.4 2.3-.4 5.8.9 7.7.7.9 1.4 2 2.4 1.9 1 0 1.3-.6 2.5-.6s1.5.6 2.5.6 1.7-.9 2.3-1.8c.7-1.1 1-2.1 1-2.2-.1 0-1.9-.8-1.9-3.1z' },
    { t: 'path', d: 'M14.3 6.6c.5-.6.9-1.5.8-2.4-.8 0-1.8.5-2.4 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.5 2.4-1.2z' }
  ],
  localsend: [
    { t: 'path', d: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z' }
  ],

  // File types
  image: [
    { t: 'rect', x: 3, y: 3, width: 18, height: 18, rx: 2.5 },
    { t: 'circle', cx: 8.5, cy: 8.5, r: 1.6 },
    { t: 'path', d: 'M21 15.5l-4.5-4.5L5.5 22' }
  ],
  video: [
    { t: 'rect', x: 2, y: 6, width: 14, height: 12, rx: 2.5 },
    { t: 'path', d: 'M16 10.5l6-3.2v9.4l-6-3.2z' }
  ],
  audio: [
    { t: 'path', d: 'M9 18V5.5l12-2V16' },
    { t: 'circle', cx: 6, cy: 18, r: 3 },
    { t: 'circle', cx: 18, cy: 16, r: 3 }
  ],
  document: [
    { t: 'path', d: 'M14 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V8z' },
    { t: 'path', d: 'M14 2v6h6' },
    { t: 'path', d: 'M8 13h8' },
    { t: 'path', d: 'M8 17h5' }
  ],
  archive: [
    { t: 'rect', x: 2, y: 3.5, width: 20, height: 5, rx: 1.5 },
    { t: 'path', d: 'M4 8.5v10A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-10' },
    { t: 'path', d: 'M10 13h4' }
  ],
  code: [
    { t: 'path', d: 'M16 18l6-6-6-6' },
    { t: 'path', d: 'M8 6l-6 6 6 6' }
  ],
  folder: [
    { t: 'path', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }
  ],
  file: [
    { t: 'path', d: 'M13 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V9z' },
    { t: 'path', d: 'M13 2v7h7' }
  ],

  // Actions
  qr: [
    { t: 'rect', x: 3, y: 3, width: 7, height: 7, rx: 1.5 },
    { t: 'rect', x: 14, y: 3, width: 7, height: 7, rx: 1.5 },
    { t: 'rect', x: 3, y: 14, width: 7, height: 7, rx: 1.5 },
    { t: 'path', d: 'M14 14h3.5v3.5H14z' },
    { t: 'path', d: 'M21 14v3' },
    { t: 'path', d: 'M21 21h-3.5' },
    { t: 'path', d: 'M17 21h-.5' }
  ],
  scan: [
    { t: 'path', d: 'M3 7.5V5a2 2 0 0 1 2-2h2.5' },
    { t: 'path', d: 'M16.5 3H19a2 2 0 0 1 2 2v2.5' },
    { t: 'path', d: 'M21 16.5V19a2 2 0 0 1-2 2h-2.5' },
    { t: 'path', d: 'M7.5 21H5a2 2 0 0 1-2-2v-2.5' },
    { t: 'path', d: 'M3.5 12h17' }
  ],
  plus: [
    { t: 'path', d: 'M12 5v14' },
    { t: 'path', d: 'M5 12h14' }
  ],
  close: [
    { t: 'path', d: 'M18 6L6 18' },
    { t: 'path', d: 'M6 6l12 12' }
  ],
  check: [
    { t: 'path', d: 'M20 6L9 17l-5-5' }
  ],
  copy: [
    { t: 'rect', x: 9, y: 9, width: 12, height: 12, rx: 2 },
    { t: 'path', d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }
  ],
  trash: [
    { t: 'path', d: 'M3 6h18' },
    { t: 'path', d: 'M8 6V4.2A1.2 1.2 0 0 1 9.2 3h5.6A1.2 1.2 0 0 1 16 4.2V6' },
    { t: 'path', d: 'M19 6l-.9 13.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 6' },
    { t: 'path', d: 'M10 11v6' },
    { t: 'path', d: 'M14 11v6' }
  ],
  eye: [
    { t: 'path', d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z' },
    { t: 'circle', cx: 12, cy: 12, r: 3 }
  ],
  download: [
    { t: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { t: 'path', d: 'M7 10l5 5 5-5' },
    { t: 'path', d: 'M12 15V3' }
  ],
  upload: [
    { t: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { t: 'path', d: 'M17 8l-5-5-5 5' },
    { t: 'path', d: 'M12 3v12' }
  ],
  shield: [
    { t: 'path', d: 'M12 22s8-4 8-10V5.5l-8-3-8 3V12c0 6 8 10 8 10z' },
    { t: 'path', d: 'M9 12l2.2 2.2L15.5 10' }
  ],
  'arrow-up': [
    { t: 'path', d: 'M12 19V5' },
    { t: 'path', d: 'M6 11l6-6 6 6' }
  ],
  'arrow-right': [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'M13 6l6 6-6 6' }
  ],
  'chevron-right': [
    { t: 'path', d: 'M9 6l6 6-6 6' }
  ],
  refresh: [
    { t: 'path', d: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1' },
    { t: 'path', d: 'M21 3.5V9h-5.5' }
  ],
  clipboard: [
    { t: 'rect', x: 8, y: 2, width: 8, height: 4, rx: 1.5 },
    { t: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }
  ],
  search: [
    { t: 'circle', cx: 11, cy: 11, r: 7 },
    { t: 'path', d: 'M20.5 20.5L16.2 16.2' }
  ],
  lock: [
    { t: 'rect', x: 4, y: 10, width: 16, height: 11.5, rx: 2.5 },
    { t: 'path', d: 'M8 10V7a4 4 0 0 1 8 0v3' }
  ],
  alert: [
    { t: 'path', d: 'M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' },
    { t: 'path', d: 'M12 9.5v4' },
    { t: 'path', d: 'M12 17.3h.01' }
  ],
  play: [
    { t: 'path', d: 'M7 4.5l13 7.5-13 7.5z' }
  ],
  pause: [
    { t: 'path', d: 'M9 4.5v15' },
    { t: 'path', d: 'M15 4.5v15' }
  ],
  wifi: [
    { t: 'path', d: 'M4.5 12.5a10.5 10.5 0 0 1 15 0' },
    { t: 'path', d: 'M8 16a5.5 5.5 0 0 1 8 0' },
    { t: 'path', d: 'M12 19.8h.01' }
  ],
  activity: [
    { t: 'path', d: 'M22 12h-4l-3 8.5L9 3.5 6 12H2' }
  ],
  link: [
    { t: 'path', d: 'M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2' },
    { t: 'path', d: 'M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2' }
  ]
};

/** All available icon names, used by tests to guarantee coverage. */
export const ICON_NAMES = Object.keys(ICON_PATHS);

/**
 * Map a file name to a file-type icon name.
 * @param {string} [fileName]
 * @returns {string}
 */
export function fileTypeIcon(fileName) {
  const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'].includes(ext)) return 'audio';
  if (['zip', 'rar', 'tar', 'gz', '7z', 'xz', 'bz2'].includes(ext)) return 'archive';
  if (['js', 'jsx', 'ts', 'tsx', 'json', 'py', 'kt', 'java', 'c', 'cpp', 'go', 'rs', 'sh', 'html', 'css'].includes(ext)) return 'code';
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) return 'document';
  return 'file';
}

/**
 * Map a MIME type to a file-type icon name.
 * @param {string} [mimeType]
 * @returns {string}
 */
export function mimeTypeIcon(mimeType) {
  const mime = String(mimeType || '');
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  if (mime.startsWith('text/') || mime === 'application/json') return 'document';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'archive';
  return 'file';
}
