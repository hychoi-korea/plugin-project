// src/ui/imageInput.ts
import type { ImageData } from '../types';

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
