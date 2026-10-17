/*
 * After `tauri build`: copies the installer to release/Limn.exe (the download shows just "Limn")
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const setup = fs.readdirSync(dir).filter((n) => n.endsWith('-setup.exe')).sort().pop();
if (!setup) throw new Error('installer not found in ' + dir);
const out = path.join(__dirname, '..', 'release');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(dir, setup), path.join(out, 'Limn.exe'));
console.log('release/Limn.exe <- ' + setup);
