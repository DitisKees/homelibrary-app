import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { patchCamera } from './patch-expo-camera.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'camera-patch-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(repo, 'patches'), path.join(root, 'patches'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'app.json'), path.join(root, 'app.json'));
  const camera = path.join(root, 'node_modules/expo-camera');
  fs.mkdirSync(camera, { recursive: true });
  fs.copyFileSync(path.join(repo, 'node_modules/expo-camera/package.json'), path.join(camera, 'package.json'));
  fs.cpSync(path.join(repo, 'node_modules/expo-camera/android'), path.join(camera, 'android'), { recursive: true });
  // npm ci has already applied postinstall. Restore the reviewed upstream source.
  execFileSync('git', ['apply', '--reverse', '--directory=node_modules/expo-camera', path.join(root, 'patches/expo-camera-57.0.5-no-google-barcode.patch')], { cwd: root });
  return { root, camera };
}

test('patch applies inside a checkout, removes Google code, and is idempotent', (t) => {
  const { root, camera } = fixture(t);
  execFileSync('git', ['init', '-q'], { cwd: root });
  patchCamera(root);
  patchCamera(root);
  const module = fs.readFileSync(path.join(camera, 'android/src/main/java/expo/modules/camera/CameraViewModule.kt'), 'utf8');
  assert.match(module, /AsyncFunction\("takePicture"\)/);
  assert.match(module, /AsyncFunction\("scanFromURLAsync"\)/);
  assert.doesNotMatch(module, /com\.google|MLKitBarCodeScanner|GmsBarcodeScanning/);
  const gradle = fs.readFileSync(path.join(camera, 'android/build.gradle'), 'utf8');
  assert.doesNotMatch(gradle, /compileOnly|barcode-scanning|camera-mlkit|play-services/);
});

test('source drift fails before changing any other file', (t) => {
  const { root, camera } = fixture(t);
  const gradle = path.join(camera, 'android/build.gradle');
  fs.appendFileSync(gradle, '\n// unexpected dependency change\n');
  const manifest = path.join(camera, 'android/src/main/AndroidManifest.xml');
  const before = fs.readFileSync(manifest, 'utf8');
  assert.throws(() => patchCamera(root), /reviewed patch baseline/);
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);
});

test('new Expo Camera versions require review', (t) => {
  const { root, camera } = fixture(t);
  fs.writeFileSync(path.join(camera, 'package.json'), JSON.stringify({ version: '57.0.6' }));
  assert.throws(() => patchCamera(root), /Review the Expo Camera source patch/);
});

test('enabled native barcode configuration is rejected', (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { plugins: [['expo-camera', { barcodeScannerEnabled: true }]] } }));
  assert.throws(() => patchCamera(root), /barcodeScannerEnabled=false/);
});
