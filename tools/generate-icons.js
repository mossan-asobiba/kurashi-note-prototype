const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.join(__dirname, "..", "icons");

const COLORS = {
  bg: [242, 243, 247, 255],
  surface: [255, 255, 255, 255],
  ink: [47, 51, 55, 255],
  cyan: [35, 199, 195, 255],
  cyanSoft: [223, 248, 247, 255],
  pink: [245, 86, 138, 255],
  shadow: [47, 51, 55, 38],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}

function writePng(file, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

function blend(dst, src) {
  const a = src[3] / 255;
  const ia = 1 - a;
  return [
    Math.round(src[0] * a + dst[0] * ia),
    Math.round(src[1] * a + dst[1] * ia),
    Math.round(src[2] * a + dst[2] * ia),
    255,
  ];
}

function setPixel(img, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (Math.floor(y) * size + Math.floor(x)) * 4;
  const mixed = blend([img[i], img[i + 1], img[i + 2], img[i + 3]], color);
  img[i] = mixed[0];
  img[i + 1] = mixed[1];
  img[i + 2] = mixed[2];
  img[i + 3] = mixed[3];
}

function fillRect(img, size, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(size, Math.ceil(x + w));
  const y1 = Math.min(size, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) setPixel(img, size, xx, yy, color);
  }
}

function fillCircle(img, size, cx, cy, r, color) {
  const x0 = Math.floor(cx - r);
  const y0 = Math.floor(cy - r);
  const x1 = Math.ceil(cx + r);
  const y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) setPixel(img, size, x, y, color);
    }
  }
}

function fillRoundRect(img, size, x, y, w, h, r, color) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      const qx = Math.max(x - px, 0, px - (x + w));
      const qy = Math.max(y - py, 0, py - (y + h));
      const innerX = px >= x + r && px <= x + w - r;
      const innerY = py >= y + r && py <= y + h - r;
      if ((innerX && py >= y && py <= y + h) || (innerY && px >= x && px <= x + w) || Math.hypot(qx, qy) <= r) {
        setPixel(img, size, xx, yy, color);
      }
    }
  }
}

function strokeLine(img, size, x1, y1, x2, y2, width, color) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= width / 2) setPixel(img, size, x, y, color);
    }
  }
  fillCircle(img, size, x1, y1, width / 2, color);
  fillCircle(img, size, x2, y2, width / 2, color);
}

function makeIcon(size) {
  const img = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    img[i * 4] = COLORS.bg[0];
    img[i * 4 + 1] = COLORS.bg[1];
    img[i * 4 + 2] = COLORS.bg[2];
    img[i * 4 + 3] = 255;
  }
  const s = size / 512;
  const sc = (n) => n * s;

  fillRect(img, size, sc(30), sc(86), sc(92), sc(92), COLORS.pink);
  fillRect(img, size, sc(394), sc(330), sc(74), sc(74), COLORS.cyan);
  for (const x of [404, 432, 460]) {
    for (const y of [82, 112]) fillCircle(img, size, sc(x), sc(y), sc(7), COLORS.pink);
  }
  for (const x of [356, 380, 404]) strokeLine(img, size, sc(x), sc(70), sc(x + 22), sc(132), sc(10), COLORS.pink);

  fillRoundRect(img, size, sc(108), sc(112), sc(304), sc(308), sc(50), COLORS.shadow);
  fillRoundRect(img, size, sc(94), sc(88), sc(324), sc(328), sc(54), COLORS.surface);
  fillRoundRect(img, size, sc(132), sc(130), sc(210), sc(252), sc(30), COLORS.cyan);
  fillRoundRect(img, size, sc(164), sc(130), sc(178), sc(252), sc(30), COLORS.cyanSoft);
  fillRoundRect(img, size, sc(164), sc(130), sc(178), sc(72), sc(30), COLORS.cyan);
  fillRect(img, size, sc(164), sc(170), sc(178), sc(34), COLORS.cyan);

  fillRoundRect(img, size, sc(198), sc(235), sc(104), sc(19), sc(10), COLORS.ink);
  fillRoundRect(img, size, sc(198), sc(282), sc(70), sc(18), sc(9), [47, 51, 55, 184]);
  strokeLine(img, size, sc(202), sc(334), sc(234), sc(364), sc(22), COLORS.pink);
  strokeLine(img, size, sc(234), sc(364), sc(304), sc(280), sc(22), COLORS.pink);

  fillRoundRect(img, size, sc(316), sc(230), sc(78), sc(78), sc(18), COLORS.pink);
  strokeLine(img, size, sc(336), sc(253), sc(374), sc(253), sc(9), COLORS.surface);
  strokeLine(img, size, sc(355), sc(253), sc(355), sc(287), sc(9), COLORS.surface);
  strokeLine(img, size, sc(338), sc(274), sc(372), sc(274), sc(9), COLORS.surface);

  return img;
}

for (const size of [180, 192, 512]) {
  writePng(path.join(outDir, `icon-${size}.png`), size, size, makeIcon(size));
}
