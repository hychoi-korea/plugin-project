# Banner 생성기 Figma 플러그인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자이너와 콘텐츠 마케터를 위한 Figma 플러그인으로, Claude API(카피 생성/다듬기)와 Gemini API(이미지 생성)를 활용해 배너 템플릿 레이어에 콘텐츠를 자동으로 채운다.

**Architecture:** UI 스레드(ui.html → ui.js)에서 Claude/Gemini API를 직접 호출하고, 메인 스레드(code.ts → code.js)에서 Figma API로 레이어를 탐색·수정한다. 두 스레드 간 통신은 postMessage로만 이루어진다. 순수 로직(레이어 매핑, 컬러 추출, API 클라이언트)은 src/ 모듈로 분리해 Vitest로 단위 테스트한다.

**Tech Stack:** TypeScript 5, esbuild (번들링), Vitest + jsdom (테스트), Canvas API (컬러 추출), Claude API (claude-sonnet-4-6), Gemini API (gemini-2.0-flash-exp)

---

## 파일 구조

```
new plugin/
├── manifest.json           # 수정: networkAccess 도메인 추가
├── code.ts                 # 수정: 전체 재작성 (메인 스레드 — Figma API)
├── code.js                 # 빌드 결과 (esbuild)
├── ui.html                 # 수정: <script src="ui.js"> 참조 + HTML 구조
├── ui.js                   # 빌드 결과 (esbuild, src/ui/main.ts 진입점)
├── src/
│   ├── types.ts            # 공유 타입 정의 (두 스레드 모두 참조)
│   ├── layerMapper.ts      # 레이어 탐색·매핑 로직 (메인 스레드용)
│   ├── colorExtractor.ts   # 키컬러 추출 + 보색 계산 (UI 스레드용, Canvas API)
│   ├── palette.ts          # 아이디어스 팔레트 색상 정의
│   ├── claude.ts           # Claude API 클라이언트 (UI 스레드)
│   ├── gemini.ts           # Gemini API 클라이언트 (UI 스레드)
│   └── ui/
│       ├── main.ts         # UI 진입점, postMessage 핸들러 허브
│       ├── apiSettings.ts  # API 키 입력 섹션
│       ├── imageInput.ts   # 이미지 업로드 섹션 (drag&drop, paste, 레이어)
│       ├── copyWriter.ts   # 카피 작성 섹션 (Claude 연동)
│       ├── styleSection.ts # 뱃지·컬러 섹션 (Gemini 연동)
│       └── applySection.ts # 적용 섹션
├── tests/
│   ├── layerMapper.test.ts
│   ├── colorExtractor.test.ts
│   ├── claude.test.ts
│   └── gemini.test.ts
├── package.json            # 수정: esbuild, vitest 추가
├── tsconfig.json           # 수정: src 경로 포함
└── build.js                # esbuild 빌드 스크립트
```

---

## postMessage 프로토콜

**UI → Main:**
```typescript
{ type: 'GET_API_KEYS' }
{ type: 'SAVE_API_KEYS', claudeKey: string, geminiKey: string }
{ type: 'GET_SELECTION' }
{ type: 'GET_BADGE_COMPONENTS' }
{ type: 'APPLY_CONTENT', payload: ApplyPayload }
{ type: 'PREVIEW_COLOR', color: string }
{ type: 'CANCEL' }
```

**Main → UI:**
```typescript
{ type: 'API_KEYS', claudeKey: string, geminiKey: string }
{ type: 'SELECTION_INFO', nodeType: 'section'|'frame'|'none', nodeName: string, frameCount: number }
{ type: 'BADGE_COMPONENTS', names: string[] }
{ type: 'APPLY_DONE' }
{ type: 'ERROR', message: string }
```

---

## Task 1: 프로젝트 인프라 설정

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `build.js`

- [ ] **Step 1: manifest.json 업데이트**

```json
{
  "name": "Banner 생성기",
  "id": "1622491272292019458",
  "api": "1.0.0",
  "main": "code.js",
  "capabilities": [],
  "enableProposedApi": false,
  "documentAccess": "dynamic-page",
  "editorType": ["figma"],
  "ui": "ui.html",
  "networkAccess": {
    "allowedDomains": [
      "https://api.anthropic.com",
      "https://generativelanguage.googleapis.com"
    ]
  }
}
```

- [ ] **Step 2: package.json 업데이트**

```json
{
  "name": "banner-plugin",
  "version": "1.0.0",
  "description": "Banner 생성기 Figma 플러그인",
  "scripts": {
    "build": "node build.js",
    "watch": "node build.js --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@figma/plugin-typings": "*",
    "esbuild": "^0.25.0",
    "typescript": "^5.9.3",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "jsdom": "^26.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 3: npm install 실행**

```bash
cd "new plugin" && npm install
```

Expected: `node_modules/` 생성, esbuild와 vitest 설치 완료

- [ ] **Step 4: build.js 생성 (esbuild 빌드 스크립트)**

```javascript
// build.js
const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  target: 'es2017',
  logLevel: 'info',
};

async function build() {
  // 메인 스레드: code.ts → code.js
  const pluginCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['code.ts'],
    outfile: 'code.js',
    platform: 'browser',
  });

  // UI 스레드: src/ui/main.ts → ui.js
  const uiCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/ui/main.ts'],
    outfile: 'ui.js',
    platform: 'browser',
  });

  if (isWatch) {
    await pluginCtx.watch();
    await uiCtx.watch();
    console.log('Watching...');
  } else {
    await pluginCtx.rebuild();
    await uiCtx.rebuild();
    await pluginCtx.dispose();
    await uiCtx.dispose();
  }
}

build().catch(() => process.exit(1));
```

- [ ] **Step 5: tsconfig.json 업데이트**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["ES2017", "DOM"],
    "strict": true,
    "moduleResolution": "node",
    "module": "commonjs",
    "outDir": "./dist-types",
    "noEmit": true,
    "typeRoots": ["./node_modules/@types", "./node_modules/@figma"]
  },
  "include": ["code.ts", "src/**/*.ts"],
  "exclude": ["tests/**/*.ts", "node_modules"]
}
```

- [ ] **Step 6: src/ 디렉토리 구조 생성**

```bash
mkdir -p "src/ui" tests
```

- [ ] **Step 7: 빌드 확인 (아직 소스가 없으니 code.ts 임시 확인)**

```bash
node build.js
```

Expected: `code.js`, `ui.js` 생성 (현재는 code.ts만 존재하므로 code.js만 생성됨, ui.js는 Task 8 이후)

- [ ] **Step 8: Commit**

```bash
git init && git add manifest.json package.json tsconfig.json build.js
git commit -m "chore: project infrastructure setup — esbuild + vitest"
```

---

## Task 2: 공유 타입 정의

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: src/types.ts 작성**

```typescript
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
```

- [ ] **Step 2: 타입 컴파일 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음 (src/types.ts만 존재하므로 다른 파일 에러는 무시)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions"
```

---

## Task 3: 레이어 매퍼 모듈

**Files:**
- Create: `src/layerMapper.ts`
- Create: `tests/layerMapper.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/layerMapper.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run tests/layerMapper.test.ts
```

Expected: FAIL — "Cannot find module '../src/layerMapper'"

- [ ] **Step 3: layerMapper.ts 구현**

```typescript
// src/layerMapper.ts
// 주의: 이 모듈은 메인 스레드(code.ts)에서 import된다.
// Figma API의 SceneNode, FrameNode 타입을 사용한다.

