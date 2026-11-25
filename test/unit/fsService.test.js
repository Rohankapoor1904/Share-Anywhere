const fs = require('fs');
const path = require('path');
const os = require('os');
const fsService = require('../../nodejs-assets/nodejs-project/fs-service');

describe('PC Filesystem Service (real disk I/O)', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-fs-'));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'readme.txt'), 'hello world');
    fs.writeFileSync(path.join(root, 'docs', 'note.md'), '# Note');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('listDirectory returns real entries sorted dirs-first', () => {
    const listing = fsService.listDirectory(root, '');
    expect(listing.currentPath).toBe(path.resolve(root));
    expect(listing.parentPath).toBeNull();
    const names = listing.entries.map((e) => e.name);
    expect(names[0]).toBe('docs');
    expect(names).toContain('readme.txt');
    const docs = listing.entries.find((e) => e.name === 'docs');
    expect(docs.isDirectory).toBe(true);
    expect(docs.mimeType).toBe('inode/directory');
  });

  test('listDirectory reports a real parent path for nested dirs', () => {
    const listing = fsService.listDirectory(root, path.join(root, 'docs'));
    expect(listing.parentPath).toBe(path.resolve(root));
    expect(listing.entries[0].name).toBe('note.md');
    expect(listing.entries[0].mimeType).toBe('text/plain; charset=utf-8');
  });

  test('listDirectory throws for a non-directory path', () => {
    expect(() => fsService.listDirectory(root, path.join(root, 'readme.txt'))).toThrow();
  });

  test('copyEntry duplicates a real file with a (Copy) suffix', () => {
    const newPath = fsService.copyEntry(path.join(root, 'readme.txt'));
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.readFileSync(newPath, 'utf8')).toBe('hello world');
    expect(path.basename(newPath)).toContain('(Copy)');
  });

  test('copyEntry recursively copies a directory', () => {
    const newPath = fsService.copyEntry(path.join(root, 'docs'));
    expect(fs.existsSync(path.join(newPath, 'note.md'))).toBe(true);
  });

  test('deleteEntry removes a real file', () => {
    const target = path.join(root, 'readme.txt');
    fsService.deleteEntry(target);
    expect(fs.existsSync(target)).toBe(false);
  });

  test('deleteEntry removes a directory tree', () => {
    fsService.deleteEntry(path.join(root, 'docs'));
    expect(fs.existsSync(path.join(root, 'docs'))).toBe(false);
  });

  test('deleteEntry throws when the path does not exist', () => {
    expect(() => fsService.deleteEntry(path.join(root, 'ghost'))).toThrow();
  });

  test('getMimeType maps known extensions and falls back', () => {
    expect(fsService.getMimeType('a.PNG')).toBe('image/png');
    expect(fsService.getMimeType('a.unknownext')).toBe('application/octet-stream');
  });

  describe('containment for remote callers', () => {
    let outside;

    beforeEach(() => {
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'localshare-outside-'));
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'private');
    });

    afterEach(() => {
      fs.rmSync(outside, { recursive: true, force: true });
    });

    test('resolvePath refuses paths outside the allowed roots', () => {
      expect(() => fsService.resolvePath(root, path.join(outside, 'secret.txt'), [root]))
        .toThrow('outside the shared folders');
      expect(() => fsService.resolvePath(root, `../${path.basename(outside)}/secret.txt`, [root]))
        .toThrow('outside the shared folders');
      expect(fsService.resolvePath(root, 'docs', [root])).toBe(path.join(root, 'docs'));
    });

    test('deleteEntry refuses targets outside the roots and the root itself', () => {
      expect(() => fsService.deleteEntry(path.join(outside, 'secret.txt'), [root])).toThrow();
      expect(() => fsService.deleteEntry(root, [root])).toThrow('shared root');
      expect(fs.existsSync(path.join(outside, 'secret.txt'))).toBe(true);
      expect(fs.existsSync(root)).toBe(true);
    });

    test('copyEntry refuses a destination outside the roots', () => {
      expect(() => fsService.copyEntry(path.join(root, 'readme.txt'), path.join(outside, 'stolen.txt'), [root]))
        .toThrow('outside the shared folders');
      expect(fs.existsSync(path.join(outside, 'stolen.txt'))).toBe(false);
    });

    test('listDirectory without shared drives maps __ROOT__ to the browse root', () => {
      const listing = fsService.listDirectory(root, '__ROOT__', { allowedRoots: [root], exposeDrives: false });
      expect(listing.currentPath).toBe(path.resolve(root));
      expect(listing.parentPath).toBeNull();
    });
  });

  test('sanitizeFileName keeps only a safe base name', () => {
    expect(fsService.sanitizeFileName('../../evil.bat', 'fallback')).toBe('evil.bat');
    expect(fsService.sanitizeFileName('..\\..\\Startup\\evil.bat', 'fallback')).toBe('evil.bat');
    expect(fsService.sanitizeFileName('..', 'fallback')).toBe('fallback');
    expect(fsService.sanitizeFileName('', 'fallback')).toBe('fallback');
    expect(fsService.sanitizeFileName('a:b?.txt', 'fallback')).toBe('a_b_.txt');
  });

  test('uniquePath never returns an existing file', () => {
    expect(path.basename(fsService.uniquePath(path.join(root, 'readme.txt')))).toBe('readme (2).txt');
  });

  test('listCategory leaves excluded folders out of every category except downloads', () => {
    const received = path.join(root, 'Downloads', 'LocalShare');
    fs.mkdirSync(received, { recursive: true });
    fs.mkdirSync(path.join(root, 'Pictures'), { recursive: true });
    fs.writeFileSync(path.join(received, 'from-phone.jpg'), 'x');
    fs.writeFileSync(path.join(root, 'Pictures', 'holiday.jpg'), 'x');

    const photos = fsService.listCategory('photos', 50, 0, root, { excludeDirs: [received] });
    const names = photos.entries.map((e) => e.name);
    expect(names).toContain('holiday.jpg');
    expect(names).not.toContain('from-phone.jpg');

    const recent = fsService.listCategory('recent', 50, 0, root, { excludeDirs: [received] });
    expect(recent.entries.map((e) => e.name)).not.toContain('from-phone.jpg');

    const downloads = fsService.listCategory('downloads', 50, 0, root, { excludeDirs: [received] });
    expect(downloads.entries.map((e) => e.name)).toContain('from-phone.jpg');

    const unfiltered = fsService.listCategory('photos', 50, 0, root);
    expect(unfiltered.entries.map((e) => e.name)).toContain('from-phone.jpg');
  });
});
