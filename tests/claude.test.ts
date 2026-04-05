import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCopy, refineCopy } from '../src/claude';

const MOCK_API_KEY = 'sk-ant-test';

const MOCK_COPY_RESPONSE = {
  main_copy_01: '여름 특가',
  main_copy_02: '지금 시작',
  main_copy_03: '여름 특가 지금 시작',
  main_copy_04: '여름 특가전',
  sub_copy: '최대 50% 할인 혜택을 누리세요',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('generateCopy', () => {
  it('calls Claude API and returns parsed CopyContent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(MOCK_COPY_RESPONSE) }],
      }),
    }) as any;

    const result = await generateCopy('여름 할인 배너', MOCK_API_KEY);
    expect(result.main_copy_01).toBe('여름 특가');
    expect(result.sub_copy).toBe('최대 50% 할인 혜택을 누리세요');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    }) as any;

    await expect(generateCopy('test', MOCK_API_KEY)).rejects.toThrow('Claude API 오류');
  });
});

describe('refineCopy', () => {
  it('calls Claude API with refine mode prompt', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(MOCK_COPY_RESPONSE) }],
      }),
    }) as any;

    const result = await refineCopy('여름세일 지금', MOCK_API_KEY);
    expect(result).toHaveProperty('main_copy_01');

    const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    const userMessage = callBody.messages[0].content;
    expect(userMessage).toContain('다듬어');
  });
});
