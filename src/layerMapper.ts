// src/layerMapper.ts
// Runs in Figma main thread. Figma types are globals from @figma/plugin-typings.

/** Minimal node shape needed for traversal */
interface TraversableNode {
  name: string;
  children?: readonly TraversableNode[] | TraversableNode[];
}

/** name이 정확히 일치하는 레이어를 재귀 탐색. 없으면 null */
export function findLayerByName(
  node: TraversableNode,
  name: string
): TraversableNode | null {
  if (node.name === name) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findLayerByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

/** name을 포함하는 레이어를 재귀 탐색 (대소문자 무시). 없으면 null */
export function findLayerContaining(
  node: TraversableNode,
  keyword: string
): TraversableNode | null {
  if (node.name.toLowerCase().includes(keyword.toLowerCase())) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findLayerContaining(child, keyword);
      if (found) return found;
    }
  }
  return null;
}

/** 메인 카피를 어절 경계 기준으로 앞/뒤 8자씩 분리 */
export function splitMainCopy(copy: string): { part1: string; part2: string } {
  // 공백(어절 경계) 기준으로 8자 이내 최적 분리점 탐색
  let splitIdx = -1;
  for (let i = Math.min(8, copy.length - 1); i >= 1; i--) {
    if (copy[i] === ' ') {
      splitIdx = i;
      break;
    }
  }

  // 공백을 찾은 경우 공백 기준으로 분리
  if (splitIdx !== -1) {
    const part1 = copy.slice(0, splitIdx).trim();
    const part2 = copy.slice(splitIdx).trim();
    return { part1, part2 };
  }

  // 공백 없이 8자 이하이면 전체를 part1로
  if (copy.length <= 8) return { part1: copy, part2: '' };

  // 공백 없이 8자 초과이면 8자 기준으로 분리
  const part1 = copy.slice(0, 8).trim();
  const part2 = copy.slice(8).trim();
  return { part1, part2 };
}

/** 프레임 내 레이어 매핑 결과 */
export interface LayerMap {
  main_copy_01:     TraversableNode | null;
  main_copy_02:     TraversableNode | null;
  main_copy_03:     TraversableNode | null;
  main_copy_04:     TraversableNode | null;
  sub_copy:         TraversableNode | null;
  image_main:       TraversableNode | null;
  image_main_1:     TraversableNode | null;
  image_main_2:     TraversableNode | null;
  background_color: TraversableNode | null;
  badge:            TraversableNode | null;
}

/** 프레임(또는 섹션)에서 레이어명 기반 매핑 */
export function buildLayerMap(node: TraversableNode): LayerMap {
  return {
    main_copy_01:     findLayerByName(node, '#main_copy_01'),
    main_copy_02:     findLayerByName(node, '#main_copy_02'),
    main_copy_03:     findLayerByName(node, '#main_copy_03'),
    main_copy_04:     findLayerByName(node, '#main_copy_04'),
    sub_copy:         findLayerByName(node, '#sub_copy'),
    image_main:       findLayerByName(node, '#image_main'),
    image_main_1:     findLayerByName(node, '#image_main_1'),
    image_main_2:     findLayerByName(node, '#image_main_2'),
    background_color: findLayerByName(node, '#background_color'),
    badge:            findLayerByName(node, '#badge'),
  };
}

/** 섹션 선택 시 하위 프레임/컴포넌트 목록 반환 */
export function getFramesFromSection(
  section: TraversableNode & { children: readonly TraversableNode[] }
): TraversableNode[] {
  return section.children.filter((child) =>
    (child as any).type === 'FRAME' || (child as any).type === 'COMPONENT'
  );
}
