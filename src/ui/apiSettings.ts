// src/ui/apiSettings.ts

export function initApiSettings(
  onSave: (claudeKey: string, geminiKey: string) => void
) {
  console.log('[banner] initApiSettings: start');
  const claudeInput = document.getElementById('claude-key') as HTMLInputElement;
  const geminiInput = document.getElementById('gemini-key') as HTMLInputElement;
  const saveBtn = document.getElementById('btn-save-keys') as HTMLButtonElement;
  const savedMsg = document.getElementById('keys-saved') as HTMLElement;
  const errorMsg = document.getElementById('keys-error') as HTMLElement | null;

  console.log('[banner] elements:', { claudeInput, geminiInput, saveBtn, savedMsg, errorMsg });

  function showError(msg: string) {
    if (errorMsg) {
      errorMsg.textContent = msg;
      errorMsg.style.display = 'block';
      setTimeout(() => (errorMsg.style.display = 'none'), 3000);
    }
  }

  if (!saveBtn) {
    console.error('[banner] btn-save-keys NOT FOUND');
    return { setKeys: () => {}, getClaudeKey: () => '', getGeminiKey: () => '' };
  }

  saveBtn.addEventListener('click', () => {
    console.log('[banner] save button clicked');
    const claudeKey = claudeInput.value.trim();
    const geminiKey = geminiInput.value.trim();
    console.log('[banner] keys:', { claudeKey: claudeKey.slice(0, 8) + '...', geminiKey: geminiKey.slice(0, 8) + '...' });
    if (!claudeKey && !geminiKey) {
      showError('Claude API Key와 Gemini API Key를 모두 입력해주세요.');
      return;
    }
    if (!claudeKey) { showError('Claude API Key를 입력해주세요.'); return; }
    if (!geminiKey) { showError('Gemini API Key를 입력해주세요.'); return; }
    if (errorMsg) errorMsg.style.display = 'none';
    onSave(claudeKey, geminiKey);
    savedMsg.style.display = 'inline';
    setTimeout(() => (savedMsg.style.display = 'none'), 2000);
  });

  console.log('[banner] initApiSettings: click handler attached');

  return {
    setKeys(claudeKey: string, geminiKey: string) {
      claudeInput.value = claudeKey;
      geminiInput.value = geminiKey;
    },
    getClaudeKey: () => claudeInput.value.trim(),
    getGeminiKey: () => geminiInput.value.trim(),
  };
}
