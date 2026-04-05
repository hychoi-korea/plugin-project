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
          <div id="color-preview" style="width:28px; height:28px; border-radius:4px; border:1px solid #e0e0e0; background:#ffffff; flex-shrink:0;"></div>
          <input type="color" id="color-picker" value="#ffffff" style="width:36px; height:28px; padding:0; border:none; cursor:pointer;">
          <input type="text" id="color-hex" value="#FFFFFF" placeholder="#FFFFFF" style="flex:1; font-family:monospace;">
        </div>
      </div>
    </div>
  `;

  let selectedColor = '#FFFFFF';

  function setColor(hex: string) {
    selectedColor = hex.toUpperCase().startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    (document.getElementById('color-preview') as HTMLElement).style.background = selectedColor;
    (document.getElementById('color-picker')  as HTMLInputElement).value = selectedColor;
    (document.getElementById('color-hex')     as HTMLInputElement).value = selectedColor;
    // 팔레트 선택 표시
    document.querySelectorAll('.palette-swatch').forEach((el) => {
      const el2 = el as HTMLElement;
      el2.style.borderColor = el2.dataset.hex?.toUpperCase() === selectedColor ? '#18A0FB' : 'transparent';
    });
    onColorChange(selectedColor);
    sendToPlugin({ type: 'PREVIEW_COLOR', color: selectedColor });
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
    const el = document.getElementById(containerId)!;
    el.innerHTML = colors.map((c) => {
      const hex = rgbToHex(c);
      return `<div class="palette-swatch" data-hex="${hex}" title="${hex}"
        style="width:24px; height:24px; background:${hex}; border-radius:4px; cursor:pointer; border:2px solid transparent;"></div>`;
    }).join('');
    el.querySelectorAll('.palette-swatch').forEach((sw) => {
      sw.addEventListener('click', () => setColor((sw as HTMLElement).dataset.hex ?? '#FFF'));
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
      const keyColors  = extractKeyColors(imgData, 3);
      const compColors = computeComplementaryColors(keyColors, 3);
      renderSwatches('key-swatches',  keyColors);
      renderSwatches('comp-swatches', compColors);
    },
  };
}
