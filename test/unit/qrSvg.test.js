const { generateQrSvg, generateQrMatrix } = require('../../desktop/engine/qr-svg');

describe('Pure-JS QR SVG Generator (desktop/engine/qr-svg.js)', () => {
  test('generates valid matrix for simple text', () => {
    const { size, grid, version } = generateQrMatrix('hello world', 'M');
    expect(version).toBeGreaterThanOrEqual(1);
    expect(size).toBe((version - 1) * 4 + 21);
    expect(grid).toBeDefined();
    expect(grid.length).toBe(size);
    expect(grid[0].length).toBe(size);

    // Verify finder pattern at top-left
    expect(grid[0][0]).toBe(1);
    expect(grid[0][6]).toBe(1);
    expect(grid[6][0]).toBe(1);
    expect(grid[6][6]).toBe(1);
    expect(grid[1][1]).toBe(0);
    expect(grid[3][3]).toBe(1); // center
  });

  test('generates non-empty SVG with svg and path elements for pairing payload', () => {
    const payload = JSON.stringify({
      address: '192.168.1.105',
      port: 53318,
      deviceId: 'pc-rohan-dev-01',
      displayName: 'Rohan (PC)',
      fingerprint: 'SHA256:abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890',
      code: '849201'
    });

    const svg = generateQrSvg(payload, { ecc: 'L', dark: '#0ea5e9', light: '#0f172a' });

    expect(typeof svg).toBe('string');
    expect(svg.length).toBeGreaterThan(100);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<path');
    expect(svg).toContain('<rect');
    expect(svg).toContain('#0ea5e9');
    expect(svg).toContain('#0f172a');
  });

  test('handles empty input gracefully', () => {
    expect(generateQrSvg('')).toBe('');
    expect(generateQrSvg(null)).toBe('');
  });
});
