import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

test('Node build tools use the patched October 2026 security release', () => {
  assert.equal(read('.nvmrc').trim(), '22.23.4');
  assert.ok(read('docker/web/Dockerfile').includes('node:22.23.4-alpine AS build'));
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
