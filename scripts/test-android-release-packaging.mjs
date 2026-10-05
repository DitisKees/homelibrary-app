import { test } from 'node:test';
import assert from 'node:assert/strict';
import configPlugins from 'expo/config-plugins.js';
import plugin from '../plugins/with-android-release-packaging.js';

const { AndroidConfig } = configPlugins;
test('release packaging overrides stale flags once without touching barcode configuration', async () => {
  const generated = plugin({ name: 'test', slug: 'test', android: { versionCode: 12 } });
  const apply = async (modResults) => (await generated.mods.android.gradleProperties({ modResults, modRequest: {} })).modResults;
  const barcode = { type: 'property', key: 'expo.camera.barcode-scanner-enabled', value: 'false' };
  const result = await apply([barcode,
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds ', value: 'false' },
    { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
    { type: 'property', key: 'android.enableShrinkResourcesInReleaseBuilds', value: 'true' },
  ]);
  assert.deepEqual(await apply(result), result);
  assert.ok(result.includes(barcode));
  const text = AndroidConfig.Properties.propertiesListToString(result);
  assert.match(text, /^android.enableMinifyInReleaseBuilds=true$/m);
  assert.match(text, /^android.enableShrinkResourcesInReleaseBuilds=false$/m);
  const gradle = await generated.mods.android.appBuildGradle({ modResults: { language: 'groovy', contents: 'android {}' }, modRequest: {} });
  const repeated = await generated.mods.android.appBuildGradle({ modResults: gradle.modResults, modRequest: {} });
  assert.equal(repeated.modResults.contents, gradle.modResults.contents);
  // Adding optimize rules alongside proguard-android.txt would silently leave
  // -dontoptimize in effect; replace that list instead.
  assert.match(gradle.modResults.contents, /setProguardFiles\(\[getDefaultProguardFile\('proguard-android-optimize.txt'\), file\('proguard-rules.pro'\)\]\)/);
});
test('release code rejects overflow and invalid base codes before native generation', () => {
  for (const versionCode of [0, -1, 1.5, 210000000, undefined]) {
    assert.throws(() => plugin({ android: { versionCode } }), /base versionCode/);
  }
});
