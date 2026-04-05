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
  const textUpdates: Array<[ReturnType<typeof buildLayerMap>[keyof ReturnType<typeof buildLayerMap>], string]> = [
    [map.main_copy_01, part1],
    [map.main_copy_02, part2],
    [map.main_copy_03, copy.main_copy_03],
    [map.main_copy_04, copy.main_copy_04],
    [map.sub_copy, copy.sub_copy],
  ];

  for (const [layer, text] of textUpdates) {
    if (layer && (layer as any).type === 'TEXT' && text) {
      const textNode = layer as TextNode;
      if (textNode.fontName !== figma.mixed) {
        await figma.loadFontAsync(textNode.fontName as FontName);
      } else {
        // 혼합 폰트 처리: 각 문자별 폰트를 개별 로드
        const seen = new Set<string>();
        for (let i = 0; i < textNode.characters.length; i++) {
          const fn = textNode.getRangeFontName(i, i + 1) as FontName;
          const key = `${fn.family}::${fn.style}`;
          if (!seen.has(key)) {
            seen.add(key);
            await figma.loadFontAsync(fn);
          }
        }
      }
      textNode.characters = text;
    }
  }

  // 배경 컬러 적용
  if (payload.backgroundColor) {
    const hex = payload.backgroundColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const solidFill: SolidPaint = { type: 'SOLID', color: { r, g, b } };
    if (map.background_color) {
      // #background_color 레이어가 있으면 그 레이어에 적용
      (map.background_color as RectangleNode).fills = [solidFill];
    } else {
      // 없으면 프레임 자체 배경에 적용
      frame.fills = [solidFill];
    }
  }

  // 이미지 적용 헬퍼
  async function applyImage(
    layer: ReturnType<typeof buildLayerMap>[keyof ReturnType<typeof buildLayerMap>],
    imageData: typeof payload.mainImage
  ) {
    if (!layer || !imageData) return;
    const bytes = Uint8Array.from(atob(imageData.base64), (c) => c.charCodeAt(0));
    const imageHash = figma.createImage(bytes).hash;
    (layer as RectangleNode).fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }];
  }

  await applyImage(map.image_main,   payload.mainImage);
  await applyImage(map.image_main_1, payload.subImage01);
  await applyImage(map.image_main_2, payload.subImage02);

  // 뱃지 컴포넌트 교체
  if (map.badge && payload.badgeComponentName) {
    const component = figma.root.findOne(
      (n) => n.type === 'COMPONENT' && n.name === payload.badgeComponentName
    ) as ComponentNode | null;
    if (component && (map.badge as any).type === 'INSTANCE') {
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
  console.log('[code] received message:', msg.type);
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
          for (const frame of frames) await applyToFrame(frame as FrameNode, msg.payload);
        } else if (node.type === 'FRAME' || node.type === 'COMPONENT') {
          await applyToFrame(node as FrameNode, msg.payload);
        } else {
          sendToUI({ type: 'ERROR', message: '섹션 또는 프레임을 선택해주세요.' });
          return;
        }
        sendToUI({ type: 'APPLY_DONE' });
        break;
      }
      case 'APPLY_GENERATED_IMAGE': {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) break;
        const node = selection[0];
        const targets: SceneNode[] =
          node.type === 'SECTION' ? getFramesFromSection(node as SectionNode) as SceneNode[]
          : (node.type === 'FRAME' || node.type === 'COMPONENT') ? [node as SceneNode]
          : [];
        const bytes = Uint8Array.from(atob(msg.imageData.base64), (c) => c.charCodeAt(0));
        const imageHash = figma.createImage(bytes).hash;
        for (const target of targets) {
          const layer = buildLayerMap(target as any).image_main;
          if (layer) {
            (layer as RectangleNode).fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }];
          }
        }
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
