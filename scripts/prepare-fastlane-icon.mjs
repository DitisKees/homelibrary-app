import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'assets', 'icon.png');
const destinationDir = path.join(root, 'fastlane', 'metadata', 'android', 'en-US', 'images');
const destination = path.join(destinationDir, 'icon.png');

if (!fs.existsSync(source)) {
  throw new Error(`Missing generated app icon: ${source}. Run npm run generate:app-icons first.`);
}

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);
process.stdout.write(`Copied ${path.relative(root, source)} to ${path.relative(root, destination)}.\n`);
