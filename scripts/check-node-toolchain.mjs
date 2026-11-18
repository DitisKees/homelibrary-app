import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

// .nvmrc is the patched development baseline, not a pin on Debian packages.
// Permit newer patches/minors in Node 24: Forky moves independently of upstream.
const baseline = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const [major, minor, patch] = baseline.split('.').map(Number);
const [actualMajor, actualMinor, actualPatch] = process.versions.node.split('.').map(Number);
assert.ok(actualMajor === major && (actualMinor > minor || (actualMinor === minor && actualPatch >= patch)),
  `Node ${baseline} or newer within major ${major} required; found ${process.version}`);
const npm = execFileSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
console.log(`Node.js ${process.version}; npm ${npm}; executable ${process.execPath}`);
