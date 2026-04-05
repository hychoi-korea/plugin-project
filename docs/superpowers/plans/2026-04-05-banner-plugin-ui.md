# Banner Plugin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Banner 생성기 Figma 플러그인의 UI 전체를 구현한다 — 이미지 입력(드래그앤드롭/붙여넣기/파일/피그마 레이어), 카피 작성(AI 생성/다듬기), 스타일 설정(뱃지/컬러 추천/팔레트/피커), 적용 섹션.

**Architecture:** 메인 스레드(`code.ts`)는 완성 상태. UI 스레드는 `src/ui/main.ts`가 오케스트레이터 역할을 하며 `imageSection.ts`, `copySection.ts`, `styleSection.ts`, `applySection.ts` 4개 모듈을 조립한다. `ui.html`은 빈 섹션 div들의 내부 HTML을 채우고, `src/ui/utils.ts`는 순수 함수(파일→base64, 글자수 검증)를 담아 테스트 가능하게 분리한다.

**Tech Stack:** TypeScript, esbuild, Figma Plugin API, Canvas API, Claude API (anthropic), Gemini API, Vitest, jsdom

---

## File Map

| 상태 | 파일 | 역할 |
|---|---|---|
| ✅ 완성 | `code.ts` | 메인 스레드 — Figma API, 레이어 적용, 메시지 핸들러 |
| ✅ 완성 | `src/types.ts` | 공유 타입 (CopyContent, ApplyPayload, UIMessage, MainMessage) |
| ✅ 완성 | `src/layerMapper.ts` | 레이어 탐색, splitMainCopy, getFramesFromSection |
| ✅ 완성 | `src/claude.ts` | Claude API generateCopy / refineCopy |
| ✅ 완성 | `src/gemini.ts` | Gemini API generateBannerImage |
| ✅ 완성 | `src/colorExtractor.ts` | 키컬러 추출, 보색 계산, hex 변환 |
| ✅ 완성 | `src/palette.ts` | IDEAS_PALETTE (deep/vivid/light/pastel) |
| ✅ 완성 | `src/ui/apiSettings.ts` | API 키 입력/저장 섹션 초기화 |
| ✅ 완성 | `ui.html` | 뼈대 HTML — 섹션 div들 존재, 내부는 빈 상태 |
| 🔨 **생성** | `src/ui/utils.ts` | 순수 유틸리티: fileToBase64, validateCharCount, detectMimeType |
| 🔨 **생성** | `src/ui/imageSection.ts` | 이미지 입력 UI (drag&drop, paste, file input, 피그마 레이어 버튼) |
| 🔨 **생성** | `src/ui/copySection.ts` | 카피 작성 UI (글자수 카운터, AI 생성/다듬기 버튼) |
| 🔨 **생성** | `src/ui/styleSection.ts` | 스타일 UI (뱃지 드롭다운, 컬러 추천, 팔레트, 피커/HEX) |
| 🔨 **생성** | `src/ui/applySection.ts` | 적용 UI (선택 노드 정보, 전체 적용 버튼) |
| 🔨 **수정** | `src/ui/main.ts` | 오케스트레이터 — 모든 섹션 조립, postMessage 라우팅 |
| 🔨 **수정** | `ui.html` | 각 섹션 div 내부 HTML 채우기 |
| 🔨 **생성** | `tests/utils.test.ts` | validateCharCount, detectMimeType 단위 테스트 |

---

## Task 1: utils.ts 테스트 작성 및 구현

**Files:**
- Create: `tests/utils.test.ts`
- Create: `src/ui/utils.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/utils.test.ts
import { describe, it, expect } from 'vitest';
import { validateCharCount, detectMimeType, fileToBase64 } from '../src/ui/utils';

describe('validateCharCount', () => {
  it('returns valid when under limit', () => {
    expect(validateCharCount('안녕하세요', 16)).toEqual({ valid: true, count: 5 });
  });

  it('returns valid when exactly at limit', () => {
    expect(validateCharCount('1234567890123456', 16)).toEqual({ valid: true, count: 16 });
  });

  it('returns invalid when over limit', () => {
    expect(validateCharCount('12345678901234567', 16)).toEqual({ valid: false, count: 17 });
  });

  it('counts empty string as 0', () => {
    expect(validateCharCount('', 16)).toEqual({ valid: true, count: 0 });
  });
});

describe('detectMimeType', () => {
  it('detects image/jpeg from filename', () => {
    expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
    expect(detectMimeType('photo.jpeg')).toBe('image/jpeg');
  });

  it('detects image/png from filename', () => {
    expect(detectMimeType('icon.png')).toBe('image/png');
  });

  it('detects image/webp from filename', () => {
    expect(detectMimeType('image.webp')).toBe('image/webp');
  });

  it('returns image/png for unknown extension', () => {
    expect(detectMimeType('file.bmp')).toBe('image/png');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm test -- tests/utils.test.ts 2>&1
```
Expected: FAIL with "Cannot find module '../src/ui/utils'"

- [ ] **Step 3: utils.ts 구현**

```typescript
// src/ui/utils.ts

import type { ImageData } from '../types';

/** 글자수 검증 결과 */
export interface CharValidation {
  valid: boolean;
  count: number;
}

/** 문자열이 maxLen 이하인지 검증 */
export function validateCharCount(text: string, maxLen: number): CharValidation {
  const count = text.length;
  return { valid: count <= maxLen, count };
}

/** 파일명에서 MIME 타입 추출 */
export function detectMimeType(filename: string): ImageData['mimeType'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

/** File 또는 Blob을 base64 문자열로 변환 */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/png;base64,XXXX" → "XXXX"
      const base64 = result.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

/** ClipboardItem에서 이미지 File 추출 (paste 이벤트용) */
export async function getImageFromClipboard(
  items: DataTransferItemList
): Promise<File | null> {
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm test -- tests/utils.test.ts 2>&1
```
Expected: 4 tests PASS

