export const core = globalThis.NovelFilter;
export const $ = id => document.getElementById(id);
export function notify(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
export async function send(payload) {
  const result = await chrome.runtime.sendMessage({ channel: 'novel-filter', ...payload });
  if (!result?.ok) throw new Error(result?.error || '保存先に接続できませんでした。');
  return result;
}
export function counts(history) {
  const works = Object.values(history.works);
  $('readCount').textContent = works.filter(w => w.status === 'read').length.toLocaleString();
  $('hiddenCount').textContent = works.filter(w => w.status === 'hidden').length.toLocaleString();
}
export function showSettings(prefs) {
  for (const key of Object.keys(core.defaults)) {
    const el = $(key);
    if (el.type === 'checkbox') el.checked = prefs[key]; else el.value = prefs[key];
  }
}
export function bindSettings() {
  for (const key of Object.keys(core.defaults)) {
    $(key).addEventListener('change', async event => {
      const el = event.target; el.disabled = true;
      try {
        await send({ type: 'settings', settings: { [key]: el.type === 'checkbox' ? el.checked : el.value } });
        notify('設定を保存しました。');
      } catch (error) {
        notify(error.message, true);
        try { showSettings((await send({ type: 'get' })).settings); } catch { /* Keep the original error visible. */ }
      } finally { el.disabled = false; }
    });
  }
}