/** name이 정확히 일치하는 레이어를 재귀 탐색. 없으면 null */
export function findLayerByName(
  node: SceneNode | FrameNode | SectionNode,
  name: string
): SceneNode | null {
  if (node.name === name) return node as SceneNode;
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findLayerByName(child as SceneNode, name);
      if (found) return found;
    }
  }
  return null;
}

/** name을 포함하는 레이어를 재귀 탐색. 없으면 null */
export function findLayerContaining(
  node: SceneNode | FrameNode | SectionNode,
  keyword: string
): SceneNode | null {
  if (node.name.includes(keyword)) return node as SceneNode;
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findLayerContaining(child as SceneNode, keyword);
      if (found) return found;
    }
  }
  return null;
}

/** 메인 카피를 어절 경계 기준으로 앞/뒤 8자씩 분리 */
export function splitMainCopy(copy: string): { part1: string; part2: string } {
  if (copy.length <= 8) return { part1: copy, part2: '' };

  // 공백(어절 경계) 기준으로 8자 이내 최적 분리점 탐색
  let splitIdx = 8;
  for (let i = Math.min(8, copy.length - 1); i >= 1; i--) {
    if (copy[i] === ' ') {
      splitIdx = i;
      break;
    }
  }

  const part1 = copy.slice(0, splitIdx).trim();
  const part2 = copy.slice(splitIdx).trim();
  return { part1, part2 };
}

/** 프레임 내 레이어 매핑 결과 */
export interface LayerMap {
  main_copy_01: SceneNode | null;
  main_copy_02: SceneNode | null;
  main_copy_03: SceneNode | null;
  main_copy_04: SceneNode | null;
  sub_copy: SceneNode | null;
  image_main: SceneNode | null;
  image_sub_01: SceneNode | null;
  image_sub_02: SceneNode | null;
  badge: SceneNode | null;
}

/** 프레임(또는 섹션)에서 레이어명 기반 매핑 */
export function buildLayerMap(node: SceneNode | FrameNode | SectionNode): LayerMap {
  return {
    main_copy_01: findLayerByName(node, '#main_copy_01'),
    main_copy_02: findLayerByName(node, '#main_copy_02'),
    main_copy_03: findLayerByName(node, '#main_copy_03'),
    main_copy_04: findLayerByName(node, '#main_copy_04'),
    sub_copy:     findLayerByName(node, '#sub_copy'),
    image_main:   findLayerContaining(node, 'image_main'),
    image_sub_01: findLayerContaining(node, 'image_sub_01'),
    image_sub_02: findLayerContaining(node, 'image_sub_02'),
    badge:        findLayerContaining(node, 'badge'),
  };
}

