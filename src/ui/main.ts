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
let currentCopy:  CopyContent | null = null;
let currentColor: string | null = null;
let currentBadge: string | null = null;

let apiSettings:  ReturnType<typeof initApiSettings>;
let styleSection: ReturnType<typeof initStyleSection>;
let applySection: ReturnType<typeof initApplySection>;
let copyWriter:   ReturnType<typeof initCopyWriter>;

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

// ── 초기화 ────────────────────────────────────────────────
// <script>가 <body> 맨 아래에 있으므로 DOM은 이미 파싱 완료.
// DOMContentLoaded는 Figma 웹뷰에서 이미 fired됐을 수 있으므로 사용 안 함.

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
  (hex)  => { currentColor = hex; },
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
      mainImage:          currentImages.main,
      subImage01:         currentImages.sub01,
      subImage02:         currentImages.sub02,
      badgeComponentName: currentBadge,
      backgroundColor:    currentColor,
    };
    applySection.setLoading(true);
    sendToPlugin({ type: 'APPLY_CONTENT', payload });
  }
);

// 섹션 토글 — 동적으로 추가된 모든 섹션 포함 (이벤트 위임)
document.getElementById('app')?.addEventListener('click', (e) => {
  const title = (e.target as HTMLElement).closest('.section-title[data-target]') as HTMLElement | null;
  if (!title) return;
  const targetId = title.getAttribute('data-target');
  if (!targetId) return;
  const body = document.getElementById(targetId);
  if (!body) return;
  body.classList.toggle('open');
  const icon = title.querySelector('.toggle-icon') as HTMLElement | null;
  if (icon) icon.textContent = body.classList.contains('open') ? '▼' : '▶';
});

sendToPlugin({ type: 'GET_API_KEYS' });
sendToPlugin({ type: 'GET_SELECTION' });
