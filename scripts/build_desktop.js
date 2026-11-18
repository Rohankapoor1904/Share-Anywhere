const fs = require('fs');
const path = require('path');
const packager = require('electron-packager');

async function buildDesktop() {
  const rootDir = path.resolve(__dirname, '..');
  const stageDir = path.join(rootDir, '.desktop-stage');
  const distDir = path.join(rootDir, 'dist');

  // eslint-disable-next-line no-console
  console.info('[1/4] Preparing Desktop App staging directory...');
  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  // Copy desktop directory
  fs.cpSync(path.join(rootDir, 'desktop'), path.join(stageDir, 'desktop'), { recursive: true });

  // Copy nodejs-assets directory
  fs.cpSync(path.join(rootDir, 'nodejs-assets'), path.join(stageDir, 'nodejs-assets'), { recursive: true });

  // Copy assets if exists
  if (fs.existsSync(path.join(rootDir, 'assets'))) {
    fs.cpSync(path.join(rootDir, 'assets'), path.join(stageDir, 'assets'), { recursive: true });
  }

  // Create clean standalone package.json
  const desktopPkg = {
    name: 'localshare',
    productName: 'LocalShare',
    version: '1.2.84',
    main: 'desktop/main.js',
    description: 'LocalShare Pure Desktop — Direct LAN File Sharing',
    author: 'Rohan Kapoor'
  };
  fs.writeFileSync(path.join(stageDir, 'package.json'), JSON.stringify(desktopPkg, null, 2));

  // eslint-disable-next-line no-console
  console.info('[2/4] Packaging Windows x64 Native Desktop Application via Electron Packager...');
  const appPaths = await packager({
    dir: stageDir,
    name: 'LocalShare',
    platform: 'win32',
    arch: 'x64',
    out: distDir,
    overwrite: true,
    asar: true,
    prune: true,
    appVersion: '1.2.84',
    win32metadata: {
      CompanyName: 'Rohan Kapoor',
      FileDescription: 'LocalShare Desktop — Direct LAN File Sharing',
      OriginalFilename: 'LocalShare.exe',
      ProductName: 'LocalShare',
      InternalName: 'LocalShare'
    }
  });

  // eslint-disable-next-line no-console
  console.info('[3/4] Cleaning up staging directory...');
  fs.rmSync(stageDir, { recursive: true, force: true });

  const exePath = path.join(appPaths[0], 'LocalShare.exe');
  if (!fs.existsSync(exePath)) {
    throw new Error(`Packaged executable not found at: ${exePath}`);
  }

  const stat = fs.statSync(exePath);
  // eslint-disable-next-line no-console
  console.info('[4/4] Verification Succeeded!');
  // eslint-disable-next-line no-console
  console.info(` - Standalone Executable: ${exePath}`);
  // eslint-disable-next-line no-console
  console.info(` - Binary Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
  // eslint-disable-next-line no-console
  console.info('========================================================');
  // eslint-disable-next-line no-console
  console.info(' LocalShare Pure Desktop App successfully built!');
  // eslint-disable-next-line no-console
  console.info('========================================================');
}

if (require.main === module) {
  buildDesktop().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Desktop build failed:', err);
    process.exit(1);
  });
}

module.exports = { buildDesktop };