/** 섹션 선택 시 하위 프레임 목록 반환 */
export function getFramesFromSection(section: SectionNode): FrameNode[] {
  return section.children.filter(
    (child): child is FrameNode => child.type === 'FRAME'
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/layerMapper.test.ts
```

Expected: PASS — 모든 테스트 통과

- [ ] **Step 5: Commit**

```bash
git add src/layerMapper.ts tests/layerMapper.test.ts
git commit -m "feat: add layerMapper module with tests"
```

---

## Task 4: 컬러 추출 모듈

**Files:**
- Create: `src/colorExtractor.ts`
- Create: `tests/colorExtractor.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/colorExtractor.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run tests/colorExtractor.test.ts
```

Expected: FAIL — "Cannot find module '../src/colorExtractor'"

- [ ] **Step 3: colorExtractor.ts 구현**

```typescript
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

/** 색상을 4비트 정밀도로 양자화 (유사색 그룹핑) */
function quantize(c: RGBColor): string {
  const q = (v: number) => Math.round(v / 16) * 16;
  return `${q(c.r)},${q(c.g)},${q(c.b)}`;
}

/**
 * ImageData에서 빈도 높은 키컬러 n개 추출.
 * 픽셀을 샘플링(step=4)하여 양자화 후 빈도순 정렬.
 */
export function extractKeyColors(imageData: ImageData, n = 3): RGBColor[] {
  const { data, width, height } = imageData;
  const freq: Map<string, { color: RGBColor; count: number }> = new Map();
  const step = 4; // 4픽셀마다 샘플링

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue; // 투명 픽셀 스킵
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
 * 주어진 색상들의 보색(HSL 색상환 180° 회전)을 계산해 n개 반환.
 * 채도와 명도는 중간값으로 보정하여 배너에 어울리는 컬러 생성.
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
export function getImageDataFromElement(img: HTMLImageElement): ImageData | null {
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
 * Promise 반환 (이미지 로드 비동기).
 */
export function getImageDataFromBase64(
  base64: string,
  mimeType: string
): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(getImageDataFromElement(img));
    img.onerror = () => resolve(null);
    img.src = `data:${mimeType};base64,${base64}`;
  });
}
```

- [ ] **Step 4: vitest.config.ts 생성 (jsdom 환경 설정)**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run tests/colorExtractor.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/colorExtractor.ts tests/colorExtractor.test.ts vitest.config.ts
git commit -m "feat: add colorExtractor module with tests"
```

---

## Task 5: 아이디어스 팔레트 정의

**Files:**
- Create: `src/palette.ts`

- [ ] **Step 1: src/palette.ts 작성**

> 실제 HEX 값은 Figma 디자인 시스템에서 확인 후 업데이트 필요.
> 아래는 PDF 색상명 기반 근사값.

```typescript
// src/palette.ts
import type { ColorSwatch, PaletteGroup } from './types';

export const IDEAS_PALETTE: PaletteGroup = {
  deep: [
    { name: '딥 오렌지',   hex: '#C19025' },
    { name: '딥 레드',     hex: '#A83232' },
    { name: '딥 핑크',     hex: '#C14878' },
    { name: '딥 바이올렛', hex: '#7C3D8A' },
    { name: '딥 퍼플',     hex: '#4A3580' },
    { name: '딥 블루',     hex: '#1E3F82' },
    { name: '딥 민트',     hex: '#1A6E6A' },
    { name: '딥 그린',     hex: '#2A5C30' },
    { name: '딥 라임',     hex: '#4A7010' },
    { name: '딥 카키',     hex: '#5C4E20' },
    { name: '딥 레몬',     hex: '#8A7A10' },
    { name: '딥 옐로우',   hex: '#A88A10' },
    { name: '딥 브라운',   hex: '#6B3A1A' },
  ],
  vivid: [
    { name: '비비드 오렌지',   hex: '#FF6B00' },
    { name: '비비드 레드',     hex: '#FF2020' },
    { name: '비비드 핑크',     hex: '#FF3D8A' },
    { name: '비비드 바이올렛', hex: '#C040D8' },
    { name: '비비드 퍼플',     hex: '#7040E8' },
    { name: '비비드 블루',     hex: '#1C60FF' },
    { name: '비비드 민트',     hex: '#00C8A0' },
    { name: '비비드 그린',     hex: '#20A840' },
    { name: '비비드 라임',     hex: '#80D000' },
    { name: '비비드 카키',     hex: '#8A9020' },
    { name: '비비드 레몬',     hex: '#F0D800' },
    { name: '비비드 옐로우',   hex: '#FFD010' },
    { name: '비비드 브라운',   hex: '#C06020' },
  ],
  light: [
    { name: '라이트 오렌지',   hex: '#FFD8A8' },
    { name: '라이트 레드',     hex: '#FFB0A0' },
    { name: '라이트 핑크',     hex: '#FFC0D8' },
    { name: '라이트 바이올렛', hex: '#D8B8F8' },
    { name: '라이트 퍼플',     hex: '#C8C0F8' },
    { name: '라이트 블루',     hex: '#A8D8F8' },
    { name: '라이트 민트',     hex: '#A0E8D8' },
    { name: '라이트 그린',     hex: '#B8E8B8' },
    { name: '라이트 라임',     hex: '#D0F0A0' },
    { name: '라이트 카키',     hex: '#D8D8A8' },
    { name: '라이트 레몬',     hex: '#F8F0A0' },
    { name: '라이트 옐로우',   hex: '#FFF0B0' },
    { name: '라이트 브라운',   hex: '#E8D0B8' },
  ],
  pastel: [
    { name: '파스텔 오렌지',   hex: '#FFE8CC' },
    { name: '파스텔 레드',     hex: '#FFD8D0' },
    { name: '파스텔 핑크',     hex: '#FFD8E8' },
    { name: '파스텔 바이올렛', hex: '#ECD8F8' },
    { name: '파스텔 퍼플',     hex: '#E4E0F8' },
    { name: '파스텔 블루',     hex: '#D4ECF8' },
    { name: '파스텔 민트',     hex: '#D0F4EC' },
    { name: '파스텔 그린',     hex: '#D8F0D8' },
    { name: '파스텔 라임',     hex: '#E8F8D0' },
    { name: '파스텔 카키',     hex: '#ECEDD8' },
    { name: '파스텔 레몬',     hex: '#F8F8D8' },
    { name: '파스텔 옐로우',   hex: '#FFF8DC' },
    { name: '파스텔 브라운',   hex: '#F4E8DC' },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/palette.ts
git commit -m "feat: add Idéas color palette definition"
```

---

## Task 6: Claude API 클라이언트

**Files:**
- Create: `src/claude.ts`
- Create: `tests/claude.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/claude.test.ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run tests/claude.test.ts
```

Expected: FAIL

- [ ] **Step 3: claude.ts 구현**

```typescript
// src/claude.ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/claude.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/claude.ts tests/claude.test.ts
git commit -m "feat: add Claude API client with tests"
```

---

## Task 7: Gemini API 클라이언트

**Files:**
- Create: `src/gemini.ts`
- Create: `tests/gemini.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run tests/gemini.test.ts
```

Expected: FAIL

- [ ] **Step 3: gemini.ts 구현**

```typescript
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
  const imageParts = productImages.map((img, i) => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.base64,
    },
    ...(i === 0 ? {} : {}),
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/gemini.test.ts
```

Expected: PASS

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
npx vitest run
```

Expected: 모든 테스트 PASS

- [ ] **Step 6: Commit**

```bash
git add src/gemini.ts tests/gemini.test.ts
git commit -m "feat: add Gemini API client with tests"
```

---

## Task 8: 메인 스레드 (code.ts)

**Files:**
- Modify: `code.ts` (전체 재작성)

- [ ] **Step 1: code.ts 전체 재작성**

```typescript
// code.ts — Figma 메인 스레드
// 주의: fetch 사용 불가. Figma API만 사용.
import { buildLayerMap, getFramesFromSection, splitMainCopy } from './src/layerMapper';
import type { UIMessage, MainMessage, ApplyPayload, CopyContent } from './src/types';

const PLUGIN_WIDTH = 360;
const PLUGIN_HEIGHT = 640;

figma.showUI(__html__, { width: PLUGIN_WIDTH, height: PLUGIN_HEIGHT, title: 'Banner 생성기' });

// 초기화: API 키 로드 + 선택 노드 정보 전송
async function init() {
  const claudeKey = (await figma.clientStorage.getAsync('claudeKey')) ?? '';
  const geminiKey = (await figma.clientStorage.getAsync('geminiKey')) ?? '';
  sendToUI({ type: 'API_KEYS', claudeKey, geminiKey });
  sendSelectionInfo();
}

function sendToUI(msg: MainMessage) {
  figma.ui.postMessage(msg);
}

function sendSelectionInfo() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    sendToUI({ type: 'SELECTION_INFO', nodeType: 'none', nodeName: '', frameCount: 0 });
    return;
  }
  const node = selection[0];
  if (node.type === 'SECTION') {
    const frames = getFramesFromSection(node as SectionNode);
    sendToUI({ type: 'SELECTION_INFO', nodeType: 'section', nodeName: node.name, frameCount: frames.length });
  } else if (node.type === 'FRAME') {
    sendToUI({ type: 'SELECTION_INFO', nodeType: 'frame', nodeName: node.name, frameCount: 1 });
  } else {
    sendToUI({ type: 'SELECTION_INFO', nodeType: 'none', nodeName: node.name, frameCount: 0 });
  }
}

/** 파일 내 badge 이름을 포함한 컴포넌트 탐색 */
async function getBadgeComponents(): Promise<string[]> {
  await figma.loadAllPagesAsync();
  const components = figma.root.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
  const names = components
    .filter((c) => c.name.toLowerCase().includes('badge'))
    .map((c) => c.name);
  return [...new Set(names)];
}

/** 단일 프레임에 콘텐츠 적용 */
async function applyToFrame(frame: FrameNode, payload: ApplyPayload) {
  const map = buildLayerMap(frame);
  const copy: CopyContent = payload.copy;
  const { part1, part2 } = splitMainCopy(copy.main_copy_03);

  // 텍스트 레이어 적용
  const textUpdates: Array<[typeof map.main_copy_01, string]> = [
    [map.main_copy_01, part1],
    [map.main_copy_02, part2],
    [map.main_copy_03, copy.main_copy_03],
    [map.main_copy_04, copy.main_copy_04],
    [map.sub_copy, copy.sub_copy],
  ];

  for (const [layer, text] of textUpdates) {
    if (layer && layer.type === 'TEXT') {
      await figma.loadFontAsync((layer as TextNode).fontName as FontName);
      (layer as TextNode).characters = text;
    }
  }

  // 배경 컬러 적용
  if (payload.backgroundColor) {
    const hex = payload.backgroundColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    frame.fills = [{ type: 'SOLID', color: { r, g, b } }];
  }

  // 이미지 적용 헬퍼
  async function applyImage(layer: typeof map.image_main, imageData: typeof payload.mainImage) {
    if (!layer || !imageData) return;
    const bytes = Uint8Array.from(atob(imageData.base64), (c) => c.charCodeAt(0));
    const imageHash = figma.createImage(bytes).hash;
    (layer as RectangleNode).fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }];
  }

  await applyImage(map.image_main, payload.mainImage);
  await applyImage(map.image_sub_01, payload.subImage01);
  await applyImage(map.image_sub_02, payload.subImage02);

  // 뱃지 컴포넌트 교체
  if (map.badge && payload.badgeComponentName) {
    const component = figma.root.findOne(
      (n) => n.type === 'COMPONENT' && n.name === payload.badgeComponentName
    ) as ComponentNode | null;
    if (component && map.badge.type === 'INSTANCE') {
      (map.badge as InstanceNode).swapComponent(component);
    }
  }
}

/** 컬러 프리뷰: 선택된 프레임의 배경색만 임시 변경 */
function previewColor(color: string) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return;
  const node = selection[0];
  if (node.type !== 'FRAME') return;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  (node as FrameNode).fills = [{ type: 'SOLID', color: { r, g, b } }];
}

