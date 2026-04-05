// src/ui/apiSettings.ts

export function initApiSettings(
  onSave: (claudeKey: string, geminiKey: string) => void
) {
  const claudeInput = document.getElementById('claude-key') as HTMLInputElement;
  const geminiInput = document.getElementById('gemini-key') as HTMLInputElement;
  const saveBtn = document.getElementById('btn-save-keys') as HTMLButtonElement;
  const savedMsg = document.getElementById('keys-saved') as HTMLElement;

  saveBtn.addEventListener('click', () => {
    const claudeKey = claudeInput.value.trim();
    const geminiKey = geminiInput.value.trim();
    if (!claudeKey || !geminiKey) {
      alert('Claude API Key와 Gemini API Key를 모두 입력해주세요.');
      return;
    }
    onSave(claudeKey, geminiKey);
    savedMsg.style.display = 'inline';
    setTimeout(() => (savedMsg.style.display = 'none'), 2000);
  });

  // 섹션 토글 — 모든 .section-title에 적용
  document.querySelectorAll('.section-title[data-target]').forEach((title) => {
    title.addEventListener('click', () => {
      const targetId = (title as HTMLElement).getAttribute('data-target');
      if (!targetId) return;
      const body = document.getElementById(targetId);
      if (!body) return;
      body.classList.toggle('open');
      const icon = title.querySelector('.toggle-icon') as HTMLElement;
      if (icon) icon.textContent = body.classList.contains('open') ? '▼' : '▶';
    });
  });

  return {
    setKeys(claudeKey: string, geminiKey: string) {
      claudeInput.value = claudeKey;
      geminiInput.value = geminiKey;
    },
    getClaudeKey: () => claudeInput.value.trim(),
    getGeminiKey: () => geminiInput.value.trim(),
  };
}
