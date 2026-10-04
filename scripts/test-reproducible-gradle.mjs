import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import configPlugins from 'expo/config-plugins.js';
import plugin from '../plugins/with-reproducible-native-builds.js';

const { AndroidConfig } = configPlugins;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test('Expo disables dependency signature metadata even on an already configured project', async () => {
  const generated = plugin({ name: 'test', slug: 'test' });
  const apply = async (contents) => (await generated.mods.android.appBuildGradle({
    modResults: { language: 'groovy', contents }, modRequest: {},
  })).modResults.contents;
  for (const contents of [
    'android { defaultConfig {} }',
    'android { defaultConfig { // HomeLibrary reproducible native builds\n} }',
  ]) {
    const result = await apply(contents);
    assert.match(result, /includeInApk = false/);
    assert.match(result, /includeInBundle = false/);
    assert.equal(await apply(result), result);
  }
});

test('Expo generation replaces host IPs and duplicates and remains idempotent', async () => {
  const generated = plugin({ name: 'test', slug: 'test' });
  const apply = async (modResults) => (await generated.mods.android.gradleProperties({
    modResults, modRequest: {},
  })).modResults;
  const barcode = { type: 'property', key: 'expo.camera.barcode-scanner-enabled', value: 'false' };
  for (const address of ['172.18.0.2', '172.17.0.3']) {
    const result = await apply([
      barcode,
      { type: 'comment', value: 'preserve this comment' },
      { type: 'property', key: 'reactNativeDevServerIp', value: address },
      { type: 'property', key: 'reactNativeDevServerIp ', value: 'other-host' },
    ]);
    assert.deepEqual(await apply(result), result);
    const text = AndroidConfig.Properties.propertiesListToString(result);
    assert.match(text, /^reactNativeDevServerIp=localhost$/m);
    assert.ok(!text.includes(address));
    assert.ok(result.includes(barcode));
    assert.ok(result.some((item) => item.type === 'comment'));
  }
  assert.equal((await apply([]))[0].value, 'localhost');
});

test('pre-build guard rejects missing, duplicate, and overridden dev-server IPs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homelibrary-properties-'));
  const file = path.join(dir, 'gradle.properties');
  const run = (suffix) => {
    fs.writeFileSync(file, 'expo.camera.barcode-scanner-enabled=false\n' + suffix);
    return spawnSync('bash', [path.join(scriptDir, 'prepare-android-gradle-properties.sh'), file]);
  };
  try {
    assert.equal(run('reactNativeDevServerIp=localhost').status, 0);
    assert.ok(fs.readFileSync(file, 'utf8').endsWith('\n'));
    for (const suffix of ['', 'reactNativeDevServerIp=172.17.0.3',
      'reactNativeDevServerIp=localhost\nreactNativeDevServerIp =172.17.0.3']) {
      assert.notEqual(run(suffix).status, 0);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