// 메시지 핸들러
figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    switch (msg.type) {
      case 'GET_API_KEYS': {
        const claudeKey = (await figma.clientStorage.getAsync('claudeKey')) ?? '';
        const geminiKey = (await figma.clientStorage.getAsync('geminiKey')) ?? '';
        sendToUI({ type: 'API_KEYS', claudeKey, geminiKey });
        break;
      }
      case 'SAVE_API_KEYS': {
        await figma.clientStorage.setAsync('claudeKey', msg.claudeKey);
        await figma.clientStorage.setAsync('geminiKey', msg.geminiKey);
        break;
      }
      case 'GET_SELECTION': {
        sendSelectionInfo();
        break;
      }
      case 'GET_BADGE_COMPONENTS': {
        const names = await getBadgeComponents();
        sendToUI({ type: 'BADGE_COMPONENTS', names });
        break;
      }
      case 'APPLY_CONTENT': {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          sendToUI({ type: 'ERROR', message: '적용할 섹션 또는 프레임을 선택해주세요.' });
          return;
        }
        const node = selection[0];
        if (node.type === 'SECTION') {
          const frames = getFramesFromSection(node as SectionNode);
          for (const frame of frames) await applyToFrame(frame, msg.payload);
        } else if (node.type === 'FRAME') {
          await applyToFrame(node as FrameNode, msg.payload);
        } else {
          sendToUI({ type: 'ERROR', message: '섹션 또는 프레임을 선택해주세요.' });
          return;
        }
        sendToUI({ type: 'APPLY_DONE' });
        break;
      }
      case 'PREVIEW_COLOR': {
        previewColor(msg.color);
        break;
      }
      case 'CANCEL': {
        figma.closePlugin();
        break;
      }
    }
  } catch (e: any) {
    sendToUI({ type: 'ERROR', message: e.message ?? '알 수 없는 오류가 발생했습니다.' });
  }
};

// 선택 변경 감지
figma.on('selectionchange', sendSelectionInfo);

init();
```

- [ ] **Step 2: 빌드 확인**

```bash
node build.js
```

Expected: `code.js` 생성 완료, 에러 없음

- [ ] **Step 3: Commit**

```bash
git add code.ts
git commit -m "feat: implement Figma main thread with full postMessage protocol"
```

---

## Task 9: UI 셸 + API 설정 섹션

**Files:**
- Modify: `ui.html`
- Create: `src/ui/main.ts`
- Create: `src/ui/apiSettings.ts`

- [ ] **Step 1: ui.html 재작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Banner 생성기</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #333; background: #fff; }
    .section { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
    .section-title { font-size: 11px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .section-body { display: none; }
    .section-body.open { display: block; }
    label { display: block; font-size: 11px; color: #555; margin-bottom: 4px; margin-top: 8px; }
    input[type="text"], input[type="password"], textarea, select {
      width: 100%; padding: 6px 8px; border: 1px solid #e0e0e0; border-radius: 4px;
      font-size: 12px; outline: none; transition: border-color 0.15s;
    }
    input:focus, textarea:focus, select:focus { border-color: #18A0FB; }
    button { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; transition: background 0.15s; }
    .btn-primary { background: #18A0FB; color: #fff; }
    .btn-primary:hover { background: #0D8DE3; }
    .btn-primary:disabled { background: #a0cdf8; cursor: not-allowed; }
    .btn-secondary { background: #f5f5f5; color: #333; border: 1px solid #e0e0e0; }
    .btn-secondary:hover { background: #eee; }
    .error-msg { color: #E53935; font-size: 11px; margin-top: 4px; }
    .success-msg { color: #43A047; font-size: 11px; margin-top: 4px; }
    .char-count { font-size: 10px; color: #999; text-align: right; }
    .char-count.over { color: #E53935; }
    .row { display: flex; gap: 6px; align-items: center; }
    .spinner { display: none; width: 14px; height: 14px; border: 2px solid #e0e0e0; border-top-color: #18A0FB; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #apply-section { padding: 12px 16px; position: sticky; bottom: 0; background: #fff; border-top: 1px solid #e0e0e0; }
    .selection-info { font-size: 11px; color: #666; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div id="app">
    <!-- API 설정 -->
    <div class="section" id="sec-api">
      <div class="section-title" data-target="body-api">🔑 API 설정 <span class="toggle-icon">▼</span></div>
      <div class="section-body open" id="body-api">
        <label>Claude API Key</label>
        <input type="password" id="claude-key" placeholder="sk-ant-..." autocomplete="off">
        <label>Gemini API Key</label>
        <input type="password" id="gemini-key" placeholder="AIza..." autocomplete="off">
        <div class="row" style="margin-top:8px;">
          <button class="btn-primary" id="btn-save-keys">저장</button>
          <span class="success-msg" id="keys-saved" style="display:none">저장됨</span>
        </div>
      </div>
    </div>

    <!-- 이미지 입력 -->
    <div class="section" id="sec-image"></div>

    <!-- 카피 작성 -->
    <div class="section" id="sec-copy"></div>

    <!-- 스타일 설정 -->
    <div class="section" id="sec-style"></div>

    <!-- 적용 -->
    <div id="apply-section"></div>
  </div>
  <script src="ui.js"></script>
</body>
</html>
```

- [ ] **Step 2: src/ui/apiSettings.ts 작성**

```typescript
// src/ui/apiSettings.ts

export function initApiSettings(
  onSave: (claudeKey: string, geminiKey: string) => void
) {
  const claudeInput = document.getElementById('claude-key') as HTMLInputElement;
  const geminiInput = document.getElementById('gemini-key') as HTMLInputElement;
  const saveBtn = document.getElementById('btn-save-keys') as HTMLButtonElement;
  const savedMsg = document.getElementById('keys-saved') as HTMLElement;

  saveBtn.addEventListener('click', () => {
    const claudeKey = claudeInput.value.trim();
    const geminiKey = geminiInput.value.trim();
    if (!claudeKey || !geminiKey) {
      alert('Claude API Key와 Gemini API Key를 모두 입력해주세요.');
      return;
    }
    onSave(claudeKey, geminiKey);
    savedMsg.style.display = 'inline';
    setTimeout(() => (savedMsg.style.display = 'none'), 2000);
  });

  // 섹션 토글
  document.querySelectorAll('.section-title').forEach((title) => {
    title.addEventListener('click', () => {
      const targetId = title.getAttribute('data-target');
      if (!targetId) return;
      const body = document.getElementById(targetId);
      if (!body) return;
      body.classList.toggle('open');
      const icon = title.querySelector('.toggle-icon') as HTMLElement;
      if (icon) icon.textContent = body.classList.contains('open') ? '▼' : '▶';
    });
  });

  return {
    setKeys(claudeKey: string, geminiKey: string) {
      claudeInput.value = claudeKey;
      geminiInput.value = geminiKey;
    },
    getClaudeKey: () => claudeInput.value.trim(),
    getGeminiKey: () => geminiInput.value.trim(),
  };
}
```

- [ ] **Step 3: src/ui/main.ts 진입점 (스텁)**

