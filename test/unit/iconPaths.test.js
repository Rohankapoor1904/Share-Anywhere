import { ICON_PATHS, ICON_NAMES, fileTypeIcon, mimeTypeIcon } from '../../src/components/iconPaths';

const REQUIRED_ICONS = [
  // Navigation
  'devices', 'radar', 'share', 'files', 'transfers', 'received', 'settings',
  // Platforms
  'android', 'desktop', 'ios', 'localsend',
  // File types
  'image', 'video', 'audio', 'document', 'archive', 'code', 'folder', 'file',
  // Actions
  'qr', 'scan', 'plus', 'close', 'check', 'copy', 'trash', 'eye', 'download',
  'upload', 'shield', 'arrow-up', 'refresh', 'clipboard', 'search'
];

const VALID_SHAPE_TYPES = ['path', 'rect', 'circle', 'line', 'polyline'];

describe('Vector icon set (Phase 1)', () => {
  test('exposes every icon required by the design spec', () => {
    REQUIRED_ICONS.forEach((name) => {
      expect(ICON_PATHS).toHaveProperty(name);
      expect(Array.isArray(ICON_PATHS[name])).toBe(true);
      expect(ICON_PATHS[name].length).toBeGreaterThan(0);
    });
    expect(ICON_NAMES).toEqual(expect.arrayContaining(REQUIRED_ICONS));
  });

  test('every icon uses only valid 24x24 shape primitives with real geometry', () => {
    // Valid SVG path: starts with a moveto, then only command letters and numbers.
    const VALID_PATH = /^[Mm][\s\d.,\-+MmLlHhVvCcSsQqTtAaZz]*$/;

    ICON_NAMES.forEach((name) => {
      ICON_PATHS[name].forEach((shape) => {
        expect(VALID_SHAPE_TYPES).toContain(shape.t);
        if (shape.t === 'path') {
          expect(typeof shape.d).toBe('string');
          expect(shape.d).toMatch(VALID_PATH);
          // A bare "M x y" with no drawing command renders nothing.
          expect(shape.d).toMatch(/[LlHhVvCcSsQqTtAaZz]/);
        }
        if (shape.t === 'circle') {
          expect(shape.r).toBeGreaterThan(0);
          expect(shape.cx).toBeGreaterThanOrEqual(0);
          expect(shape.cy).toBeGreaterThanOrEqual(0);
          expect(shape.cx).toBeLessThanOrEqual(24);
          expect(shape.cy).toBeLessThanOrEqual(24);
        }
        if (shape.t === 'rect') {
          expect(shape.width).toBeGreaterThan(0);
          expect(shape.height).toBeGreaterThan(0);
          expect(shape.x + shape.width).toBeLessThanOrEqual(24);
          expect(shape.y + shape.height).toBeLessThanOrEqual(24);
        }
      });
    });
  });

  test('no icon uses emoji or non-ASCII glyph geometry', () => {
    const serialized = JSON.stringify(ICON_PATHS);
    // eslint-disable-next-line no-control-regex
    expect(serialized).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  test('fileTypeIcon maps extensions to the correct vector icon', () => {
    expect(fileTypeIcon('photo.JPG')).toBe('image');
    expect(fileTypeIcon('clip.mp4')).toBe('video');
    expect(fileTypeIcon('song.flac')).toBe('audio');
    expect(fileTypeIcon('bundle.zip')).toBe('archive');
    expect(fileTypeIcon('app.js')).toBe('code');
    expect(fileTypeIcon('report.pdf')).toBe('document');
    expect(fileTypeIcon('mystery.xyz')).toBe('file');
    expect(fileTypeIcon('')).toBe('file');
    expect(fileTypeIcon(undefined)).toBe('file');
  });

  test('mimeTypeIcon maps MIME types to the correct vector icon', () => {
    expect(mimeTypeIcon('image/png')).toBe('image');
    expect(mimeTypeIcon('video/quicktime')).toBe('video');
    expect(mimeTypeIcon('audio/mpeg')).toBe('audio');
    expect(mimeTypeIcon('application/pdf')).toBe('document');
    expect(mimeTypeIcon('text/plain')).toBe('document');
    expect(mimeTypeIcon('application/zip')).toBe('archive');
    expect(mimeTypeIcon('application/octet-stream')).toBe('file');
    expect(mimeTypeIcon('')).toBe('file');
  });
});
