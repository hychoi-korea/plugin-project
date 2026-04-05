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

  return {
    setKeys(claudeKey: string, geminiKey: string) {
      claudeInput.value = claudeKey;
      geminiInput.value = geminiKey;
    },
    getClaudeKey: () => claudeInput.value.trim(),
    getGeminiKey: () => geminiInput.value.trim(),
  };
}