```typescript
// src/ui/main.ts
import { initApiSettings } from './apiSettings';
import type { MainMessage, UIMessage } from '../types';

// postMessage 전송 헬퍼
function sendToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// 메인 스레드로부터 메시지 수신
window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as MainMessage;
  if (!msg) return;
  handleMessage(msg);
};

let apiSettings: ReturnType<typeof initApiSettings>;

function handleMessage(msg: MainMessage) {
  switch (msg.type) {
    case 'API_KEYS':
      apiSettings?.setKeys(msg.claudeKey, msg.geminiKey);
      break;
    case 'ERROR':
      alert(`오류: ${msg.message}`);
      break;
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  apiSettings = initApiSettings((claudeKey, geminiKey) => {
    sendToPlugin({ type: 'SAVE_API_KEYS', claudeKey, geminiKey });
  });

  sendToPlugin({ type: 'GET_API_KEYS' });
  sendToPlugin({ type: 'GET_SELECTION' });
});

// 다른 섹션에서 사용할 수 있도록 export
export { sendToPlugin };
```

- [ ] **Step 4: 빌드 확인**

```bash
node build.js
```

Expected: `code.js`, `ui.js` 모두 생성, 에러 없음

- [ ] **Step 5: Figma에서 수동 확인**
  - Figma 데스크탑 앱 → Plugins → Development → Import plugin from manifest
  - `new plugin/manifest.json` 선택
  - 플러그인 실행 → API 설정 섹션이 보이고 Key 입력·저장이 작동하는지 확인

- [ ] **Step 6: Commit**

```bash
git add ui.html src/ui/main.ts src/ui/apiSettings.ts
git commit -m "feat: UI shell + API settings section"
```

---

## Task 10: UI 이미지 입력 섹션

**Files:**
- Create: `src/ui/imageInput.ts`
- Modify: `src/ui/main.ts`

- [ ] **Step 1: src/ui/imageInput.ts 작성**

```typescript
// src/ui/imageInput.ts
import type { ImageData } from '../types';

type SlotId = 'main' | 'sub01' | 'sub02';

interface ImageSlot {
  id: SlotId;
  label: string;
  required: boolean;
}

const SLOTS: ImageSlot[] = [
  { id: 'main', label: '메인 이미지', required: true },
  { id: 'sub01', label: '서브 이미지 1', required: false },
  { id: 'sub02', label: '서브 이미지 2', required: false },
];

function fileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeType = header.match(/data:(.*);base64/)?.[1] as ImageData['mimeType'];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

export function initImageInput(
  container: HTMLElement,
  onChange: (images: { main: ImageData | null; sub01: ImageData | null; sub02: ImageData | null }) => void
) {
  const images: { main: ImageData | null; sub01: ImageData | null; sub02: ImageData | null } = {
    main: null, sub01: null, sub02: null,
  };

  container.innerHTML = `
    <div class="section-title" data-target="body-image">🖼️ 이미지 입력 <span class="toggle-icon">▼</span></div>
    <div class="section-body open" id="body-image">
      ${SLOTS.map((slot) => `
        <div style="margin-bottom:8px;">
          <label>${slot.label}${slot.required ? ' *' : ''}</label>
          <div class="drop-zone" id="drop-${slot.id}"
            style="border:2px dashed #e0e0e0; border-radius:6px; padding:12px; text-align:center; cursor:pointer; position:relative; min-height:60px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:4px; font-size:11px; color:#999;">
            <span id="drop-label-${slot.id}">드래그 앤 드롭 또는 클릭하여 선택</span>
            <span style="font-size:10px;">클립보드 붙여넣기(Ctrl+V)도 가능</span>
            <input type="file" accept="image/*" style="display:none" id="file-${slot.id}">
            <img id="preview-${slot.id}" style="max-width:100%; max-height:80px; display:none; border-radius:4px; margin-top:4px;">
          </div>
          <button class="btn-secondary" id="btn-figma-${slot.id}" style="margin-top:4px; width:100%; font-size:11px;">
            피그마 레이어에서 가져오기
          </button>
        </div>
      `).join('')}
    </div>
  `;

  SLOTS.forEach((slot) => {
    const dropZone = document.getElementById(`drop-${slot.id}`) as HTMLElement;
    const fileInput = document.getElementById(`file-${slot.id}`) as HTMLInputElement;
    const preview = document.getElementById(`preview-${slot.id}`) as HTMLImageElement;
    const dropLabel = document.getElementById(`drop-label-${slot.id}`) as HTMLElement;

    async function applyFile(file: File) {
      if (!isImageFile(file)) return;
      const imageData = await fileToImageData(file);
      (images as any)[slot.id] = imageData;
      preview.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
      preview.style.display = 'block';
      dropLabel.textContent = file.name;
      dropZone.style.borderColor = '#18A0FB';
      onChange({ ...images });
    }

    // 클릭 → 파일 선택
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) applyFile(fileInput.files[0]);
    });

    // 드래그 앤 드롭
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#18A0FB';
      dropZone.style.background = '#f0f8ff';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#e0e0e0';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#e0e0e0';
      dropZone.style.background = '';
      const file = e.dataTransfer?.files[0];
      if (file) applyFile(file);
    });

    // 피그마 레이어에서 가져오기 버튼 (향후 메인 스레드에서 처리)
    document.getElementById(`btn-figma-${slot.id}`)?.addEventListener('click', () => {
      alert('피그마 캔버스에서 이미지 레이어를 선택한 후 이 버튼을 누르세요. (Task 10 이후 구현)');
    });
  });

  // 클립보드 붙여넣기 (전역)
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // 메인 이미지가 비어있으면 메인에, 아니면 첫 빈 슬롯에
          const emptySlot = SLOTS.find((s) => !(images as any)[s.id]);
          if (emptySlot) {
            const dropZone = document.getElementById(`drop-${emptySlot.id}`) as HTMLElement;
            const preview = document.getElementById(`preview-${emptySlot.id}`) as HTMLImageElement;
            const dropLabel = document.getElementById(`drop-label-${emptySlot.id}`) as HTMLElement;
            const imageData = await fileToImageData(file);
            (images as any)[emptySlot.id] = imageData;
            preview.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
            preview.style.display = 'block';
            dropLabel.textContent = '클립보드에서 붙여넣기';
            dropZone.style.borderColor = '#18A0FB';
            onChange({ ...images });
          }
          break;
        }
      }
    }
  });

  return {
    getImages: () => ({ ...images }),
  };
}
```

- [ ] **Step 2: main.ts에 이미지 섹션 연결**

```typescript
// src/ui/main.ts 에 추가 (import 및 초기화)
import { initImageInput } from './imageInput';
// ... 기존 코드 아래 DOMContentLoaded 내부에 추가:

let currentImages = { main: null, sub01: null, sub02: null };

const imageInput = initImageInput(
  document.getElementById('sec-image')!,
  (imgs) => { currentImages = imgs as any; }
);
```

- [ ] **Step 3: 빌드 후 Figma에서 확인**

```bash
node build.js
```

이미지 업로드, 드래그앤드롭, 클립보드 붙여넣기가 동작하는지 Figma에서 확인.

- [ ] **Step 4: Commit**

```bash
git add src/ui/imageInput.ts src/ui/main.ts
git commit -m "feat: image input section with drag&drop, clipboard paste"
```

---

## Task 11: UI 카피 작성 섹션

**Files:**
- Create: `src/ui/copyWriter.ts`
- Modify: `src/ui/main.ts`

- [ ] **Step 1: src/ui/copyWriter.ts 작성**

