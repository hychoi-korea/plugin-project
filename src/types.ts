// src/types.ts

/** 카피 콘텐츠 — Claude API 응답 및 레이어 매핑에 사용 */
export interface CopyContent {
  main_copy_01: string; // 메인 카피 앞부분, 최대 8자
  main_copy_02: string; // 메인 카피 뒷부분, 최대 8자
  main_copy_03: string; // 메인 카피 전체, 최대 16자
  main_copy_04: string; // m_band용 요약, 최대 11자
  sub_copy: string;     // 서브 카피, 최대 16자
}

/** 이미지 데이터 (base64 + mimeType) */
export interface ImageData {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/** RGB 색상 */
export interface RGBColor {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
}

/** 팔레트 색상 항목 */
export interface ColorSwatch {
  name: string;
  hex: string;
}

/** 팔레트 그룹 */
export interface PaletteGroup {
  deep: ColorSwatch[];
  vivid: ColorSwatch[];
  light: ColorSwatch[];
  pastel: ColorSwatch[];
}

/** Claude API 요청 모드 */
export type CopyMode = 'generate' | 'refine';

/** 적용 페이로드 — UI → Main */
export interface ApplyPayload {
  copy: CopyContent;
  mainImage: ImageData | null;
  subImage01: ImageData | null;
  subImage02: ImageData | null;
  badgeComponentName: string | null;
  backgroundColor: string | null; // hex string, e.g. "#F5C57A"
}

/** UI → Main postMessage 타입 */
export type UIMessage =
  | { type: 'GET_API_KEYS' }
  | { type: 'SAVE_API_KEYS'; claudeKey: string; geminiKey: string }
  | { type: 'GET_SELECTION' }
  | { type: 'GET_BADGE_COMPONENTS' }
  | { type: 'APPLY_CONTENT'; payload: ApplyPayload }
  | { type: 'PREVIEW_COLOR'; color: string }
  | { type: 'CANCEL' };

/** Main → UI postMessage 타입 */
export type MainMessage =
  | { type: 'API_KEYS'; claudeKey: string; geminiKey: string }
  | { type: 'SELECTION_INFO'; nodeType: 'section' | 'frame' | 'none'; nodeName: string; frameCount: number }
  | { type: 'BADGE_COMPONENTS'; names: string[] }
  | { type: 'APPLY_DONE' }
  | { type: 'ERROR'; message: string };
