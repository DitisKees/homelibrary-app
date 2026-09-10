import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fdroidPath = path.join(root, '.fdroid.yml');
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const expo = app.expo ?? {};
const android = expo.android ?? {};
const versionName = expo.version;
const versionCode = android.versionCode;

expect(typeof versionName === 'string' && /^\d+\.\d+\.\d+$/.test(versionName), 'app.json expo.version must be semantic x.y.z');
expect(Number.isInteger(versionCode) && versionCode > 0, 'app.json android.versionCode must be a positive integer');
expect(android.package === 'io.github.ditiskees.homelibrary', 'Android package must remain io.github.ditiskees.homelibrary');

const buildFromSource = pkg.expo?.autolinking?.android?.buildFromSource ?? [];
expect(Array.isArray(buildFromSource) && buildFromSource.includes('.*'), 'Expo Android autolinking must build all native modules from source using buildFromSource [".*"]');

const localeSpecs = [
  ['en-US', 'English'],
  ['nl-NL', 'Dutch'],
  ['de-DE', 'German'],
  ['fr-FR', 'French'],
];

for (const [locale, label] of localeSpecs) {
  const dir = path.join(root, 'fastlane', 'metadata', 'android', locale);
  const shortPath = path.join(dir, 'short_description.txt');
  const fullPath = path.join(dir, 'full_description.txt');
  const changelogPath = path.join(dir, 'changelogs', `${versionCode}.txt`);

  expect(fs.existsSync(shortPath), `${label} short_description.txt is missing`);
  expect(fs.existsSync(fullPath), `${label} full_description.txt is missing`);
  expect(fs.existsSync(changelogPath), `${label} changelog for versionCode ${versionCode} is missing`);

  if (fs.existsSync(shortPath)) {
    const shortDescription = fs.readFileSync(shortPath, 'utf8').trim();
    expect(shortDescription.length >= 30, `${label} short description should be at least 30 characters`);
    expect(shortDescription.length < 80, `${label} short description must be under 80 characters`);
    expect(!shortDescription.endsWith('.'), `${label} short description must not end with a period`);
  }

  if (fs.existsSync(fullPath)) {
    const fullDescription = fs.readFileSync(fullPath, 'utf8').trim();
    expect(fullDescription.length >= 200, `${label} full description is unexpectedly short`);
  }

  if (fs.existsSync(changelogPath)) {
    const changelog = fs.readFileSync(changelogPath, 'utf8').trim();
    expect(changelog.length > 0, `${label} changelog is empty`);
    expect(changelog.length <= 500, `${label} changelog exceeds F-Droid's 500-character limit`);
  }
}

expect(fs.existsSync(fdroidPath), '.fdroid.yml is missing');
if (fs.existsSync(fdroidPath)) {
  const fdroid = fs.readFileSync(fdroidPath, 'utf8');
  expect(fdroid.includes(`versionName: ${versionName}`) || fdroid.includes(`versionName: '${versionName}'`), `.fdroid.yml must use versionName ${versionName}`);
  expect(fdroid.includes(`versionCode: ${versionCode}`), `.fdroid.yml must use versionCode ${versionCode}`);
  expect(fdroid.includes(`commit: v${versionName}`), `.fdroid.yml must build tag v${versionName}`);
  expect(fdroid.includes('ndk: r27b'), '.fdroid.yml must pin Android NDK r27b for Expo SDK 57 / React Native 0.86');
  expect(fdroid.includes('RepoType: git'), '.fdroid.yml must declare RepoType: git');
  expect(fdroid.includes('https://github.com/DitisKees/homelibrary-app'), '.fdroid.yml must reference the public upstream repository');
  expect(!/^\s*subdir:/m.test(fdroid), '.fdroid.yml must not use subdir because android/ is generated during the build');
  expect(fdroid.includes('scripts/prepare-fdroid-source-tree.sh'), '.fdroid.yml must remove bundled Expo local Maven repositories');
  expect(fdroid.includes('scripts/check-fdroid-android-dependencies.sh'), '.fdroid.yml must run the Android non-free dependency guard');
  expect(fdroid.includes('scanignore:\n      - node_modules'), '.fdroid.yml must explicitly document the node_modules scanner exception');
  expect(fdroid.includes('output: android/app/build/outputs/apk/release/*.apk'), '.fdroid.yml must point to the generated release APK');
  expect(fdroid.includes('UpdateCheckMode: Tags'), '.fdroid.yml must check tagged releases');
  expect(fdroid.includes('AutoUpdateMode: Version'), '.fdroid.yml must enable version autoupdates');
  expect(fdroid.includes(`CurrentVersion: ${versionName}`), `.fdroid.yml CurrentVersion must be ${versionName}`);
  expect(fdroid.includes(`CurrentVersionCode: ${versionCode}`), `.fdroid.yml CurrentVersionCode must be ${versionCode}`);
}

if (errors.length > 0) {
  process.stderr.write('F-Droid metadata validation failed:\n');
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`F-Droid metadata OK for HomeLibrary ${versionName} (${versionCode}).\n`);
process.stdout.write('Fastlane text metadata exists for en-US, nl-NL, de-DE, and fr-FR.\n');
process.stdout.write('Expo native modules are configured for source builds and the upstream F-Droid recipe matches the release version/NDK baseline.\n');