```typescript
// src/ui/copyWriter.ts
import { generateCopy, refineCopy } from '../claude';
import type { CopyContent } from '../types';

export function initCopyWriter(
  container: HTMLElement,
  getClaudeKey: () => string,
  onChange: (copy: CopyContent) => void
) {
  container.innerHTML = `
    <div class="section-title" data-target="body-copy">✍️ 카피 작성 <span class="toggle-icon">▼</span></div>
    <div class="section-body open" id="body-copy">
      <label>키워드 / 설명 (AI 생성용)</label>
      <div class="row">
        <input type="text" id="copy-keyword" placeholder="예: 여름 할인 이벤트, 핸드메이드 가방" style="flex:1">
        <button class="btn-primary" id="btn-generate">AI 생성</button>
        <div class="spinner" id="spinner-generate"></div>
      </div>

      <div style="margin-top:12px; padding-top:12px; border-top:1px solid #f0f0f0;">
        <label>메인 카피 초안 (최대 16자)</label>
        <div class="row">
          <input type="text" id="main-copy-input" maxlength="20" placeholder="직접 입력 후 AI 다듬기" style="flex:1">
          <button class="btn-secondary" id="btn-refine">AI 다듬기</button>
          <div class="spinner" id="spinner-refine"></div>
        </div>
        <div class="char-count" id="main-count">0 / 16자</div>

        <label>서브 카피 초안 (최대 16자)</label>
        <input type="text" id="sub-copy-input" maxlength="20" placeholder="서브 카피 입력">
        <div class="char-count" id="sub-count">0 / 16자</div>
      </div>

      <div style="margin-top:12px; padding-top:12px; border-top:1px solid #f0f0f0; display:none" id="copy-result-area">
        <label style="color:#18A0FB; font-weight:600;">AI 생성 결과</label>
        <div style="background:#f8f8f8; border-radius:4px; padding:8px; margin-top:4px; font-size:11px; line-height:1.8;" id="copy-result"></div>
        <button class="btn-primary" id="btn-use-copy" style="margin-top:6px; width:100%;">이 카피 사용</button>
      </div>
    </div>
  `;

  let generatedCopy: CopyContent | null = null;
  const mainInput = document.getElementById('main-copy-input') as HTMLInputElement;
  const subInput = document.getElementById('sub-copy-input') as HTMLInputElement;
  const mainCount = document.getElementById('main-count') as HTMLElement;
  const subCount = document.getElementById('sub-count') as HTMLElement;

  // 글자수 카운터
  mainInput.addEventListener('input', () => {
    const len = mainInput.value.length;
    mainCount.textContent = `${len} / 16자`;
    mainCount.className = `char-count${len > 16 ? ' over' : ''}`;
  });
  subInput.addEventListener('input', () => {
    const len = subInput.value.length;
    subCount.textContent = `${len} / 16자`;
    subCount.className = `char-count${len > 16 ? ' over' : ''}`;
  });

  function setLoading(spinnerId: string, btnId: string, loading: boolean) {
    const spinner = document.getElementById(spinnerId) as HTMLElement;
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    spinner.style.display = loading ? 'block' : 'none';
    btn.disabled = loading;
  }

  function showResult(copy: CopyContent) {
    generatedCopy = copy;
    const area = document.getElementById('copy-result-area') as HTMLElement;
    const result = document.getElementById('copy-result') as HTMLElement;
    area.style.display = 'block';
    result.innerHTML = `
      <div>메인: <strong>${copy.main_copy_03}</strong></div>
      <div style="color:#999; font-size:10px;">&nbsp;&nbsp;앞: ${copy.main_copy_01} / 뒤: ${copy.main_copy_02}</div>
      <div style="color:#999; font-size:10px;">&nbsp;&nbsp;밴드용(11자): ${copy.main_copy_04}</div>
      <div>서브: <strong>${copy.sub_copy}</strong></div>
    `;
  }

  // AI 생성 버튼
  document.getElementById('btn-generate')?.addEventListener('click', async () => {
    const keyword = (document.getElementById('copy-keyword') as HTMLInputElement).value.trim();
    if (!keyword) { alert('키워드를 입력해주세요.'); return; }
    const apiKey = getClaudeKey();
    if (!apiKey) { alert('Claude API Key를 먼저 입력해주세요.'); return; }
    setLoading('spinner-generate', 'btn-generate', true);
    try {
      const copy = await generateCopy(keyword, apiKey);
      showResult(copy);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading('spinner-generate', 'btn-generate', false);
    }
  });

  // AI 다듬기 버튼
  document.getElementById('btn-refine')?.addEventListener('click', async () => {
    const draft = mainInput.value.trim();
    if (!draft) { alert('카피 초안을 입력해주세요.'); return; }
    const apiKey = getClaudeKey();
    if (!apiKey) { alert('Claude API Key를 먼저 입력해주세요.'); return; }
    setLoading('spinner-refine', 'btn-refine', true);
    try {
      const refined = await refineCopy(draft, apiKey);
      showResult(refined);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading('spinner-refine', 'btn-refine', false);
    }
  });

  // "이 카피 사용" 버튼
  document.getElementById('btn-use-copy')?.addEventListener('click', () => {
    if (!generatedCopy) return;
    mainInput.value = generatedCopy.main_copy_03;
    subInput.value = generatedCopy.sub_copy;
    mainCount.textContent = `${generatedCopy.main_copy_03.length} / 16자`;
    subCount.textContent = `${generatedCopy.sub_copy.length} / 16자`;
    onChange(generatedCopy);
    (document.getElementById('copy-result-area') as HTMLElement).style.display = 'none';
  });

  return {
    getCopy(): CopyContent | null {
      if (!mainInput.value.trim()) return null;
      return generatedCopy ?? {
        main_copy_01: mainInput.value.slice(0, 8).trim(),
        main_copy_02: mainInput.value.slice(8).trim(),
        main_copy_03: mainInput.value.trim(),
        main_copy_04: mainInput.value.slice(0, 11).trim(),
        sub_copy: subInput.value.trim(),
      };
    },
  };
}
```

- [ ] **Step 2: main.ts에 카피 섹션 연결**

```typescript
// src/ui/main.ts — DOMContentLoaded 내부에 추가
import { initCopyWriter } from './copyWriter';

let currentCopy: CopyContent | null = null;

const copyWriter = initCopyWriter(
  document.getElementById('sec-copy')!,
  () => apiSettings.getClaudeKey(),
  (copy) => { currentCopy = copy; }
);
```

- [ ] **Step 3: 빌드 및 Figma 확인**

```bash
node build.js
```

Claude API Key 입력 후 키워드 입력 → AI 생성 버튼 → 카피 결과 확인.

- [ ] **Step 4: Commit**

```bash
git add src/ui/copyWriter.ts src/ui/main.ts
git commit -m "feat: copy writer section with Claude API generate and refine"
```

---

## Task 12: UI 스타일 섹션

**Files:**
- Create: `src/ui/styleSection.ts`
- Modify: `src/ui/main.ts`

- [ ] **Step 1: src/ui/styleSection.ts 작성**

