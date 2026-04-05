// src/gemini.ts
import type { ImageData } from './types';

const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const IMAGE_GENERATION_PROMPT = `[Role & Purpose]
당신은 전문 제품 합성 사진작가입니다. 첨부된 제품 이미지들을 배경에 자연스럽게 합성하여 하나의 완성된 제품 이미지를 생성합니다.

[Core Rules]
- PRODUCT ONLY: 제품 이미지만 사용. 사람 손, 신체 부위 절대 포함 불가
- COMPOSITE: 제품을 배경의 조명 방향, 색온도, 밝기(조도)에 정확히 맞춰 합성
- 제품의 그림자와 반사광을 배경 환경에 맞게 자연스럽게 생성
- 제품 원본 디자인, 라벨, 색상 절대 변형 불가

[Layout Rules]
- 제품은 화면 중앙에 배치, 사방으로 충분한 여백 확보 (화면의 30% 이상)
- 제품이 화면 밖으로 잘리지 않도록 구도 설정
- 복수 제품의 경우 자연스러운 그룹 배치

[Strict Constraints]
- NO HANDS, NO BODY PARTS: 손, 팔 등 신체 일절 생성 금지
- NO TEXT, NO LOGO, NO WATERMARK: 텍스트, 로고, 워터마크 절대 생성 불가
- NO CROP: 피사체가 화면 밖으로 잘리는 구도 금지`;

/** 제품 이미지 1~3장을 받아 라이프스타일 배너 이미지 생성 */
export async function generateBannerImage(
  productImages: ImageData[],
  bannerSize: string,
  apiKey: string,
  backgroundColor?: string
): Promise<ImageData> {
  const imageParts = productImages.map((img) => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.base64,
    },
  }));

  const bgInstruction = backgroundColor
    ? `\n\n[배경색 지정] 배경색을 반드시 ${backgroundColor} (HEX) 색상으로 사용하세요. 이 색상을 기반으로 전체 배경과 분위기를 구성하세요.`
    : '';

  const textPart = {
    text: `${IMAGE_GENERATION_PROMPT}${bgInstruction}\n\n배너 사이즈: ${bannerSize}\n첨부된 제품 이미지 ${productImages.length}장을 활용하여 위 지침에 맞는 라이프스타일 연출 이미지를 생성해주세요.`,
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [...imageParts, textPart] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API 오류 (${response.status}): ${(err as any)?.error?.message ?? '알 수 없는 오류'}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: any) => p.inlineData?.data);

  if (!imagePart) throw new Error('이미지 데이터를 찾을 수 없습니다. Gemini 응답에 이미지가 없습니다.');

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType ?? 'image/png',
  };
}
