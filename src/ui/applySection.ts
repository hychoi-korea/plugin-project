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
    <div class="error-msg"   id="apply-error"   style="display:none;"></div>
    <div class="success-msg" id="apply-success" style="display:none;">적용 완료!</div>
  `;

  document.getElementById('btn-apply')?.addEventListener('click', onApply);

  return {
    setLoading(loading: boolean) {
      (document.getElementById('spinner-apply') as HTMLElement).style.display = loading ? 'block' : 'none';
      (document.getElementById('btn-apply')     as HTMLButtonElement).disabled = loading;
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