```typescript
// src/ui/styleSection.ts
import { IDEAS_PALETTE } from '../palette';
import { extractKeyColors, computeComplementaryColors, rgbToHex, getImageDataFromBase64 } from '../colorExtractor';
import type { ImageData, RGBColor } from '../types';
import { sendToPlugin } from './main';

export function initStyleSection(
  container: HTMLElement,
  onColorChange: (hex: string) => void,
  onBadgeChange: (name: string | null) => void
) {
  container.innerHTML = `
    <div class="section-title" data-target="body-style">🎨 스타일 설정 <span class="toggle-icon">▼</span></div>
    <div class="section-body open" id="body-style">

      <!-- 뱃지 -->
      <label>뱃지</label>
      <div class="row">
        <select id="badge-select" style="flex:1"><option value="">뱃지 없음</option></select>
        <button class="btn-secondary" id="btn-load-badges" style="white-space:nowrap">목록 가져오기</button>
      </div>

      <!-- 배경 컬러 -->
      <label style="margin-top:12px;">배경 컬러</label>

      <!-- AI 추천 -->
      <div style="font-size:11px; color:#666; margin-bottom:4px;">키컬러 추천</div>
      <div id="key-swatches" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;"></div>
      <div style="font-size:11px; color:#666; margin-bottom:4px;">보색 추천</div>
      <div id="comp-swatches" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>

      <!-- 팔레트 -->
      <div style="font-size:11px; color:#666; margin-bottom:4px;">아이디어스 팔레트</div>
      ${(['deep', 'vivid', 'light', 'pastel'] as const).map((group) => `
        <div style="margin-bottom:6px;">
          <div style="font-size:10px; color:#999; margin-bottom:3px; text-transform:uppercase;">${group}</div>
          <div style="display:flex; gap:3px; flex-wrap:wrap;">
            ${IDEAS_PALETTE[group].map((swatch) => `
              <div class="palette-swatch" data-hex="${swatch.hex}" data-name="${swatch.name}"
                title="${swatch.name} ${swatch.hex}"
                style="width:20px; height:20px; background:${swatch.hex}; border-radius:3px; cursor:pointer; border:2px solid transparent; transition:border-color 0.1s;">
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <!-- 선택된 색 + 피커 -->
      <div style="margin-top:10px; padding-top:10px; border-top:1px solid #f0f0f0;">
        <label>선택된 배경색</label>
        <div class="row" style="gap:8px; align-items:center;">
          <div id="color-preview" style="width:28px; height:28px; border-radius:4px; border:1px solid #e0e0e0; background:#ffffff; cursor:pointer; flex-shrink:0;"></div>
          <input type="color" id="color-picker" value="#ffffff" style="width:36px; height:28px; padding:0; border:none; cursor:pointer;">
          <input type="text" id="color-hex" value="#FFFFFF" placeholder="#FFFFFF" style="flex:1; font-family:monospace;">
        </div>
      </div>
    </div>
  `;

  let selectedColor = '#FFFFFF';

  function setColor(hex: string, triggerPreview = true) {
    selectedColor = hex.toUpperCase().startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    (document.getElementById('color-preview') as HTMLElement).style.background = selectedColor;
    (document.getElementById('color-picker') as HTMLInputElement).value = selectedColor;
    (document.getElementById('color-hex') as HTMLInputElement).value = selectedColor;
    // 팔레트 선택 표시
    document.querySelectorAll('.palette-swatch').forEach((el) => {
      const el2 = el as HTMLElement;
      el2.style.borderColor = el2.dataset.hex?.toUpperCase() === selectedColor ? '#18A0FB' : 'transparent';
    });
    onColorChange(selectedColor);
    if (triggerPreview) sendToPlugin({ type: 'PREVIEW_COLOR', color: selectedColor });
  }

  // 팔레트 클릭
  document.querySelectorAll('.palette-swatch').forEach((el) => {
    el.addEventListener('click', () => setColor((el as HTMLElement).dataset.hex ?? '#FFF'));
  });

  // 컬러 피커
  (document.getElementById('color-picker') as HTMLInputElement).addEventListener('input', (e) => {
    setColor((e.target as HTMLInputElement).value);
  });

  // HEX 직접 입력
  (document.getElementById('color-hex') as HTMLInputElement).addEventListener('change', (e) => {
    const val = (e.target as HTMLInputElement).value.trim();
    if (/^#?[0-9A-Fa-f]{6}$/.test(val)) {
      setColor(val.startsWith('#') ? val : `#${val}`);
    }
  });

  // AI 추천 스와치 렌더링
  function renderSwatches(containerId: string, colors: RGBColor[]) {
    const container2 = document.getElementById(containerId)!;
    container2.innerHTML = colors.map((c) => {
      const hex = rgbToHex(c);
      return `<div class="palette-swatch" data-hex="${hex}" title="${hex}"
        style="width:24px; height:24px; background:${hex}; border-radius:4px; cursor:pointer; border:2px solid transparent;"></div>`;
    }).join('');
    container2.querySelectorAll('.palette-swatch').forEach((el) => {
      el.addEventListener('click', () => setColor((el as HTMLElement).dataset.hex ?? '#FFF'));
    });
  }

  // 뱃지 목록 로드
  document.getElementById('btn-load-badges')?.addEventListener('click', () => {
    sendToPlugin({ type: 'GET_BADGE_COMPONENTS' });
  });

  // 뱃지 선택
  (document.getElementById('badge-select') as HTMLSelectElement).addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    onBadgeChange(val || null);
  });

  return {
    getSelectedColor: () => selectedColor,
    setBadgeOptions(names: string[]) {
      const select = document.getElementById('badge-select') as HTMLSelectElement;
      select.innerHTML = '<option value="">뱃지 없음</option>' +
        names.map((n) => `<option value="${n}">${n}</option>`).join('');
    },
    async updateColorSuggestions(mainImage: ImageData | null) {
      if (!mainImage) return;
      const imgData = await getImageDataFromBase64(mainImage.base64, mainImage.mimeType);
      if (!imgData) return;
      const keyColors = extractKeyColors(imgData, 3);
      const compColors = computeComplementaryColors(keyColors, 3);
      renderSwatches('key-swatches', keyColors);
      renderSwatches('comp-swatches', compColors);
    },
  };
}
```

- [ ] **Step 2: main.ts에 스타일 섹션 연결 + BADGE_COMPONENTS 메시지 처리**

```typescript
// src/ui/main.ts — 추가/수정
import { initStyleSection } from './styleSection';

let currentColor: string | null = null;
let currentBadge: string | null = null;

const styleSection = initStyleSection(
  document.getElementById('sec-style')!,
  (hex) => { currentColor = hex; },
  (name) => { currentBadge = name; }
);

// handleMessage 내 switch에 추가:
case 'BADGE_COMPONENTS':
  styleSection.setBadgeOptions(msg.names);
  break;
```

- [ ] **Step 3: 이미지 변경 시 컬러 추천 업데이트 (imageInput 콜백 수정)**

```typescript
// main.ts — imageInput onChange 콜백 업데이트
const imageInput = initImageInput(
  document.getElementById('sec-image')!,
  (imgs) => {
    currentImages = imgs as any;
    styleSection.updateColorSuggestions(imgs.main);
  }
);
```

- [ ] **Step 4: 빌드 및 확인**

```bash
node build.js
```

이미지 업로드 후 컬러 추천이 표시되는지 확인. 팔레트 색상 클릭 시 피커·HEX 반영 확인.

- [ ] **Step 5: Commit**

```bash
git add src/ui/styleSection.ts src/ui/main.ts
git commit -m "feat: style section — badge, color palette, AI color suggestions"
```

---

## Task 13: UI 적용 섹션 + 최종 연결

**Files:**
- Create: `src/ui/applySection.ts`
- Modify: `src/ui/main.ts`

- [ ] **Step 1: src/ui/applySection.ts 작성**

```typescript
// src/ui/applySection.ts

