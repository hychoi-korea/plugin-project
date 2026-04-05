import { describe, it, expect } from 'vitest';
import { extractKeyColors, computeComplementaryColors, rgbToHex, hexToRgb } from '../src/colorExtractor';
import type { RGBColor } from '../src/types';

function makePixelData(colors: RGBColor[], width = 10, height = 10): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const colorsPerRow = Math.ceil((width * height) / colors.length);
  for (let i = 0; i < width * height; i++) {
    const color = colors[Math.floor(i / colorsPerRow) % colors.length];
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('extractKeyColors', () => {
  it('extracts dominant color from solid image', () => {
    const orange = { r: 255, g: 165, b: 0 };
    const imageData = makePixelData([orange]);
    const colors = extractKeyColors(imageData, 3);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors[0].r).toBeCloseTo(255, -1);
  });

  it('returns up to n colors', () => {
    const pixels = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ];
    const imageData = makePixelData(pixels);
    const colors = extractKeyColors(imageData, 3);
    expect(colors.length).toBeLessThanOrEqual(3);
  });
});

describe('computeComplementaryColors', () => {
  it('returns complementary colors (hue rotated 180°)', () => {
    const red: RGBColor = { r: 255, g: 0, b: 0 };
    const complements = computeComplementaryColors([red], 1);
    // 빨간색의 보색은 시안(0, 255, 255) 근처
    expect(complements[0].g).toBeGreaterThan(100);
    expect(complements[0].b).toBeGreaterThan(100);
  });

  it('returns at most n colors', () => {
    const colors: RGBColor[] = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
    ];
    const result = computeComplementaryColors(colors, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe('rgbToHex / hexToRgb', () => {
  it('converts rgb to hex', () => {
    expect(rgbToHex({ r: 255, g: 165, b: 0 })).toBe('#FFA500');
  });

  it('converts hex to rgb', () => {
    const result = hexToRgb('#FFA500');
    expect(result).toEqual({ r: 255, g: 165, b: 0 });
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('invalid')).toBeNull();
  });
});
