// Merges ARCANE TERMINAL's added JS dependencies into the forked app/package.json.
// Run from app/ (cwd). Idempotent. Does not run the installer — the build script does.
import { readFileSync, writeFileSync } from 'node:fs';

const ADD = {
  'react-native-iap': '^15.3.2',
  'react-native-nitro-modules': '^0.35.9',
  '@react-native-async-storage/async-storage': '^2.1.0',
};

const path = 'package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
pkg.dependencies ??= {};
let changed = false;
for (const [name, ver] of Object.entries(ADD)) {
  if (!pkg.dependencies[name]) {
    pkg.dependencies[name] = ver;
    changed = true;
    console.log(`   + ${name}@${ver}`);
  }
}
// Rebrand a little.
if (pkg.name === 'PocketPal' || pkg.name === 'pocketpal-ai') {
  pkg.displayName = 'Arcane Terminal';
}
if (changed) writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log(changed ? '   package.json updated' : '   deps already present');
