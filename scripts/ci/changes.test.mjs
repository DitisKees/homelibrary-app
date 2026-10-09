import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { classify, changedPaths } from './changes.mjs';

const none = { source: false, pocketbase: false, android: false, docker: false };
const all = { source: true, pocketbase: true, android: true, docker: true };
const app = { ...all, pocketbase: false };

for (const path of ['README.md', 'docs/self-hosting.md', 'docs/fdroid-harness.md',
  'scripts/diagnostics/parent-parity.sh', '.github/workflows/diagnostics-parent-parity.yml',
  'scripts/android-release-smoke-signing.gradle', '.github/workflows/android-reproducibility.yml', '.github/workflows/android-release-smoke.yml']) {
  test(`${path} does not start the application suite`, () => assert.deepEqual(classify([path]), none));
}
for (const path of ['src/screens/BookList.tsx', 'App.tsx', 'assets/icon.png',
  'modules/zxing/android/build.gradle', 'patches/expo-camera.patch',
  'plugins/with-reproducible-native-builds.js', 'package-lock.json', '.nvmrc',
  'tsconfig.json', 'scripts/patch-expo-camera.mjs', 'scripts/inject-web-runtime-config.mjs']) {
  test(`${path} retains quality, Android and Docker coverage`, () => assert.deepEqual(classify([path]), app));
}
for (const path of ['.fdroid.yml', 'scripts/fdroid/pins.env', 'scripts/fdroid/run-source-build.sh',
  'scripts/scan-fdroid-apk.sh', 'scripts/glide-ksp-repro.init.gradle',
  '.github/workflows/fdroid-buildserver-simulation.yml']) {
  test(`${path} runs Android and source checks, without Docker`, () => {
    assert.deepEqual(classify([path]), { ...none, source: true, android: true });
  });
}
test('Docker and backend changes have targeted coverage', () => {
  assert.deepEqual(classify(['docker/web/Dockerfile']), { ...none, docker: true });
  assert.deepEqual(classify(['pocketbase/pb_migrations/new.js']), { ...none, pocketbase: true, docker: true });
  assert.deepEqual(classify(['.github/workflows/docker-images.yml']), { ...none, docker: true });
});
test('CI configuration and unit tests do not recompile Android', () => {
  assert.deepEqual(classify(['.github/workflows/ci.yml', 'scripts/test-android-startup.py']), { ...none, source: true });
});
test('unknown production inputs and shared routing changes fail safe', () => {
  for (const path of ['new-build.config', 'scripts/new-build.sh', 'scripts/ci/changes.mjs', '.github/workflows/changes.yml']) {
    assert.deepEqual(classify([path]), all);
  }
});
test('mixed changes combine coverage and manual/tag builds force all gates', () => {
  assert.deepEqual(classify(['docs/fdroid.md', '.fdroid.yml', 'docker/backend/Dockerfile']), { ...app });
  assert.deepEqual(classify([], true), all);
  assert.deepEqual(classify([]), none);
});

test('Git diff handles PR merge bases, deletions, renames, new branches and multiline paths', () => {
  const original = process.cwd();
  const root = mkdtempSync(join(tmpdir(), 'homelibrary-change-test-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=CI', '-c', 'user.email=ci@example.invalid', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const write = (path, contents) => writeFileSync(join(root, path), contents);
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q');
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'docs'));
    write('src/app.ts', 'initial\n');
    write('docs/guide.md', 'initial\n');
    const base = commit();
    git('checkout', '-qb', 'feature');
    renameSync(join(root, 'src/app.ts'), join(root, 'docs/old-app.md'));
    write('src/name with\nnewline.ts', 'new\n');
    const head = commit();
    git('checkout', '-q', '-b', 'base-advanced', base);
    write('package.json', '{}\n');
    const advanced = commit();
    process.chdir(root);
    const paths = changedPaths('pull_request', { pull_request: { base: { sha: advanced }, head: { sha: head } } });
    assert.deepEqual(new Set(paths), new Set(['src/app.ts', 'docs/old-app.md', 'src/name with\nnewline.ts']));
    assert.deepEqual(classify(paths), app);
    assert.deepEqual(new Set(changedPaths('push', { before: base, after: head })), new Set(paths));
    assert.deepEqual(new Set(changedPaths('push', { before: '0'.repeat(40), after: head })),
      new Set(['docs/guide.md', 'docs/old-app.md', 'src/name with\nnewline.ts']));
    assert.throws(() => changedPaths('pull_request', { pull_request: { base: { sha: 'bad-sha' }, head: { sha: head } } }));
    assert.throws(() => changedPaths('unknown', {}), /Unsupported/);

    git('checkout', '-q', '-b', 'docs-only', base);
    write('docs/guide.md', 'documentation change\n');
    const docsHead = commit();
    const eventPath = join(root, 'event.json');
    const outputPath = join(root, 'output.txt');
    writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: advanced }, head: { sha: docsHead } } }));
    const env = { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
      GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/45/merge' };
    const script = join(original, 'scripts/ci/changes.mjs');
    const run = () => JSON.parse(execFileSync(process.execPath, [script], { env, encoding: 'utf8' }));
    assert.deepEqual(run().gates, none);
    assert.equal(readFileSync(outputPath, 'utf8'), 'source=false\npocketbase=false\nandroid=false\ndocker=false\n');
    env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    assert.deepEqual(run().gates, all);
    env.GITHUB_EVENT_NAME = 'push';
    env.GITHUB_REF = 'refs/tags/v1.0.11';
    assert.deepEqual(run().gates, all);

  } finally {
    process.chdir(original);
    rmSync(root, { recursive: true, force: true });
  }
});