- [ ] **Step 5: 전체 테스트 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm test 2>&1
```
Expected: 25 tests PASS (기존 21 + 신규 4)

- [ ] **Step 6: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/utils.ts tests/utils.test.ts && git commit -m "feat: add ui utils (validateCharCount, detectMimeType, fileToBase64)"
```

---

## Task 2: ui.html 섹션 HTML 채우기

**Files:**
- Modify: `ui.html`

- [ ] **Step 1: ui.html 이미지 섹션 추가**

`ui.html`의 `<div class="section" id="sec-image"></div>` 를 아래로 교체:

```html
<!-- 이미지 입력 -->
<div class="section" id="sec-image">
  <div class="section-title" data-target="body-image">🖼️ 이미지 입력 <span class="toggle-icon">▼</span></div>
  <div class="section-body open" id="body-image">
    <!-- 메인 이미지 -->
    <label>메인 이미지 (필수)</label>
    <div class="drop-zone" id="drop-main" tabindex="0" role="button" aria-label="메인 이미지 업로드">
      <span class="drop-hint">클릭, 드래그 또는 붙여넣기(Ctrl+V)</span>
      <img class="drop-preview" id="prev-main" style="display:none" alt="메인 이미지 미리보기">
      <button class="drop-clear" id="clear-main" style="display:none" aria-label="이미지 삭제">✕</button>
    </div>
    <input type="file" id="file-main" accept="image/png,image/jpeg,image/webp" style="display:none">
    <button class="btn-secondary" id="btn-figma-main" style="margin-top:4px;width:100%">피그마 레이어에서 가져오기</button>

    <!-- 서브 이미지 -->
    <label style="margin-top:10px">서브 이미지 (선택, 최대 2장)</label>
    <div class="sub-image-row">
      <div class="drop-zone drop-zone-sm" id="drop-sub1" tabindex="0" role="button" aria-label="서브 이미지 1 업로드">
        <span class="drop-hint-sm">서브 1</span>
        <img class="drop-preview" id="prev-sub1" style="display:none" alt="서브 이미지 1 미리보기">
        <button class="drop-clear" id="clear-sub1" style="display:none" aria-label="이미지 1 삭제">✕</button>
      </div>
      <input type="file" id="file-sub1" accept="image/png,image/jpeg,image/webp" style="display:none">
      <div class="drop-zone drop-zone-sm" id="drop-sub2" tabindex="0" role="button" aria-label="서브 이미지 2 업로드">
        <span class="drop-hint-sm">서브 2</span>
        <img class="drop-preview" id="prev-sub2" style="display:none" alt="서브 이미지 2 미리보기">
        <button class="drop-clear" id="clear-sub2" style="display:none" aria-label="이미지 2 삭제">✕</button>
      </div>
      <input type="file" id="file-sub2" accept="image/png,image/jpeg,image/webp" style="display:none">
    </div>

    <!-- AI 이미지 생성 -->
    <div class="row" style="margin-top:8px">
      <button class="btn-primary" id="btn-gen-image" style="flex:1" disabled>✨ AI 이미지 생성</button>
      <div class="spinner" id="spin-image"></div>
    </div>
    <div class="error-msg" id="err-image" style="display:none"></div>
  </div>
</div>
```

- [ ] **Step 2: 카피 섹션 추가**

`<div class="section" id="sec-copy"></div>` 를 아래로 교체:

