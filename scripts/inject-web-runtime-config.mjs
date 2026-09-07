import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const indexPath = resolve(distDir, 'index.html');
const runtimeConfigPath = resolve(distDir, 'runtime-config.js');
const scriptTag = '<script src="/runtime-config.js"></script>';

const html = await readFile(indexPath, 'utf8');
if (!html.includes('</head>')) {
  throw new Error(`Unable to inject runtime config: ${indexPath} has no </head> tag`);
}

const withRuntimeConfig = html.includes(scriptTag)
  ? html
  : html.replace('</head>', `  ${scriptTag}\n</head>`);

await writeFile(indexPath, withRuntimeConfig);
await writeFile(
  runtimeConfigPath,
  'globalThis.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: null };\n'
);
