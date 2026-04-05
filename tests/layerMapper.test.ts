import { describe, it, expect } from 'vitest';
import { findLayerByName, splitMainCopy, buildLayerMap } from '../src/layerMapper';

// Figma SceneNode 최소 목업
function makeText(name: string, characters = ''): any {
  return { type: 'TEXT', name, characters, children: undefined };
}
function makeFrame(name: string, children: any[]): any {
  return { type: 'FRAME', name, children };
}
function makeImage(name: string): any {
  return { type: 'RECTANGLE', name, fills: [], children: undefined };
}
function makeComponent(name: string): any {
  return { type: 'INSTANCE', name, children: undefined };
}

describe('findLayerByName', () => {
  it('finds a direct child by name', () => {
    const frame = makeFrame('banner', [makeText('#main_copy_01')]);
    const result = findLayerByName(frame, '#main_copy_01');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('#main_copy_01');
  });

  it('finds a nested layer recursively', () => {
    const inner = makeFrame('inner', [makeText('#sub_copy')]);
    const frame = makeFrame('banner', [inner]);
    const result = findLayerByName(frame, '#sub_copy');
    expect(result?.name).toBe('#sub_copy');
  });

  it('returns null when not found', () => {
    const frame = makeFrame('banner', [makeText('#main_copy_01')]);
    expect(findLayerByName(frame, '#missing')).toBeNull();
  });
});

describe('splitMainCopy', () => {
  it('splits at word boundary within 8 chars', () => {
    const result = splitMainCopy('여름 특가전');
    expect(result.part1).toBe('여름');
    expect(result.part2).toBe('특가전');
    expect(result.part1.length).toBeLessThanOrEqual(8);
    expect(result.part2.length).toBeLessThanOrEqual(8);
  });

  it('splits 8-char string in half when no space', () => {
    const result = splitMainCopy('여름특가전시회');
    expect(result.part1.length).toBeLessThanOrEqual(8);
    expect(result.part2.length).toBeLessThanOrEqual(8);
    expect(result.part1 + result.part2).toBe('여름특가전시회');
  });

  it('handles exactly 8 chars', () => {
    const result = splitMainCopy('12345678');
    expect(result.part1 + result.part2).toBe('12345678');
  });
});

describe('buildLayerMap', () => {
  it('maps all expected layers in a frame', () => {
    const frame = makeFrame('m_main', [
      makeText('#main_copy_01'),
      makeText('#main_copy_02'),
      makeText('#main_copy_03'),
      makeText('#main_copy_04'),
      makeText('#sub_copy'),
      makeImage('image_main'),
      makeComponent('badge'),
    ]);
    const map = buildLayerMap(frame);
    expect(map.main_copy_01?.name).toBe('#main_copy_01');
    expect(map.main_copy_02?.name).toBe('#main_copy_02');
    expect(map.sub_copy?.name).toBe('#sub_copy');
    expect(map.image_main?.name).toBe('image_main');
    expect(map.badge?.name).toBe('badge');
  });

  it('skips missing optional layers (image_sub_01, image_sub_02)', () => {
    const frame = makeFrame('m_band', [makeText('#main_copy_04')]);
    const map = buildLayerMap(frame);
    expect(map.image_sub_01).toBeNull();
    expect(map.image_sub_02).toBeNull();
  });
});
