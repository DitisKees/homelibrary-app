import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const expo = app.expo ?? {};
const android = expo.android ?? {};
const adaptiveIcon = android.adaptiveIcon ?? {};
const expoDependency = pkg.dependencies?.expo ?? '';

expect(expo.name === 'HomeLibrary', 'expo.name must be HomeLibrary');
expect(android.package === 'io.github.ditiskees.homelibrary', 'android.package must be io.github.ditiskees.homelibrary');
expect(Number.isInteger(android.versionCode) && android.versionCode >= 1, 'android.versionCode must be a positive integer');
expect(typeof expo.version === 'string' && /^\d+\.\d+\.\d+/.test(expo.version), 'expo.version must use a semantic x.y.z version');
expect(/^~57\./.test(expoDependency), `release validation assumes Expo SDK 57; found ${expoDependency || 'no Expo dependency'}. Re-review Android target API and native compatibility requirements after an SDK change.`);

const requestedPermissions = new Set(android.permissions ?? []);
expect(requestedPermissions.has('android.permission.CAMERA'), 'android.permission.CAMERA must be requested');
expect(requestedPermissions.size === 1, 'android.permissions must contain only android.permission.CAMERA');

const blockedPermissions = new Set(android.blockedPermissions ?? []);
for (const permission of [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
]) {
  expect(blockedPermissions.has(permission), `${permission} must be blocked`);
}

const pluginConfig = (name) => {
  const entry = (expo.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === name);
  return entry?.[1] ?? {};
};
const cameraPlugin = pluginConfig('expo-camera');
expect(cameraPlugin.recordAudioAndroid === false, 'expo-camera recordAudioAndroid must be false');
expect(cameraPlugin.barcodeScannerEnabled === false, 'expo-camera barcodeScannerEnabled must be false so Android ML Kit barcode dependencies are excluded');
expect(pluginConfig('expo-image-picker').microphonePermission === false, 'expo-image-picker microphonePermission must be false');

const androidBuildFromSource = new Set(pkg.expo?.autolinking?.android?.buildFromSource ?? []);
expect(androidBuildFromSource.has('expo-camera'), 'expo-camera must be listed in expo.autolinking.android.buildFromSource so barcodeScannerEnabled=false affects native dependencies');

const zxingGradle = path.join(root, 'modules/expo-zxing-scanner/android/build.gradle');
const zxingModule = path.join(root, 'modules/expo-zxing-scanner/android/src/main/java/expo/modules/zxingscanner/ExpoZxingScannerModule.kt');
expect(fs.existsSync(zxingGradle), 'local ZXing scanner Gradle configuration is missing');
expect(fs.existsSync(zxingModule), 'local ZXing scanner native module is missing');
if (fs.existsSync(zxingGradle)) {
  const gradle = fs.readFileSync(zxingGradle, 'utf8');
  expect(gradle.includes("com.google.zxing:core:3.5.4"), 'local scanner must use the reviewed ZXing Core 3.5.4 dependency');
}

const pngPaths = new Set([
  expo.icon,
  android.icon,
  adaptiveIcon.foregroundImage,
  adaptiveIcon.monochromeImage,
].filter(Boolean));

const pngDimensions = (buffer) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return undefined;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

for (const relative of pngPaths) {
  const file = path.resolve(root, relative);
  expect(file.startsWith(root + path.sep), `icon path escapes repository: ${relative}`);
  if (!fs.existsSync(file)) {
    errors.push(`missing configured icon asset: ${relative}`);
    continue;
  }
  const dimensions = pngDimensions(fs.readFileSync(file));
  if (!dimensions) {
    errors.push(`configured icon is not a PNG: ${relative}`);
    continue;
  }
  expect(
    dimensions.width === 1024 && dimensions.height === 1024,
    `${relative} must be 1024x1024, got ${dimensions.width}x${dimensions.height}`
  );
}

if (errors.length > 0) {
  process.stderr.write('Android configuration validation failed:\n');
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`Android config OK: ${expo.name}, ${android.package}, app ${expo.version}, versionCode ${android.versionCode}.\n`);
process.stdout.write('Android barcode scanning is configured for local Apache-2.0 ZXing Core with Expo Camera ML Kit support disabled.\n');
process.stdout.write('This validates repository configuration only; F-Droid eligibility additionally requires a fully FLOSS dependency graph and a clean source build.\n');