```html
<!-- 카피 작성 -->
<div class="section" id="sec-copy">
  <div class="section-title" data-target="body-copy">✍️ 카피 작성 <span class="toggle-icon">▼</span></div>
  <div class="section-body open" id="body-copy">
    <!-- 키워드/초안 입력 -->
    <label>키워드 또는 초안</label>
    <textarea id="copy-input" rows="2" placeholder="예) 여름 특가, 핸드메이드 가방, 최대 50% 할인" style="resize:none"></textarea>

    <div class="row" style="margin-top:6px">
      <button class="btn-primary" id="btn-gen-copy" style="flex:1">✨ AI 생성</button>
      <button class="btn-secondary" id="btn-refine-copy" style="flex:1">✏️ 다듬기</button>
      <div class="spinner" id="spin-copy"></div>
    </div>
    <div class="error-msg" id="err-copy" style="display:none"></div>

    <!-- 메인 카피 -->
    <label style="margin-top:10px">메인 카피 (전체, 최대 16자)</label>
    <div class="input-with-count">
      <input type="text" id="main-copy-03" placeholder="최대 16자" maxlength="20">
      <span class="char-count" id="cnt-main-03">0/16</span>
    </div>

    <label>메인 카피 앞줄 (최대 8자)</label>
    <div class="input-with-count">
      <input type="text" id="main-copy-01" placeholder="최대 8자" maxlength="10">
      <span class="char-count" id="cnt-main-01">0/8</span>
    </div>

    <label>메인 카피 뒷줄 (최대 8자)</label>
    <div class="input-with-count">
      <input type="text" id="main-copy-02" placeholder="최대 8자" maxlength="10">
      <span class="char-count" id="cnt-main-02">0/8</span>
    </div>

    <label>m_band 요약 (최대 11자)</label>
    <div class="input-with-count">
      <input type="text" id="main-copy-04" placeholder="최대 11자" maxlength="13">
      <span class="char-count" id="cnt-main-04">0/11</span>
    </div>

    <label>서브 카피 (최대 16자)</label>
    <div class="input-with-count">
      <input type="text" id="sub-copy" placeholder="최대 16자" maxlength="20">
      <span class="char-count" id="cnt-sub">0/16</span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 스타일 섹션 추가**

`<div class="section" id="sec-style"></div>` 를 아래로 교체:

```html
<!-- 스타일 설정 -->
<div class="section" id="sec-style">
  <div class="section-title" data-target="body-style">🎨 스타일 설정 <span class="toggle-icon">▼</span></div>
  <div class="section-body open" id="body-style">
    <!-- 뱃지 -->
    <label>뱃지</label>
    <select id="badge-select">
      <option value="">뱃지 없음</option>
    </select>

    <!-- 배경 컬러 -->
    <label style="margin-top:10px">배경 컬러</label>

    <!-- AI 추천 -->
    <div class="color-row-label">키컬러 추천</div>
    <div class="color-swatch-row" id="key-colors"></div>
    <div class="color-row-label" style="margin-top:6px">보색 추천 (이미지 돋보임)</div>
    <div class="color-swatch-row" id="comp-colors"></div>

    <!-- 팔레트 -->
    <div class="color-row-label" style="margin-top:8px">아이디어스 팔레트</div>
    <div class="palette-group" id="palette-deep">
      <span class="palette-label">deep</span>
      <div class="palette-swatches" id="swatches-deep"></div>
    </div>
    <div class="palette-group" id="palette-vivid">
      <span class="palette-label">vivid</span>
      <div class="palette-swatches" id="swatches-vivid"></div>
    </div>
    <div class="palette-group" id="palette-light">
      <span class="palette-label">light</span>
      <div class="palette-swatches" id="swatches-light"></div>
    </div>
    <div class="palette-group" id="palette-pastel">
      <span class="palette-label">pastel</span>
      <div class="palette-swatches" id="swatches-pastel"></div>
    </div>

    <!-- 선택된 색 + 직접 수정 -->
    <label style="margin-top:10px">선택된 색</label>
    <div class="row" style="gap:8px;align-items:center">
      <div class="color-preview-box" id="color-preview-box"></div>
      <input type="color" id="color-picker" style="width:36px;height:28px;padding:0;border:none;cursor:pointer">
      <input type="text" id="color-hex" placeholder="#FFFFFF" maxlength="7" style="width:90px">
    </div>
  </div>
</div>
```

- [ ] **Step 4: 적용 섹션 추가**

`<div id="apply-section"></div>` 를 아래로 교체:

```html
<!-- 적용 -->
<div id="apply-section">
  <div class="selection-info" id="selection-info">선택된 노드 없음</div>
  <button class="btn-primary" id="btn-apply" style="width:100%" disabled>▶ 전체 적용</button>
  <div class="error-msg" id="err-apply" style="display:none"></div>
  <div class="success-msg" id="msg-apply" style="display:none"></div>
