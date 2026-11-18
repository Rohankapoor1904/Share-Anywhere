const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const mainPath = path.join(rootDir, 'desktop', 'main.js');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [mainPath], {
  stdio: 'inherit',
  env,
  windowsHide: false
});

child.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to spawn desktop process:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
