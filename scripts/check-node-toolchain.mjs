import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const version = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const { npmVersion } = JSON.parse(readFileSync(new URL('./node-toolchain.json', import.meta.url), 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(process.version, `v${version}`, 'Unexpected Node.js version; use .nvmrc');
const actualNpm = execFileSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
assert.equal(actualNpm, npmVersion, 'Unexpected npm version; use the bundled npm from the pinned Node release');
console.log(`Node.js ${process.version}; npm ${actualNpm}; executable ${process.execPath}`);
