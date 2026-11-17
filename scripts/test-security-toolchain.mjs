import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

test('Node build tools use the patched Node 24 baseline and simple Debian recipe', () => {
  const version = read('.nvmrc').trim();
  assert.equal(version, '24.22.2');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.engines.node, `>=${version} <25`);
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].engines.node, pkg.engines.node);
  assert.ok(read('docker/web/Dockerfile').includes(`node:${version}-alpine AS build`));
  const recipe = read('.fdroid.yml');
  assert.equal(count(recipe, 'apt-get install -y -t forky nodejs npm'), 4);
  assert.equal(count(recipe, 'node scripts/check-node-toolchain.mjs'), 4);
  assert.ok(!recipe.includes('nodejs.org'));
  assert.ok(!recipe.includes('Pin-Priority'));
  assert.ok(!recipe.includes('nodejs='));
  for (const name of ['ci', 'android-release', 'android-release-smoke']) {
    const workflow = read(`.github/workflows/${name}.yml`);
    assert.ok(workflow.includes('node-version-file: .nvmrc'), name);
    assert.ok(workflow.includes('node scripts/check-node-toolchain.mjs'), name);
  }
  assert.ok(read('.github/workflows/android-reproducibility.yml').includes('scripts/fdroid/install-node-toolchain.sh'));
});

test('PocketBase runtime and CI use the patched release', () => {
  assert.equal(count(read('docker/backend/Dockerfile'), 'ARG PB_VERSION=0.40.6'), 2);
  assert.ok(read('.github/workflows/docker-images.yml').includes("PB_VERSION: '0.40.6'"));
  assert.ok(read('.github/workflows/ci.yml').includes('pocketbase_0.40.6_linux_amd64.zip'));
  assert.ok(read('scripts/test-docker-selfhost.sh').includes('PB_VERSION:-0.40.6'));
});

test('Alpine build and runtime images require patched CA certificates', () => {
  for (const path of ['docker/backend/Dockerfile', 'docker/web/Dockerfile']) {
    assert.equal(count(read(path), 'ca-certificates>=20261020-r0'), 2, path);
  }
});

test('the disposable public demo follows the patched main backend', () => {
  assert.ok(read('docker/demo/Dockerfile').includes('homelibrary-backend:main'));
});
