import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function patchCamera(root) {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const cameraConfig = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera');
  if (cameraConfig?.[1]?.barcodeScannerEnabled !== false) {
    throw new Error('The source patch requires Expo Camera barcodeScannerEnabled=false.');
  }
  const camera = path.join(root, 'node_modules/expo-camera');
  const version = JSON.parse(fs.readFileSync(path.join(camera, 'package.json'), 'utf8')).version;
  if (version !== '57.0.5') throw new Error(`Review the Expo Camera source patch for version ${version}.`);
  const patch = path.join(root, 'patches/expo-camera-57.0.5-no-google-barcode.patch');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'patches/expo-camera-57.0.5-no-google-barcode.json'), 'utf8'));
  const digest = (relative) => {
    const file = path.join(camera, relative);
    return fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
  };
  const matches = (state) => Object.entries(manifest).every(([relative, hashes]) => digest(relative) === hashes[state]);
  if (matches('after')) return;
  if (!matches('before')) throw new Error('Expo Camera source differs from the reviewed patch baseline; refusing partial patch.');
  execFileSync('git', ['apply', '--check', '--directory=node_modules/expo-camera', patch], { cwd: root });
  execFileSync('git', ['apply', '--directory=node_modules/expo-camera', patch], { cwd: root });
  if (!matches('after')) throw new Error('Expo Camera patched source checksum verification failed.');
  console.log('[PASS] Expo Camera Google barcode source and dependencies removed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchCamera(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
