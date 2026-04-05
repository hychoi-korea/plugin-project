// src/ui/main.ts
import { initApiSettings } from './apiSettings';
import { initImageInput } from './imageInput';
import type { MainMessage, UIMessage, ImageData } from '../types';

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

let currentImages: { main: ImageData | null; sub01: ImageData | null; sub02: ImageData | null } = {
  main: null, sub01: null, sub02: null,
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  apiSettings = initApiSettings((claudeKey, geminiKey) => {
    sendToPlugin({ type: 'SAVE_API_KEYS', claudeKey, geminiKey });
  });

  initImageInput(
    document.getElementById('sec-image')!,
    (imgs) => { currentImages = imgs; }
  );

  sendToPlugin({ type: 'GET_API_KEYS' });
  sendToPlugin({ type: 'GET_SELECTION' });
});

// 다른 섹션에서 사용할 수 있도록 export
export { sendToPlugin };
