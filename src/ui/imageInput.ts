// src/ui/imageInput.ts
import type { ImageData } from '../types';
import { generateBannerImage } from '../gemini';
import { extractKeyColors, computeComplementaryColors, rgbToHex, getImageDataFromBase64 } from '../colorExtractor';
import { sendToPlugin } from './main';

type SlotId = 'main' | 'sub01' | 'sub02';

interface ImageSlot {
  id: SlotId;
  label: string;
  required: boolean;
}

const SLOTS: ImageSlot[] = [
  { id: 'main',  label: '메인 이미지',  required: true  },
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
  onChange: (images: { main: ImageData | null; sub01: ImageData | null; sub02: ImageData | null }) => void,
  getGeminiKey: () => string
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

      <!-- AI 이미지 생성 -->
      <div style="margin-top:12px; padding-top:12px; border-top:1px solid #f0f0f0;">
        <label style="font-weight:600;">✨ AI 이미지 생성 (Gemini)</label>
        <div style="font-size:10px; color:#999; margin-bottom:6px;">메인 이미지 업로드 후 활성화됩니다</div>

        <!-- 배경색 추천 -->
        <div id="bg-color-section" style="display:none; margin-bottom:8px;">
          <div style="font-size:11px; color:#555; margin-bottom:4px;">배경색 선택 (이미지에서 추출)</div>
          <div id="bg-color-swatches" style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:4px;"></div>
          <div class="row" style="gap:6px; align-items:center;">
            <div id="bg-color-preview" style="width:22px; height:22px; border-radius:3px; border:1px solid #e0e0e0; background:#fff; flex-shrink:0;"></div>
            <span id="bg-color-label" style="font-size:11px; color:#999;">선택 안 함 (AI 자동)</span>
          </div>
        </div>

        <div class="row" style="gap:8px;">
          <button class="btn-primary" id="btn-gen-image" style="flex:1; font-size:11px;" disabled>이미지 생성</button>
          <div class="spinner" id="spinner-gen-image"></div>
        </div>
        <div id="gen-image-result" style="display:none; margin-top:8px;">
          <img id="gen-image-preview" style="max-width:100%; border-radius:4px; margin-bottom:6px;">
          <button class="btn-secondary" id="btn-use-gen-image" style="width:100%; font-size:11px;">이 이미지를 메인으로 사용</button>
        </div>
        <div class="error-msg" id="gen-image-error" style="display:none; margin-top:4px;"></div>
      </div>
    </div>
  `;

  const genBtn         = document.getElementById('btn-gen-image')      as HTMLButtonElement;
  const genSpinner     = document.getElementById('spinner-gen-image')  as HTMLElement;
  const genResult      = document.getElementById('gen-image-result')   as HTMLElement;
  const genPreview     = document.getElementById('gen-image-preview')  as HTMLImageElement;
  const genError       = document.getElementById('gen-image-error')    as HTMLElement;
  const bgColorSection = document.getElementById('bg-color-section')   as HTMLElement;
  const bgSwatchesEl   = document.getElementById('bg-color-swatches')  as HTMLElement;
  const bgColorPreview = document.getElementById('bg-color-preview')   as HTMLElement;
  const bgColorLabel   = document.getElementById('bg-color-label')     as HTMLElement;

  let generatedImage: ImageData | null = null;
  let selectedBgColor: string | null = null;

  function updateGenBtn() {
    genBtn.disabled = !images.main;
  }

  function selectBgColor(hex: string | null) {
    selectedBgColor = hex;
    bgColorPreview.style.background = hex ?? '#fff';
    bgColorLabel.textContent = hex ?? '선택 안 함 (AI 자동)';
    bgColorLabel.style.color = hex ? '#333' : '#999';
    bgSwatchesEl.querySelectorAll<HTMLElement>('.bg-swatch').forEach((sw) => {
      sw.style.outline = sw.dataset.hex === hex ? '2px solid #18A0FB' : 'none';
    });
  }

  async function analyzeAndShowColors(mainImage: ImageData) {
    const imgData = await getImageDataFromBase64(mainImage.base64, mainImage.mimeType);
    if (!imgData) return;
    const keyColors  = extractKeyColors(imgData, 4);
    const compColors = computeComplementaryColors(keyColors, 2);
    const allColors  = [...keyColors, ...compColors];

    bgSwatchesEl.innerHTML = allColors.map((c) => {
      const hex = rgbToHex(c);
      return `<div class="bg-swatch" data-hex="${hex}"
        title="${hex}"
        style="width:22px; height:22px; background:${hex}; border-radius:4px; cursor:pointer; border:1px solid rgba(0,0,0,0.1); flex-shrink:0;">
      </div>`;
    }).join('');

    bgSwatchesEl.querySelectorAll<HTMLElement>('.bg-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        const hex = sw.dataset.hex ?? null;
        selectBgColor(selectedBgColor === hex ? null : hex); // 재클릭 시 선택 해제
      });
    });

    bgColorSection.style.display = 'block';
  }

  SLOTS.forEach((slot) => {
    const dropZone  = document.getElementById(`drop-${slot.id}`)    as HTMLElement;
    const fileInput = document.getElementById(`file-${slot.id}`)    as HTMLInputElement;
    const preview   = document.getElementById(`preview-${slot.id}`) as HTMLImageElement;
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
      updateGenBtn();
      // 메인 이미지 업로드 시 배경색 자동 분석
      if (slot.id === 'main') {
        selectBgColor(null);
        analyzeAndShowColors(imageData);
      }
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
      dropZone.style.background  = '#f0f8ff';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#e0e0e0';
      dropZone.style.background  = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#e0e0e0';
      dropZone.style.background  = '';
      const file = e.dataTransfer?.files[0];
      if (file) applyFile(file);
    });

    // 피그마 레이어에서 가져오기 버튼
    document.getElementById(`btn-figma-${slot.id}`)?.addEventListener('click', () => {
      alert('피그마 캔버스에서 이미지 레이어를 선택한 후 이 버튼을 누르세요.');
    });
  });

  // 클립보드 붙여넣기 (전역 — 첫 빈 슬롯에 자동 채움)
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const emptySlot = SLOTS.find((s) => !(images as any)[s.id]);
          if (emptySlot) {
            const dropZone  = document.getElementById(`drop-${emptySlot.id}`)    as HTMLElement;
            const preview   = document.getElementById(`preview-${emptySlot.id}`) as HTMLImageElement;
            const dropLabel = document.getElementById(`drop-label-${emptySlot.id}`) as HTMLElement;
            const imageData = await fileToImageData(file);
            (images as any)[emptySlot.id] = imageData;
            preview.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
            preview.style.display   = 'block';
            dropLabel.textContent   = '클립보드에서 붙여넣기';
            dropZone.style.borderColor = '#18A0FB';
            onChange({ ...images });
            updateGenBtn();
            if (emptySlot.id === 'main') {
              selectBgColor(null);
              analyzeAndShowColors(imageData);
            }
          }
          break;
        }
      }
    }
  });

  // AI 이미지 생성 버튼
  genBtn.addEventListener('click', async () => {
    const apiKey = getGeminiKey();
    if (!apiKey) {
      genError.textContent = 'Gemini API Key를 먼저 입력 후 저장해주세요.';
      genError.style.display = 'block';
      setTimeout(() => (genError.style.display = 'none'), 3000);
      return;
    }

    const productImages = ([images.main, images.sub01, images.sub02] as (ImageData | null)[])
      .filter((img): img is ImageData => img !== null);

    genBtn.disabled = true;
    genSpinner.style.display = 'block';
    genResult.style.display  = 'none';
    genError.style.display   = 'none';

    try {
      generatedImage = await generateBannerImage(productImages, '정사각형 (1:1)', apiKey, selectedBgColor ?? undefined);
      genPreview.src = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`;
      genResult.style.display = 'block';
      // 생성 즉시 Figma #image_main 레이어에 적용
      sendToPlugin({ type: 'APPLY_GENERATED_IMAGE', imageData: generatedImage });
    } catch (e: any) {
      genError.textContent = e.message ?? 'AI 이미지 생성에 실패했습니다.';
      genError.style.display = 'block';
      setTimeout(() => (genError.style.display = 'none'), 5000);
    } finally {
      genBtn.disabled = !images.main;
      genSpinner.style.display = 'none';
    }
  });

  // 생성된 이미지를 메인으로 사용
  document.getElementById('btn-use-gen-image')?.addEventListener('click', () => {
    if (!generatedImage) return;
    images.main = generatedImage;
    const preview   = document.getElementById('preview-main')    as HTMLImageElement;
    const dropLabel = document.getElementById('drop-label-main') as HTMLElement;
    const dropZone  = document.getElementById('drop-main')       as HTMLElement;
    preview.src = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`;
    preview.style.display = 'block';
    dropLabel.textContent = 'AI 생성 이미지';
    dropZone.style.borderColor = '#18A0FB';
    onChange({ ...images });
    genResult.style.display = 'none';
  });

  return {
    getImages: () => ({ ...images }),
  };
}
