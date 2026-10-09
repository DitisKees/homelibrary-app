import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import plugin from '../plugins/with-android-permissions.js';

test('Android 10 minimum replaces stale overrides and survives repeated prebuild', async () => {
  const config = plugin({ name: 'test', slug: 'test' });
  const apply = async (modResults) => (await config.mods.android.gradleProperties({ modResults, modRequest: {} })).modResults;
  const unrelated = { type: 'property', key: 'expo.camera.barcode-scanner-enabled', value: 'false' };
  const result = await apply([
    unrelated,
    { type: 'property', key: 'android.minSdkVersion', value: '24' },
    { type: 'property', key: 'android.minSdkVersion ', value: '28' },
  ]);
  assert.deepEqual(result, [unrelated, { type: 'property', key: 'android.minSdkVersion', value: '29' }]);
  assert.deepEqual(await apply(result), result);
});

test('storage and biometric permissions are blocked without disabling SecureStore backups', () => {
  const { expo } = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url)));
  for (const permission of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'USE_BIOMETRIC', 'USE_FINGERPRINT']) {
    assert.ok(expo.android.blockedPermissions.includes(`android.permission.${permission}`));
  }
  assert.ok(expo.plugins.includes('./plugins/with-android-permissions'));
  assert.equal(expo.plugins.find((entry) => entry[0] === 'expo-secure-store')[1].configureAndroidBackup, true);
});
