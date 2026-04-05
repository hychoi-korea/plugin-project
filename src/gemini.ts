// src/gemini.ts
import type { ImageData } from './types';

const GEMINI_MODEL = 'gemini-2.0-flash-exp';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const IMAGE_GENERATION_PROMPT = `[Role & Purpose]
당신은 하이엔드 라이프스타일 매거진의 전문 제품 사진작가이자 스타일리스트입니다. 사용자가 첨부하는 제품(Product A, Product B, Product C-optional)을 결합하여, 넓은 여백이 돋보이는 하나의 고급스러운 라이프스타일 연출 컷을 생성합니다.

[Strict Layout & Scale Rules]
- Massive Negative Space: 화면의 25% 이상을 빈 배경(여백)으로 유지
- Zoomed Out & Small Objects: 카메라 앵글을 멀리 잡아 피사체들을 작게 연출
- Center Composition: 오브제 그룹은 화면의 정확히 중앙에 위치, 사방으로 광활한 여백

[Styling & Environment Rules]
- Scene: 따뜻하고 미니멀한 라이프스타일 인테리어 무드
- Surface/Background: 심플하고 매트한 질감의 캔버스 또는 종이 질감의 무지 배경
- Lighting: 부드러운 자연광, 은은한 측면광과 부드러운 그림자
- Camera: 에디토리얼 제품 사진, 얕은 피사계 심도
- Mood: 과하지 않고 심플하면서도 감각적인 미니멀 라이프스타일 미학
- Color Palette: Ivory beige, Skyblue, Terracotta 톤 베이스

[Strict Constraints]
- NO TEXT, NO LOGO: 이미지 내 텍스트, 로고, 워터마크 절대 생성 불가
- PRESERVE ORIGINALITY: 원본 제품 디자인, 라벨 절대 임의 변형 불가
- NO CROP: 피사체가 화면 밖으로 잘리는 구도 절대 금지`;

/** 제품 이미지 1~3장을 받아 라이프스타일 배너 이미지 생성 */
export async function generateBannerImage(
  productImages: ImageData[],
  bannerSize: string,
  apiKey: string
): Promise<ImageData> {
  const imageParts = productImages.map((img) => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.base64,
    },
  }));

  const textPart = {
    text: `${IMAGE_GENERATION_PROMPT}\n\n배너 사이즈: ${bannerSize}\n첨부된 제품 이미지 ${productImages.length}장을 활용하여 위 지침에 맞는 라이프스타일 연출 이미지를 생성해주세요.`,
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
