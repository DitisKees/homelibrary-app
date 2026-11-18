import { test } from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/with-glide-version.js';

test('Expo applies the shared Gradle Glide configuration exactly once', async () => {
  const generated = plugin({ name: 'test', slug: 'test' });
  const apply = async (contents, language = 'groovy') =>
    (await generated.mods.android.projectBuildGradle({
      modResults: { language, contents }, modRequest: {},
    })).modResults.contents;
  const input = 'allprojects { repositories { mavenCentral() } }';
  const result = await apply(input);
  assert.ok(result.startsWith(input));
  assert.match(result, /apply from: rootProject.file\('\.\.\/scripts\/glide-version.gradle'\)/);
  assert.equal(await apply(result), result);
  await assert.rejects(() => apply(input, 'kotlin'), /requires a Groovy/);
});
