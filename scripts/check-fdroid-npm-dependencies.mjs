import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

if (lock.lockfileVersion !== 3 || !lock.packages) {
  process.stderr.write('[FAIL] F-Droid audit expects npm package-lock v3 with a packages map.\n');
  process.exit(1);
}

const approvedLicenseIdentifiers = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unicode-3.0',
  'Unlicense',
  'WTFPL',
  'Zlib',
]);

const approvedExceptions = new Set([
  'Classpath-exception-2.0',
  'GCC-exception-3.1',
]);

const operators = new Set(['AND', 'OR', 'WITH']);
const forbiddenNameFragments = [
  'firebase',
  'google-mobile-ads',
  'google-signin',
  'mlkit',
  'play-services',
];

function packageNameFromPath(packagePath) {
  return packagePath.replace(/^node_modules\//, '').replace(/\/node_modules\//g, ' > ');
}

function auditLicense(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return 'missing license metadata';
  }

  const normalized = expression.trim();
  if (/^(UNLICENSED|SEE LICENSE IN )/i.test(normalized)) {
    return `non-reviewable license expression: ${normalized}`;
  }

  const tokens = normalized.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? [];
  if (tokens.length === 0) return `unparseable license expression: ${normalized}`;

  const unreviewed = tokens.filter(
    (token) => !operators.has(token) && !approvedLicenseIdentifiers.has(token) && !approvedExceptions.has(token)
  );

  if (unreviewed.length > 0) {
    return `license requires explicit review: ${normalized} (unreviewed: ${[...new Set(unreviewed)].join(', ')})`;
  }

  return undefined;
}

const failures = [];
const runtimePackages = [];
const licenseExpressions = new Set();

for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  if (!packagePath.startsWith('node_modules/')) continue;
  if (metadata.dev === true) continue;

  const displayName = packageNameFromPath(packagePath);
  const leafName = packagePath.split('/node_modules/').at(-1);
  runtimePackages.push({ packagePath, displayName, leafName, metadata });

  const licenseFailure = auditLicense(metadata.license);
  if (licenseFailure) failures.push(`${displayName}@${metadata.version ?? '?'}: ${licenseFailure}`);
  else licenseExpressions.add(metadata.license.trim());

  if (typeof metadata.resolved === 'string' && !metadata.resolved.startsWith('https://registry.npmjs.org/')) {
    failures.push(`${displayName}@${metadata.version ?? '?'}: runtime package is not resolved from the public npm registry (${metadata.resolved})`);
  }

  const lowercaseName = leafName.toLowerCase();
  const forbidden = forbiddenNameFragments.find((fragment) => lowercaseName.includes(fragment));
  if (forbidden) {
    failures.push(`${displayName}@${metadata.version ?? '?'}: package name matches forbidden/suspect dependency family '${forbidden}'`);
  }
}

const directDependencies = Object.keys(packageJson.dependencies ?? {}).sort();
const directRows = [];
for (const name of directDependencies) {
  const lockEntry = lock.packages[`node_modules/${name}`];
  if (!lockEntry) {
    failures.push(`${name}: direct runtime dependency is missing from package-lock.json`);
    continue;
  }
  directRows.push({
    name,
    declared: packageJson.dependencies[name],
    resolved: lockEntry.version ?? '?',
    license: lockEntry.license ?? '?',
  });
}

if (failures.length > 0) {
  process.stderr.write('[FAIL] F-Droid npm dependency audit failed:\n');
  for (const failure of failures.sort()) process.stderr.write(`- ${failure}\n`);
  process.stderr.write('\nAdd/remove dependencies or explicitly extend the reviewed FLOSS-license policy after verifying the upstream license and source.\n');
  process.exit(1);
}

process.stdout.write(`[PASS] Reviewed ${runtimePackages.length} production npm package entries from package-lock.json.\n`);
process.stdout.write(`Observed reviewed license expressions: ${[...licenseExpressions].sort().join(', ')}\n`);
process.stdout.write('All audited runtime packages resolve from the public npm registry and no known non-free dependency-name family was found.\n\n');
process.stdout.write('Direct runtime dependencies:\n');
for (const row of directRows) {
  process.stdout.write(`- ${row.name}: ${row.resolved} (declared ${row.declared}; ${row.license})\n`);
}
