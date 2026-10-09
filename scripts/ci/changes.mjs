import process from 'node:process';
import console from 'node:console';
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const appFiles = new Set([
  'App.tsx', 'app.json', 'package.json', 'package-lock.json', '.nvmrc',
  'babel.config.js', 'tsconfig.json', 'metro.config.js', 'metro.config.cjs',
]);
const androidScripts = new Set([
  'android-release-abis.json', 'build-fdroid-android.sh', 'build-fdroid-recipe-android.sh',
  'build-glide-ksp-repro.sh', 'check-fdroid-android-dependencies.sh',
  'check-fdroid-icons.mjs', 'check-fdroid-npm-dependencies.mjs',
  'fdroid-reviewed-native-groups.txt', 'glide-ksp-repro.init.gradle',
  'normalize-fdroid-apk-build-ids.py', 'prepare-android-gradle-properties.sh',
  'prepare-fdroid-source-tree.sh', 'scan-fdroid-apk.sh', 'smoke-android-startup.sh',
  'validate-android-release.mjs', 'validate-fdroid-metadata.mjs',
  'verify-android-abi-apk.py', 'verify-android-abi-apk.sh', 'verify-fdroid-apk.sh',
  'verify-release-dev-server.py',
]);
const webScripts = new Set([
  'generate-app-icons.mjs', 'prepare-fastlane-icon.mjs', 'patch-expo-camera.mjs',
  'inject-web-runtime-config.mjs',
]);

// Keep diagnostic tooling outside production build inputs. Unknown production
// paths fail safe by requesting all gates, rather than silently losing coverage.
export function classify(paths, force = false) {
  const gates = { source: force, pocketbase: force, android: force, docker: force };
  const mark = (...names) => names.forEach(name => { gates[name] = true; });
  for (const path of paths) {
    if (/^(docs\/|scripts\/diagnostics\/|\.github\/workflows\/diagnostics-)/.test(path)
        || /(^|\/)(README[^/]*|[^/]+\.md)$/.test(path)
        || ['LICENSE', '.gitignore', 'scripts/android-release-smoke-signing.gradle'].includes(path)) continue;
    if (path.startsWith('scripts/ci/') || path === '.github/workflows/changes.yml') {
      mark('source', 'pocketbase', 'android', 'docker');
    } else if (appFiles.has(path) || /^(src|assets|modules|patches|plugins|android)\//.test(path)) {
      mark('source', 'android', 'docker');
    } else if (path.startsWith('pocketbase/') || path === 'scripts/test-pocketbase-schema.sh') {
      mark('pocketbase', 'docker');
    } else if (/^(docker\/|compose\.)/.test(path) || path === '.dockerignore'
        || path === 'scripts/test-docker-selfhost.sh' || path === '.github/workflows/docker-images.yml') {
      mark('docker');
    } else if (path === '.fdroid.yml' || path.startsWith('fastlane/')
        || path.startsWith('scripts/fdroid/') || androidScripts.has(path.replace(/^scripts\//, ''))
        || path === '.github/workflows/fdroid-buildserver-simulation.yml') {
      mark('source', 'android');
    } else if (webScripts.has(path.replace(/^scripts\//, ''))) {
      mark('source', 'android', 'docker');
    } else if (path.startsWith('scripts/test-') || ['eslint.config.js', 'jest.config.js'].includes(path)
        || path === '.github/workflows/ci.yml' || path === '.github/workflows/android-release.yml') {
      mark('source');
    } else if (path.startsWith('.github/workflows/')) {
      // Standalone manual/diagnostic workflows own their own triggers.
      continue;
    } else {
      mark('source', 'pocketbase', 'android', 'docker');
    }
  }
  return gates;
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout.trimEnd();
}

export function changedPaths(eventName, event) {
  let base;
  let head;
  if (eventName === 'pull_request') {
    head = event.pull_request.head.sha;
    base = git('merge-base', event.pull_request.base.sha, head);
  } else if (eventName === 'push') {
    head = event.after;
    // A new branch has no previous tree. Compare all tracked files instead.
    if (/^0+$/.test(event.before)) return git('ls-tree', '-r', '--name-only', '-z', head).split('\0').filter(Boolean);
    base = event.before;
  } else {
    throw new Error(`Unsupported change-detection event: ${eventName}`);
  }
  // Include both sides of renames so moving a build input into docs cannot
  // bypass its original gate. NUL separation supports spaces and newlines.
  return git('diff', '--no-renames', '--name-only', '-z', base, head).split('\0').filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const force = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    || process.env.GITHUB_REF?.startsWith('refs/tags/');
  const paths = force ? [] : changedPaths(process.env.GITHUB_EVENT_NAME, event);
  const gates = classify(paths, force);
  console.log(JSON.stringify({ paths, gates }, null, 2));
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(gates).map(([key, value]) => `${key}=${value}\n`).join(''));
}
