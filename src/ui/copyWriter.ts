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
  const subInput  = document.getElementById('sub-copy-input')  as HTMLInputElement;
  const mainCount = document.getElementById('main-count')       as HTMLElement;
  const subCount  = document.getElementById('sub-count')        as HTMLElement;

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
    (document.getElementById(spinnerId) as HTMLElement).style.display = loading ? 'block' : 'none';
    (document.getElementById(btnId)     as HTMLButtonElement).disabled = loading;
  }

  function showResult(copy: CopyContent) {
    generatedCopy = copy;
    const area   = document.getElementById('copy-result-area') as HTMLElement;
    const result = document.getElementById('copy-result')      as HTMLElement;
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
    subInput.value  = generatedCopy.sub_copy;
    mainCount.textContent = `${generatedCopy.main_copy_03.length} / 16자`;
    subCount.textContent  = `${generatedCopy.sub_copy.length} / 16자`;
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
        sub_copy:     subInput.value.trim(),
      };
    },
  };
}
