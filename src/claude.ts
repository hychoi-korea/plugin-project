import type { CopyContent } from './types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `당신은 배너 카피 전문가입니다. 아이디어스(한국 핸드메이드 마켓) 배너에 들어갈 카피를 작성합니다.

다음 제약 조건을 반드시 지켜주세요:
- 메인 카피 전체(main_copy_03): 공백 포함 최대 16자
- 메인 카피 앞부분(main_copy_01): 어절 경계 기준 최대 8자 (main_copy_03의 앞부분)
- 메인 카피 뒷부분(main_copy_02): 어절 경계 기준 최대 8자 (main_copy_03의 뒷부분)
- m_band용 요약(main_copy_04): 공백 포함 최대 11자 (메인 카피의 핵심을 압축)
- 서브 카피(sub_copy): 공백 포함 최대 16자

반드시 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 출력하지 마세요:
{
  "main_copy_01": "앞부분",
  "main_copy_02": "뒷부분",
  "main_copy_03": "전체 메인 카피",
  "main_copy_04": "요약",
  "sub_copy": "서브 카피"
}`;

async function callClaude(userMessage: string, apiKey: string): Promise<CopyContent> {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude API 오류 (${response.status}): ${(err as any)?.error?.message ?? '알 수 없는 오류'}`);
  }

  const data = await response.json();
  const text: string = data.content[0].text;

  // JSON 블록 추출 (```json ... ``` 감싸인 경우 대응)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude 응답에서 JSON을 파싱할 수 없습니다.');

  const parsed = JSON.parse(jsonMatch[0]) as CopyContent;
  return parsed;
}

/** 키워드/설명에서 카피 생성 */
export async function generateCopy(input: string, apiKey: string): Promise<CopyContent> {
  return callClaude(
    `다음 내용을 바탕으로 배너 카피를 생성해주세요:\n${input}`,
    apiKey
  );
}

/** 기존 초안을 글자수 제한에 맞게 다듬기 */
export async function refineCopy(draft: string, apiKey: string): Promise<CopyContent> {
  return callClaude(
    `다음 카피 초안을 글자수 제한에 맞게 자연스럽게 다듬어주세요:\n${draft}`,
    apiKey
  );
}