export function initApplySection(
  container: HTMLElement,
  onApply: () => void
) {
  container.innerHTML = `
    <div class="selection-info" id="selection-label">선택된 노드: 없음</div>
    <div class="row" style="gap:8px;">
      <button class="btn-primary" id="btn-apply" style="flex:1; padding:8px;">전체 적용</button>
      <div class="spinner" id="spinner-apply"></div>
    </div>
    <div class="error-msg" id="apply-error" style="display:none;"></div>
    <div class="success-msg" id="apply-success" style="display:none;">적용 완료!</div>
  `;

  document.getElementById('btn-apply')?.addEventListener('click', onApply);

  return {
    setLoading(loading: boolean) {
      const spinner = document.getElementById('spinner-apply') as HTMLElement;
      const btn = document.getElementById('btn-apply') as HTMLButtonElement;
      spinner.style.display = loading ? 'block' : 'none';
      btn.disabled = loading;
    },
    setSelectionInfo(nodeType: 'section' | 'frame' | 'none', nodeName: string, frameCount: number) {
      const label = document.getElementById('selection-label') as HTMLElement;
      if (nodeType === 'none') {
        label.textContent = '선택된 노드: 없음 (섹션 또는 프레임을 선택하세요)';
        label.style.color = '#E53935';
      } else {
        const typeLabel = nodeType === 'section' ? `섹션 (${frameCount}개 프레임)` : '프레임';
        label.textContent = `선택된 노드: ${nodeName} [${typeLabel}]`;
        label.style.color = '#333';
      }
    },
    showError(msg: string) {
      const el = document.getElementById('apply-error') as HTMLElement;
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => (el.style.display = 'none'), 4000);
    },
    showSuccess() {
      const el = document.getElementById('apply-success') as HTMLElement;
      el.style.display = 'block';
      setTimeout(() => (el.style.display = 'none'), 3000);
    },
  };
}
```

- [ ] **Step 2: main.ts 최종 완성 — 모든 섹션 연결 + 적용 로직**

`src/ui/main.ts` 전체를 아래로 교체:

```typescript
// src/ui/main.ts — 최종 버전
import { initApiSettings } from './apiSettings';
import { initImageInput } from './imageInput';
import { initCopyWriter } from './copyWriter';
import { initStyleSection } from './styleSection';
import { initApplySection } from './applySection';
import type { MainMessage, UIMessage, CopyContent, ImageData, ApplyPayload } from '../types';

export function sendToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

let currentImages: { main: ImageData | null; sub01: ImageData | null; sub02: ImageData | null } = {
  main: null, sub01: null, sub02: null,
};
let currentCopy: CopyContent | null = null;
let currentColor: string | null = null;
let currentBadge: string | null = null;

let apiSettings: ReturnType<typeof initApiSettings>;
let styleSection: ReturnType<typeof initStyleSection>;
let applySection: ReturnType<typeof initApplySection>;
let copyWriter: ReturnType<typeof initCopyWriter>;

function handleMessage(msg: MainMessage) {
  switch (msg.type) {
    case 'API_KEYS':
      apiSettings?.setKeys(msg.claudeKey, msg.geminiKey);
      break;
    case 'SELECTION_INFO':
      applySection?.setSelectionInfo(msg.nodeType, msg.nodeName, msg.frameCount);
      break;
    case 'BADGE_COMPONENTS':
      styleSection?.setBadgeOptions(msg.names);
      break;
    case 'APPLY_DONE':
      applySection?.setLoading(false);
      applySection?.showSuccess();
      break;
    case 'ERROR':
      applySection?.setLoading(false);
      applySection?.showError(msg.message);
      break;
  }
}

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as MainMessage;
  if (msg) handleMessage(msg);
};

document.addEventListener('DOMContentLoaded', () => {
  apiSettings = initApiSettings((claudeKey, geminiKey) => {
    sendToPlugin({ type: 'SAVE_API_KEYS', claudeKey, geminiKey });
  });

  initImageInput(
    document.getElementById('sec-image')!,
    (imgs) => {
      currentImages = imgs as any;
      styleSection?.updateColorSuggestions(imgs.main);
    }
  );

  copyWriter = initCopyWriter(
    document.getElementById('sec-copy')!,
    () => apiSettings.getClaudeKey(),
    (copy) => { currentCopy = copy; }
  );

  styleSection = initStyleSection(
    document.getElementById('sec-style')!,
    (hex) => { currentColor = hex; },
    (name) => { currentBadge = name; }
  );

  applySection = initApplySection(
    document.getElementById('apply-section')!,
    () => {
      const copy = copyWriter.getCopy();
      if (!copy) {
        applySection.showError('카피를 먼저 작성해주세요.');
        return;
      }
      const payload: ApplyPayload = {
        copy,
        mainImage: currentImages.main,
        subImage01: currentImages.sub01,
        subImage02: currentImages.sub02,
        badgeComponentName: currentBadge,
        backgroundColor: currentColor,
      };
      applySection.setLoading(true);
      sendToPlugin({ type: 'APPLY_CONTENT', payload });
    }
  );

  sendToPlugin({ type: 'GET_API_KEYS' });
  sendToPlugin({ type: 'GET_SELECTION' });
});
```

- [ ] **Step 3: 최종 빌드**

```bash
node build.js
```

Expected: 에러 없이 `code.js`, `ui.js` 생성

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npx vitest run
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: Figma에서 E2E 확인**
  1. Figma에서 배너 섹션(또는 프레임) 선택
  2. 플러그인 실행
  3. API 키 입력·저장
  4. 이미지 업로드 (드래그앤드롭)
  5. 키워드 입력 → AI 카피 생성 → "이 카피 사용"
  6. 컬러 선택 (팔레트 또는 AI 추천)
  7. "전체 적용" 클릭 → 캔버스에 반영 확인

- [ ] **Step 6: 최종 Commit**

```bash
git add src/ui/applySection.ts src/ui/main.ts
git commit -m "feat: apply section + full UI wiring — banner plugin complete"
```

---

## 체크리스트: 스펙 커버리지

| 요구사항 | 구현 태스크 |
|---|---|
| 섹션 선택 → 하위 프레임 전체 적용 | Task 8 (code.ts), Task 3 (layerMapper) |
| 프레임 선택 → 해당 프레임만 적용 | Task 8 (code.ts) |
| 이미지 로컬 업로드 | Task 10 (imageInput) |
| 드래그앤드롭 | Task 10 |
| 클립보드 붙여넣기 | Task 10 |
| 피그마 레이어에서 가져오기 | Task 10 (버튼 스텁, 확장 가능) |
| Claude API 카피 생성 | Task 6, Task 11 |
| Claude API 카피 다듬기 | Task 6, Task 11 |
| Gemini API 이미지 생성 | Task 7 |
| 레이어 자동 매핑 | Task 3 |
| main_copy_01/02 어절 분리 | Task 3 (splitMainCopy) |
| 배경 컬러 키컬러 추천 3개 | Task 4, Task 12 |
| 배경 컬러 보색 추천 3개 | Task 4, Task 12 |
| 팔레트 전체 표시 + 선택 | Task 5, Task 12 |
| 컬러 직접 수정 (피커+HEX) | Task 12 |
| 실시간 컬러 프리뷰 | Task 8, Task 12 |
| 뱃지 자동 탐색 드롭다운 | Task 8, Task 12 |
| API 키 clientStorage 저장 | Task 8, Task 9 |
| 최초 실행 시 API 키 입력 | Task 9 |
