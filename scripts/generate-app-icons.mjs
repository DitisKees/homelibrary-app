import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { deflateSync } from 'node:zlib';

const SIZE = 1024;
const BLUE = [31, 111, 235, 255];
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const TRANSPARENT = [0, 0, 0, 0];

const outputDir = path.join(process.cwd(), 'assets');
fs.mkdirSync(outputDir, { recursive: true });

function image(fill) {
  const data = Buffer.alloc(SIZE * SIZE * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = fill[0];
    data[offset + 1] = fill[1];
    data[offset + 2] = fill[2];
    data[offset + 3] = fill[3];
  }
  return data;
}

function setPixel(data, x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const offset = (y * SIZE + x) * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

function fillRect(data, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, y0); y < Math.min(SIZE, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(SIZE, x1); x += 1) setPixel(data, x, y, color);
  }
}

function fillDisc(data, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(data, x, y, color);
    }
  }
}

function thickLine(data, x0, y0, x1, y1, width, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const radius = Math.floor(width / 2);
  for (let i = 0; i <= steps; i += 1) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    fillDisc(data, x, y, radius, color);
  }
}

function fillPolygon(data, points, color) {
  const minY = Math.max(0, Math.min(...points.map(([, y]) => y)));
  const maxY = Math.min(SIZE - 1, Math.max(...points.map(([, y]) => y)));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        intersections.push(Math.round(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      fillRect(data, intersections[i], y, intersections[i + 1] + 1, y + 1, color);
    }
  }
}

function drawMark(data, foreground, background) {
  thickLine(data, 230, 430, 512, 210, 54, foreground);
  thickLine(data, 512, 210, 794, 430, 54, foreground);
  thickLine(data, 292, 390, 292, 545, 54, foreground);
  thickLine(data, 732, 390, 732, 545, 54, foreground);

  fillPolygon(data, [[240, 520], [450, 555], [512, 620], [512, 790], [452, 728], [240, 690]], foreground);
  fillPolygon(data, [[784, 520], [574, 555], [512, 620], [512, 790], [572, 728], [784, 690]], foreground);
  fillRect(data, 501, 615, 523, 770, background);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(rgba) {
  const scanlines = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowOffset = y * (SIZE * 4 + 1);
    scanlines[rowOffset] = 0;
    rgba.copy(scanlines, rowOffset + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeIcon(filename, background, foreground) {
  const data = image(background);
  drawMark(data, foreground, background);
  fs.writeFileSync(path.join(outputDir, filename), encodePng(data));
}

writeIcon('icon.png', BLUE, WHITE);
writeIcon('android-icon-foreground.png', TRANSPARENT, WHITE);
writeIcon('android-icon-monochrome.png', TRANSPARENT, BLACK);

process.stdout.write('Generated 1024x1024 Android/app icon PNGs.\n');
