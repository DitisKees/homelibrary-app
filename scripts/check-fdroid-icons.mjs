import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const iconPaths = [
  'assets/icon.png',
  'assets/android-icon-foreground.png',
  'assets/android-icon-monochrome.png',
];

function hashFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`missing generated icon: ${relativePath}`);
  }
  return createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

function hashes() {
  return new Map(iconPaths.map((relativePath) => [relativePath, hashFile(relativePath)]));
}

const before = hashes();
const generated = spawnSync(process.execPath, ['scripts/generate-app-icons.mjs'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (generated.status !== 0) {
  process.stderr.write('[FAIL] App icon generator failed.\n');
  process.exit(generated.status ?? 1);
}

const after = hashes();
const changed = iconPaths.filter((relativePath) => before.get(relativePath) !== after.get(relativePath));

if (changed.length > 0) {
  process.stderr.write('[FAIL] App icon generation is not deterministic:\n');
  for (const relativePath of changed) {
    process.stderr.write(`- ${relativePath}: ${before.get(relativePath)} -> ${after.get(relativePath)}\n`);
  }
  process.exit(1);
}

process.stdout.write('[PASS] App icons are generated deterministically from committed source.\n');
for (const relativePath of iconPaths) {
  process.stdout.write(`- ${relativePath}: ${after.get(relativePath)}\n`);
}
