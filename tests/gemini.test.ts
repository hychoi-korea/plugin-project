// tests/gemini.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBannerImage } from '../src/gemini';
import type { ImageData } from '../src/types';

const MOCK_API_KEY = 'gemini-test-key';
const MOCK_IMAGE: ImageData = {
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  mimeType: 'image/png',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('generateBannerImage', () => {
  it('calls Gemini API and returns base64 image', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [
              { inlineData: { data: 'GENERATEDBASE64', mimeType: 'image/png' } }
            ]
          }
        }]
      }),
    }) as any;

    const result = await generateBannerImage([MOCK_IMAGE], '780x390', MOCK_API_KEY);
    expect(result.base64).toBe('GENERATEDBASE64');
    expect(result.mimeType).toBe('image/png');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad Request' } }),
    }) as any;

    await expect(
      generateBannerImage([MOCK_IMAGE], '780x390', MOCK_API_KEY)
    ).rejects.toThrow('Gemini API 오류');
  });

  it('throws when response has no image part', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'no image' }] } }]
      }),
    }) as any;

    await expect(
      generateBannerImage([MOCK_IMAGE], '780x390', MOCK_API_KEY)
    ).rejects.toThrow('이미지 데이터를 찾을 수 없습니다');
  });
});
