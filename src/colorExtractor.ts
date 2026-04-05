// src/colorExtractor.ts
// UI 스레드(브라우저)에서 실행. Canvas API 기반.
import type { RGBColor } from './types';

/** RGB → HEX (#RRGGBB 대문자) */
export function rgbToHex(color: RGBColor): string {
  return (
    '#' +
    [color.r, color.g, color.b]
      .map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

/** HEX → RGB. 유효하지 않으면 null */
export function hexToRgb(hex: string): RGBColor | null {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** RGB → HSL */
function rgbToHsl(c: RGBColor): [number, number, number] {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** HSL → RGB */
function hslToRgb(h: number, s: number, l: number): RGBColor {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** 색상을 4비트 정밀도로 양자화 */
function quantize(c: RGBColor): string {
  const q = (v: number) => Math.round(v / 16) * 16;
  return `${q(c.r)},${q(c.g)},${q(c.b)}`;
}

/**
 * ImageData에서 빈도 높은 키컬러 n개 추출.
 */
export function extractKeyColors(imageData: globalThis.ImageData, n = 3): RGBColor[] {
  const { data, width, height } = imageData;
  const freq: Map<string, { color: RGBColor; count: number }> = new Map();
  const step = 4;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const color: RGBColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const key = quantize(color);
      const entry = freq.get(key);
      if (entry) entry.count++;
      else freq.set(key, { color, count: 1 });
    }
  }

  return Array.from(freq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((e) => e.color);
}

/**
 * 주어진 색상들의 보색(HSL 색상환 180° 회전)을 계산.
 */
export function computeComplementaryColors(colors: RGBColor[], n = 3): RGBColor[] {
  return colors.slice(0, n).map((c) => {
    const [h, s, l] = rgbToHsl(c);
    const compH = (h + 0.5) % 1;
    const adjS = Math.max(0.4, Math.min(0.8, s));
    const adjL = Math.max(0.35, Math.min(0.75, l));
    return hslToRgb(compH, adjS, adjL);
  });
}

/**
 * HTMLImageElement를 Canvas로 렌더링하여 ImageData 추출.
 * UI 스레드에서만 호출 가능.
 */
export function getImageDataFromElement(img: HTMLImageElement): globalThis.ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * base64 이미지 문자열에서 ImageData 추출.
 */
export function getImageDataFromBase64(
  base64: string,
  mimeType: string
): Promise<globalThis.ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(getImageDataFromElement(img));
    img.onerror = () => resolve(null);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