</div>
```

- [ ] **Step 5: `<style>` 블록에 새 CSS 추가**

`ui.html`의 `</style>` 직전에 추가:

```css
    .input-with-count { position: relative; }
    .input-with-count input { padding-right: 42px; }
    .input-with-count .char-count { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; }
    .drop-zone { border: 1.5px dashed #ccc; border-radius: 6px; padding: 12px; text-align: center; cursor: pointer; position: relative; min-height: 60px; display: flex; align-items: center; justify-content: center; transition: border-color 0.15s, background 0.15s; }
    .drop-zone.dragover { border-color: #18A0FB; background: #EEF7FF; }
    .drop-hint { font-size: 11px; color: #999; }
    .drop-preview { max-width: 100%; max-height: 80px; border-radius: 4px; }
    .drop-clear { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.4); color: #fff; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
    .sub-image-row { display: flex; gap: 6px; }
    .drop-zone-sm { flex: 1; min-height: 50px; }
    .drop-hint-sm { font-size: 10px; color: #bbb; }
    .color-row-label { font-size: 10px; color: #888; margin: 4px 0 3px; }
    .color-swatch-row { display: flex; gap: 6px; flex-wrap: wrap; }
    .color-swatch { width: 28px; height: 28px; border-radius: 4px; cursor: pointer; border: 2px solid transparent; transition: border-color 0.1s, transform 0.1s; flex-shrink: 0; }
    .color-swatch:hover { transform: scale(1.15); }
    .color-swatch.selected { border-color: #333; }
    .palette-group { margin-bottom: 4px; }
    .palette-label { font-size: 10px; color: #aaa; display: block; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px; }
    .palette-swatches { display: flex; gap: 3px; flex-wrap: wrap; }
    .color-preview-box { width: 36px; height: 28px; border-radius: 4px; border: 1px solid #e0e0e0; flex-shrink: 0; }
```

- [ ] **Step 6: 빌드 확인 (HTML 파싱 오류 없는지)**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공 (ui.js, code.js 생성)

- [ ] **Step 7: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add ui.html && git commit -m "feat: expand ui.html with image/copy/style/apply section HTML"
```

---

## Task 3: imageSection.ts 구현

**Files:**
- Create: `src/ui/imageSection.ts`

이미지 입력 섹션 초기화 — 드래그앤드롭, 클립보드 붙여넣기, 파일 선택, 피그마 레이어 가져오기를 처리한다.

- [ ] **Step 1: imageSection.ts 작성**

```typescript
// src/ui/imageSection.ts
import type { ImageData } from '../types';
import { fileToBase64, detectMimeType, getImageFromClipboard } from './utils';

export interface ImageSlot {
  id: 'main' | 'sub1' | 'sub2';
  data: ImageData | null;
}

export interface ImageSectionController {
  getMainImage(): ImageData | null;
  getSub1Image(): ImageData | null;
  getSub2Image(): ImageData | null;
  setMainImage(data: ImageData): void;
  onGenerateImage(handler: () => void): void;
  showError(msg: string): void;
  showSpinner(show: boolean): void;
}

interface SlotConfig {
  dropId: string;
  prevId: string;
  clearId: string;
  fileId: string;
}

const SLOT_CONFIGS: Record<string, SlotConfig> = {
  main:  { dropId: 'drop-main',  prevId: 'prev-main',  clearId: 'clear-main',  fileId: 'file-main'  },
  sub1:  { dropId: 'drop-sub1',  prevId: 'prev-sub1',  clearId: 'clear-sub1',  fileId: 'file-sub1'  },
  sub2:  { dropId: 'drop-sub2',  prevId: 'prev-sub2',  clearId: 'clear-sub2',  fileId: 'file-sub2'  },
};

export function initImageSection(
  onFigmaLayerRequest: (slot: 'main') => void
): ImageSectionController {
  const images: Record<string, ImageData | null> = { main: null, sub1: null, sub2: null };

  function setSlotImage(slotKey: string, data: ImageData) {
    images[slotKey] = data;
    const cfg = SLOT_CONFIGS[slotKey];
    const prev = document.getElementById(cfg.prevId) as HTMLImageElement;
    const clearBtn = document.getElementById(cfg.clearId) as HTMLButtonElement;
    const dropZone = document.getElementById(cfg.dropId) as HTMLElement;
    prev.src = `data:${data.mimeType};base64,${data.base64}`;
    prev.style.display = 'block';
    clearBtn.style.display = 'flex';
    dropZone.querySelector('.drop-hint, .drop-hint-sm')?.setAttribute('style', 'display:none');
    // AI 생성 버튼 활성화 (main 이미지 있을 때)
    if (slotKey === 'main') {
      (document.getElementById('btn-gen-image') as HTMLButtonElement).disabled = false;
    }
  }

  function clearSlot(slotKey: string) {
    images[slotKey] = null;
    const cfg = SLOT_CONFIGS[slotKey];
    const prev = document.getElementById(cfg.prevId) as HTMLImageElement;
    const clearBtn = document.getElementById(cfg.clearId) as HTMLButtonElement;
    const dropZone = document.getElementById(cfg.dropId) as HTMLElement;
    prev.src = '';
    prev.style.display = 'none';
    clearBtn.style.display = 'none';
    const hint = dropZone.querySelector('.drop-hint, .drop-hint-sm') as HTMLElement | null;
    if (hint) hint.style.display = '';
    if (slotKey === 'main') {
      (document.getElementById('btn-gen-image') as HTMLButtonElement).disabled = true;
    }
  }

  async function handleFile(file: File, slotKey: string) {
    const base64 = await fileToBase64(file);
    const mimeType = detectMimeType(file.name) as ImageData['mimeType'];
    setSlotImage(slotKey, { base64, mimeType });
  }

  // 각 슬롯 초기화
  Object.entries(SLOT_CONFIGS).forEach(([slotKey, cfg]) => {
    const dropZone = document.getElementById(cfg.dropId) as HTMLElement;
    const fileInput = document.getElementById(cfg.fileId) as HTMLInputElement;
    const clearBtn = document.getElementById(cfg.clearId) as HTMLButtonElement;

    // 클릭 → 파일 선택
    dropZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('drop-clear')) return;
      fileInput.click();
    });

    // 드래그앤드롭
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) await handleFile(file, slotKey);
    });

    // 파일 선택
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) await handleFile(file, slotKey);
      fileInput.value = '';
    });

    // 삭제
    clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearSlot(slotKey); });
  });

  // 클립보드 붙여넣기 (전역, 메인 슬롯에 적용)
  document.addEventListener('paste', async (e) => {
    const file = await getImageFromClipboard(e.clipboardData!.items);
    if (file) await handleFile(file, 'main');
  });

  // 피그마 레이어 가져오기
  const figmaBtn = document.getElementById('btn-figma-main') as HTMLButtonElement;
  figmaBtn.addEventListener('click', () => onFigmaLayerRequest('main'));

  // AI 생성 버튼 (외부에서 핸들러 등록)
  let genHandler: (() => void) | null = null;
  const genBtn = document.getElementById('btn-gen-image') as HTMLButtonElement;
  genBtn.addEventListener('click', () => genHandler?.());

  return {
    getMainImage: () => images['main'],
    getSub1Image: () => images['sub1'],
    getSub2Image: () => images['sub2'],
    setMainImage: (data) => setSlotImage('main', data),
    onGenerateImage: (handler) => { genHandler = handler; },
    showError: (msg) => {
      const el = document.getElementById('err-image') as HTMLElement;
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    },
    showSpinner: (show) => {
      (document.getElementById('spin-image') as HTMLElement).style.display = show ? 'inline-block' : 'none';
      (document.getElementById('btn-gen-image') as HTMLButtonElement).disabled = show;
    },
  };
}
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/imageSection.ts && git commit -m "feat: add imageSection (drag&drop, paste, file, figma layer)"
```

---

## Task 4: copySection.ts 구현

**Files:**
- Create: `src/ui/copySection.ts`

카피 작성 섹션 — 글자수 실시간 카운터, AI 생성/다듬기 버튼, 필드값 set/get.

- [ ] **Step 1: copySection.ts 작성**

```typescript
// src/ui/copySection.ts
import type { CopyContent } from '../types';
import { validateCharCount } from './utils';

const LIMITS: Record<string, number> = {
  'main-copy-01': 8,
  'main-copy-02': 8,
  'main-copy-03': 16,
  'main-copy-04': 11,
  'sub-copy': 16,
};

const COUNT_IDS: Record<string, string> = {
  'main-copy-01': 'cnt-main-01',
  'main-copy-02': 'cnt-main-02',
  'main-copy-03': 'cnt-main-03',
  'main-copy-04': 'cnt-main-04',
  'sub-copy':     'cnt-sub',
};

export interface CopySectionController {
  getCopyContent(): CopyContent;
  setCopyContent(copy: CopyContent): void;
  getInputText(): string;
  onGenerate(handler: () => void): void;
  onRefine(handler: () => void): void;
  showError(msg: string): void;
  showSpinner(show: boolean): void;
}

export function initCopySection(): CopySectionController {
  // 글자수 카운터 초기화
  Object.entries(LIMITS).forEach(([fieldId, limit]) => {
    const input = document.getElementById(fieldId) as HTMLInputElement;
    const counter = document.getElementById(COUNT_IDS[fieldId]) as HTMLElement;

    const update = () => {
      const { valid, count } = validateCharCount(input.value, limit);
      counter.textContent = `${count}/${limit}`;
      counter.className = `char-count${valid ? '' : ' over'}`;
    };

    input.addEventListener('input', update);
    update();
  });

  // 메인 카피 03 변경 시 01/02 자동 분리 (splitMainCopy는 main thread에만 있으므로 간단 구현)
  const main03 = document.getElementById('main-copy-03') as HTMLInputElement;
  const main01 = document.getElementById('main-copy-01') as HTMLInputElement;
  const main02 = document.getElementById('main-copy-02') as HTMLInputElement;

  main03.addEventListener('input', () => {
    const text = main03.value;
    // 어절 경계 기준으로 8자 이내 분리
    let splitIdx = -1;
    for (let i = Math.min(8, text.length - 1); i >= 1; i--) {
      if (text[i] === ' ') { splitIdx = i; break; }
    }
    if (splitIdx !== -1) {
      main01.value = text.slice(0, splitIdx).trim();
      main02.value = text.slice(splitIdx).trim();
    } else if (text.length <= 8) {
      main01.value = text;
      main02.value = '';
    } else {
      main01.value = text.slice(0, 8);
      main02.value = text.slice(8);
    }
    // 카운터 갱신
    ['main-copy-01', 'main-copy-02'].forEach((id) => {
      const el = document.getElementById(id) as HTMLInputElement;
      const cnt = document.getElementById(COUNT_IDS[id]) as HTMLElement;
      const { valid, count } = validateCharCount(el.value, LIMITS[id]);
      cnt.textContent = `${count}/${LIMITS[id]}`;
      cnt.className = `char-count${valid ? '' : ' over'}`;
    });
  });

  let genHandler: (() => void) | null = null;
  let refineHandler: (() => void) | null = null;

  (document.getElementById('btn-gen-copy') as HTMLButtonElement)
    .addEventListener('click', () => genHandler?.());
  (document.getElementById('btn-refine-copy') as HTMLButtonElement)
    .addEventListener('click', () => refineHandler?.());

  return {
    getCopyContent(): CopyContent {
      return {
        main_copy_01: (document.getElementById('main-copy-01') as HTMLInputElement).value,
        main_copy_02: (document.getElementById('main-copy-02') as HTMLInputElement).value,
        main_copy_03: (document.getElementById('main-copy-03') as HTMLInputElement).value,
        main_copy_04: (document.getElementById('main-copy-04') as HTMLInputElement).value,
        sub_copy:     (document.getElementById('sub-copy') as HTMLInputElement).value,
      };
    },
    setCopyContent(copy: CopyContent) {
      const fields: Record<string, string> = {
        'main-copy-01': copy.main_copy_01,
        'main-copy-02': copy.main_copy_02,
        'main-copy-03': copy.main_copy_03,
        'main-copy-04': copy.main_copy_04,
        'sub-copy':     copy.sub_copy,
      };
      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id) as HTMLInputElement;
        el.value = val;
        const cnt = document.getElementById(COUNT_IDS[id]) as HTMLElement;
        const { valid, count } = validateCharCount(val, LIMITS[id]);
        cnt.textContent = `${count}/${LIMITS[id]}`;
        cnt.className = `char-count${valid ? '' : ' over'}`;
      });
    },
    getInputText: () => (document.getElementById('copy-input') as HTMLTextAreaElement).value.trim(),
    onGenerate:  (h) => { genHandler = h; },
    onRefine:    (h) => { refineHandler = h; },
    showError: (msg) => {
      const el = document.getElementById('err-copy') as HTMLElement;
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    },
    showSpinner: (show) => {
      (document.getElementById('spin-copy') as HTMLElement).style.display = show ? 'inline-block' : 'none';
      (document.getElementById('btn-gen-copy') as HTMLButtonElement).disabled = show;
      (document.getElementById('btn-refine-copy') as HTMLButtonElement).disabled = show;
    },
  };
}
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/copySection.ts && git commit -m "feat: add copySection (char count, AI generate/refine buttons)"
```

---

## Task 5: styleSection.ts 구현

**Files:**
- Create: `src/ui/styleSection.ts`

스타일 섹션 — 뱃지 드롭다운 동적 채우기, 키컬러/보색 추천 스와치 렌더링, 팔레트 전체 펼침, 컬러 피커 + HEX 입력 연동, 프리뷰 박스.

- [ ] **Step 1: styleSection.ts 작성**

```typescript
// src/ui/styleSection.ts
import { IDEAS_PALETTE } from '../palette';
import type { RGBColor } from '../types';
import { rgbToHex, hexToRgb } from '../colorExtractor';

export interface StyleSectionController {
  populateBadges(names: string[]): void;
  getSelectedBadge(): string | null;
  getSelectedColor(): string | null;
  setColorSuggestions(keyColors: RGBColor[], compColors: RGBColor[]): void;
  onColorChange(handler: (hex: string) => void): void;
}

export function initStyleSection(): StyleSectionController {
  let selectedColor: string | null = null;
  let colorChangeHandler: ((hex: string) => void) | null = null;

  // --- 팔레트 렌더링 ---
  function renderPaletteGroup(containerId: string, swatches: { name: string; hex: string }[]) {
    const container = document.getElementById(containerId) as HTMLElement;
    swatches.forEach(({ name, hex }) => {
      const el = document.createElement('div');
      el.className = 'color-swatch';
      el.style.background = hex;
      el.title = `${name} ${hex}`;
      el.addEventListener('click', () => applyColor(hex));
      container.appendChild(el);
    });
  }

  renderPaletteGroup('swatches-deep',   IDEAS_PALETTE.deep);
  renderPaletteGroup('swatches-vivid',  IDEAS_PALETTE.vivid);
  renderPaletteGroup('swatches-light',  IDEAS_PALETTE.light);
  renderPaletteGroup('swatches-pastel', IDEAS_PALETTE.pastel);

  // --- 컬러 적용 공통 함수 ---
  function applyColor(hex: string) {
    selectedColor = hex.toUpperCase().startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    // 프리뷰 박스
    (document.getElementById('color-preview-box') as HTMLElement).style.background = selectedColor;
    // HEX 입력
    (document.getElementById('color-hex') as HTMLInputElement).value = selectedColor;
    // 피커
    (document.getElementById('color-picker') as HTMLInputElement).value = selectedColor;
    // 스와치 selected 표시
    document.querySelectorAll('.color-swatch').forEach((s) => {
      (s as HTMLElement).classList.toggle('selected',
        (s as HTMLElement).style.background === hex ||
        (s as HTMLElement).style.background === selectedColor
      );
    });
    colorChangeHandler?.(selectedColor);
  }

  // --- 컬러 피커 ---
  const picker = document.getElementById('color-picker') as HTMLInputElement;
  picker.addEventListener('input', () => applyColor(picker.value));

  // --- HEX 입력 ---
  const hexInput = document.getElementById('color-hex') as HTMLInputElement;
  hexInput.addEventListener('input', () => {
    const val = hexInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) applyColor(val);
  });

  // --- 뱃지 ---
  const badgeSelect = document.getElementById('badge-select') as HTMLSelectElement;

  return {
    populateBadges(names: string[]) {
      // 기존 옵션 유지 (첫 번째 "뱃지 없음" 제외하고 제거)
      while (badgeSelect.options.length > 1) badgeSelect.remove(1);
      names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        badgeSelect.appendChild(opt);
      });
    },
    getSelectedBadge() {
      return badgeSelect.value || null;
    },
    getSelectedColor() {
      return selectedColor;
    },
    setColorSuggestions(keyColors: RGBColor[], compColors: RGBColor[]) {
      function renderSwatches(containerId: string, colors: RGBColor[]) {
        const container = document.getElementById(containerId) as HTMLElement;
        container.innerHTML = '';
        colors.forEach((c) => {
          const hex = rgbToHex(c);
          const el = document.createElement('div');
          el.className = 'color-swatch';
          el.style.background = hex;
          el.title = hex;
          el.addEventListener('click', () => applyColor(hex));
          container.appendChild(el);
        });
      }
      renderSwatches('key-colors', keyColors);
      renderSwatches('comp-colors', compColors);
    },
    onColorChange(handler) {
      colorChangeHandler = handler;
    },
  };
}
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/styleSection.ts && git commit -m "feat: add styleSection (badge, color suggestions, palette, picker)"
```

---

## Task 6: applySection.ts 구현

**Files:**
- Create: `src/ui/applySection.ts`

적용 섹션 — 선택 노드 정보 표시, 적용 버튼 활성화/비활성화, 성공/에러 메시지.

- [ ] **Step 1: applySection.ts 작성**

```typescript
// src/ui/applySection.ts

export interface SelectionInfo {
  nodeType: 'section' | 'frame' | 'none';
  nodeName: string;
  frameCount: number;
}

export interface ApplySectionController {
  updateSelection(info: SelectionInfo): void;
  onApply(handler: () => void): void;
  showError(msg: string): void;
  showSuccess(msg: string): void;
  setLoading(loading: boolean): void;
}

export function initApplySection(): ApplySectionController {
  const infoEl    = document.getElementById('selection-info') as HTMLElement;
  const applyBtn  = document.getElementById('btn-apply')      as HTMLButtonElement;
  const errEl     = document.getElementById('err-apply')      as HTMLElement;
  const msgEl     = document.getElementById('msg-apply')      as HTMLElement;

  let applyHandler: (() => void) | null = null;
  applyBtn.addEventListener('click', () => applyHandler?.());

  return {
    updateSelection(info: SelectionInfo) {
      errEl.style.display = 'none';
      msgEl.style.display = 'none';

      if (info.nodeType === 'section') {
        infoEl.textContent = `섹션 "${info.nodeName}" (프레임 ${info.frameCount}개)`;
        applyBtn.disabled = false;
      } else if (info.nodeType === 'frame') {
        infoEl.textContent = `프레임 "${info.nodeName}"`;
        applyBtn.disabled = false;
      } else {
        infoEl.textContent = '섹션 또는 프레임을 선택해주세요.';
        applyBtn.disabled = true;
      }
    },
    onApply(handler) {
      applyHandler = handler;
    },
    showError(msg) {
      errEl.textContent = msg;
      errEl.style.display = msg ? 'block' : 'none';
      msgEl.style.display = 'none';
    },
    showSuccess(msg) {
      msgEl.textContent = msg;
      msgEl.style.display = msg ? 'block' : 'none';
      errEl.style.display = 'none';
    },
    setLoading(loading) {
      applyBtn.disabled = loading;
      applyBtn.textContent = loading ? '적용 중...' : '▶ 전체 적용';
    },
  };
}
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/applySection.ts && git commit -m "feat: add applySection (selection info, apply button)"
```

---

## Task 7: main.ts 오케스트레이터 구현

**Files:**
- Modify: `src/ui/main.ts`

모든 섹션 모듈을 조립하고, 메인 스레드와의 postMessage 라우팅을 담당한다.

- [ ] **Step 1: main.ts 전체 구현**

```typescript
// src/ui/main.ts
import { initApiSettings } from './apiSettings';
import { initImageSection } from './imageSection';
import { initCopySection } from './copySection';
import { initStyleSection } from './styleSection';
import { initApplySection } from './applySection';
import { generateCopy, refineCopy } from '../claude';
import { generateBannerImage } from '../gemini';
import { getImageDataFromBase64, extractKeyColors, computeComplementaryColors } from '../colorExtractor';
import type { UIMessage, MainMessage, ApplyPayload } from '../types';

// ── postMessage 헬퍼 ──────────────────────────────────────
function sendToMain(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ── 섹션 초기화 ───────────────────────────────────────────
const api = initApiSettings((claudeKey, geminiKey) => {
  sendToMain({ type: 'SAVE_API_KEYS', claudeKey, geminiKey });
});

const imageSection = initImageSection((_slot) => {
  // 피그마 레이어에서 가져오기 → 현재 선택 레이어 이미지 요청
  // (현재 Figma Plugin API에서 이미지 바이너리 읽기는 향후 확장)
  alert('피그마에서 이미지 레이어를 선택한 뒤 이 버튼을 누르세요. (현재 버전: 수동 내보내기 후 업로드)');
});

const copySection = initCopySection();
const styleSection = initStyleSection();
const applySection = initApplySection();

// ── 이미지 생성 (Gemini) ───────────────────────────────────
imageSection.onGenerateImage(async () => {
  const mainImg = imageSection.getMainImage();
  if (!mainImg) { imageSection.showError('메인 이미지를 먼저 업로드해주세요.'); return; }

  const geminiKey = api.getGeminiKey();
  if (!geminiKey) { imageSection.showError('Gemini API Key를 입력해주세요.'); return; }

  imageSection.showSpinner(true);
  imageSection.showError('');
  try {
    const productImages = [mainImg, imageSection.getSub1Image(), imageSection.getSub2Image()]
      .filter(Boolean) as NonNullable<ReturnType<typeof imageSection.getMainImage>>[];
    const result = await generateBannerImage(productImages, '780x390', geminiKey);
    imageSection.setMainImage(result);

    // 생성된 이미지에서 컬러 추출
    const imgData = await getImageDataFromBase64(result.base64, result.mimeType);
    if (imgData) {
      const keyColors = extractKeyColors(imgData, 3);
      const compColors = computeComplementaryColors(keyColors, 3);
      styleSection.setColorSuggestions(keyColors, compColors);
    }
  } catch (e: any) {
    imageSection.showError(e.message ?? '이미지 생성 실패');
  } finally {
    imageSection.showSpinner(false);
  }
});

// 이미지 업로드 시 컬러 자동 추출
async function updateColorSuggestions() {
  const mainImg = imageSection.getMainImage();
  if (!mainImg) return;
  const imgData = await getImageDataFromBase64(mainImg.base64, mainImg.mimeType);
  if (!imgData) return;
  const keyColors = extractKeyColors(imgData, 3);
  const compColors = computeComplementaryColors(keyColors, 3);
  styleSection.setColorSuggestions(keyColors, compColors);
}

// ── 카피 생성 (Claude) ─────────────────────────────────────
copySection.onGenerate(async () => {
  const input = copySection.getInputText();
  if (!input) { copySection.showError('키워드 또는 설명을 입력해주세요.'); return; }

  const claudeKey = api.getClaudeKey();
  if (!claudeKey) { copySection.showError('Claude API Key를 입력해주세요.'); return; }

  copySection.showSpinner(true);
  copySection.showError('');
  try {
    const result = await generateCopy(input, claudeKey);
    copySection.setCopyContent(result);
  } catch (e: any) {
    copySection.showError(e.message ?? '카피 생성 실패');
  } finally {
    copySection.showSpinner(false);
  }
});

copySection.onRefine(async () => {
  const input = copySection.getInputText();
  if (!input) { copySection.showError('다듬을 초안을 입력해주세요.'); return; }

  const claudeKey = api.getClaudeKey();
  if (!claudeKey) { copySection.showError('Claude API Key를 입력해주세요.'); return; }

  copySection.showSpinner(true);
  copySection.showError('');
  try {
    const result = await refineCopy(input, claudeKey);
    copySection.setCopyContent(result);
  } catch (e: any) {
    copySection.showError(e.message ?? '카피 다듬기 실패');
  } finally {
    copySection.showSpinner(false);
  }
});

// ── 컬러 변경 → 프리뷰 ────────────────────────────────────
styleSection.onColorChange((hex) => {
  sendToMain({ type: 'PREVIEW_COLOR', color: hex });
});

// ── 전체 적용 ─────────────────────────────────────────────
applySection.onApply(async () => {
  const copy = copySection.getCopyContent();
  const payload: ApplyPayload = {
    copy,
    mainImage:          imageSection.getMainImage(),
    subImage01:         imageSection.getSub1Image(),
    subImage02:         imageSection.getSub2Image(),
    badgeComponentName: styleSection.getSelectedBadge(),
    backgroundColor:    styleSection.getSelectedColor(),
  };
  applySection.setLoading(true);
  applySection.showError('');
  sendToMain({ type: 'APPLY_CONTENT', payload });
});

// ── Main → UI 메시지 수신 ─────────────────────────────────
window.onmessage = async (event: MessageEvent) => {
  const msg: MainMessage = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'API_KEYS':
      api.setKeys(msg.claudeKey, msg.geminiKey);
      break;

    case 'SELECTION_INFO':
      applySection.updateSelection({
        nodeType:   msg.nodeType,
        nodeName:   msg.nodeName,
        frameCount: msg.frameCount,
      });
      break;

    case 'BADGE_COMPONENTS':
      styleSection.populateBadges(msg.names);
      break;

    case 'APPLY_DONE':
      applySection.setLoading(false);
      applySection.showSuccess('✓ 적용 완료!');
      break;

    case 'ERROR':
      applySection.setLoading(false);
      applySection.showError(msg.message);
      break;
  }
};

// ── 초기 요청 ─────────────────────────────────────────────
sendToMain({ type: 'GET_API_KEYS' });
sendToMain({ type: 'GET_SELECTION' });
sendToMain({ type: 'GET_BADGE_COMPONENTS' });
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공, `code.js`와 `ui.js` 모두 생성

- [ ] **Step 3: 전체 테스트 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm test 2>&1
```
Expected: 25 tests PASS

- [ ] **Step 4: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/main.ts src/ui/applySection.ts src/ui/styleSection.ts && git commit -m "feat: implement main.ts orchestrator — wire all UI sections with postMessage routing"
```

---

## Task 8: 이미지 업로드 후 컬러 자동 추출 연결

**Files:**
- Modify: `src/ui/imageSection.ts`

Task 7에서 `updateColorSuggestions()`를 정의했지만 이미지 업로드 완료 시점에 자동으로 호출해야 한다. `initImageSection`에 `onImageChange` 콜백을 추가해 `main.ts`에서 연결한다.

- [ ] **Step 1: imageSection.ts에 onImageChange 콜백 추가**

`ImageSectionController` 인터페이스에 추가:
```typescript
onImageChange(handler: () => void): void;
```

`initImageSection` 반환 객체에 추가:
```typescript
let imageChangeHandler: (() => void) | null = null;
```

`setSlotImage` 함수 끝에 추가:
```typescript
imageChangeHandler?.();
```

반환 객체에 추가:
```typescript
onImageChange: (h) => { imageChangeHandler = h; },
```

- [ ] **Step 2: main.ts에서 연결**

`imageSection` 초기화 직후에 추가:
```typescript
imageSection.onImageChange(updateColorSuggestions);
```

- [ ] **Step 3: 빌드 통과 확인**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add src/ui/imageSection.ts src/ui/main.ts && git commit -m "feat: auto-extract key colors on image upload"
```

---

## Task 9: 최종 검증 및 빌드

**Files:**
- 변경 없음 — 검증만 수행

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm test 2>&1
```
Expected: 25 tests PASS (4 파일)

- [ ] **Step 2: 프로덕션 빌드**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && npm run build 2>&1
```
Expected: 빌드 성공, `code.js`, `ui.js` 생성

- [ ] **Step 3: 출력 파일 크기 확인**

```bash
ls -lh "/Users/HYChoi/Documents/ai-projects/new plugin/code.js" "/Users/HYChoi/Documents/ai-projects/new plugin/ui.js"
```
Expected: 두 파일 모두 존재, 각각 > 1KB

- [ ] **Step 4: manifest.json 최종 확인**

```bash
cat "/Users/HYChoi/Documents/ai-projects/new plugin/manifest.json"
```
Expected: `networkAccess.allowedDomains`에 `https://api.anthropic.com`과 `https://generativelanguage.googleapis.com` 포함

- [ ] **Step 5: 최종 커밋**

```bash
cd "/Users/HYChoi/Documents/ai-projects/new plugin" && git add -A && git status
```
변경 없으면 커밋 스킵. 변경사항 있으면:
```bash
git commit -m "chore: final build verification"
```

---

## 체크리스트 (Spec Coverage)

| 요구사항 | 구현 Task |
|---|---|
| 섹션 선택 → 하위 모든 프레임 적용 | ✅ code.ts (기존 완성) |
| 프레임 선택 → 해당 프레임 적용 | ✅ code.ts (기존 완성) |
| Claude API — 카피 생성 | ✅ claude.ts + Task 7 |
| Claude API — 카피 다듬기 | ✅ claude.ts + Task 7 |
| Gemini API — 이미지 생성 | ✅ gemini.ts + Task 7 |
| 로컬 파일 업로드 | Task 3 |
| 드래그앤드롭 | Task 3 |
| 클립보드 붙여넣기 | Task 3 |
| 피그마 레이어 가져오기 | Task 3 (placeholder, 확장 가능) |
| 키컬러 3개 추천 | Task 5 + Task 8 |
| 보색 3개 추천 | Task 5 + Task 8 |
| 팔레트 전체 펼쳐서 선택 | Task 5 |
| 컬러 직접 수정 (피커 + HEX) | Task 5 |
| 실시간 컬러 프리뷰 | Task 7 |
| 뱃지 자동 탐색 드롭다운 | ✅ code.ts + Task 5 |
| API 키 clientStorage 저장 | ✅ code.ts + apiSettings.ts |
| 글자수 실시간 카운터 | Task 4 |
| 메인 카피 어절 분리 (01/02) | Task 4 |
| 적용 버튼 + 선택 노드 정보 | Task 6 |
