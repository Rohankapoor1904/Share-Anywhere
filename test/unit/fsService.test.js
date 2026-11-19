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
});
