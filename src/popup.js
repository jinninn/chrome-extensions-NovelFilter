import { core, $, send, notify, counts, showSettings, bindSettings } from './ui.js';
let activeTabId = null, pageState = null;
bindSettings();
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
async function messagePage(type) {
  if (!activeTabId) throw new Error('対象のタブを取得できませんでした。');
  return chrome.tabs.sendMessage(activeTabId, { channel: 'novel-filter-page', type });
}
function renderPageState(state) {
  pageState = state;
  $('pageSection').hidden = false;
  $('pageFilterCount').textContent = state.enabled ? `${state.filteredCount}件` : '停止中';
  $('pageFilterText').textContent = state.enabled ? `${state.filteredCount}件をフィルターしています。` : 'フィルターは停止中です。';
  $('pageTitle').textContent = state.work?.title || 'このページに作品情報はありません。';
  const actions = $('currentStatusActions'); actions.replaceChildren();
  if (state.work) for (const status of ['read', 'hidden', 'unread']) {
    if (status === state.status) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = status === 'unread' ? '未読に戻す' : `${core.statuses[status]}にする`;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await send({ type: 'status', work: state.work, status });
        await loadPageState();
      } catch (error) { notify(error.message, true); }
      finally { button.disabled = false; }
    });
    actions.append(button);
  }
  $('togglePageFilter').hidden = !state.enabled || state.filteredCount === 0;
  $('togglePageFilter').textContent = state.temporaryShow ? 'フィルターを戻す' : 'このページだけ再表示';
  if (state.error) notify(state.error, true);
}
async function loadPageState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id || null;
    const state = await messagePage('getPageState');
    if (state?.ok) renderPageState(state);
  } catch { $('pageSection').hidden = true; }
}
$('togglePageFilter').addEventListener('click', async () => {
  $('togglePageFilter').disabled = true;
  try {
    const state = await messagePage('toggleTemporaryShow');
    if (state?.ok) renderPageState(state);
  } catch (error) { notify(error.message, true); }
  finally { $('togglePageFilter').disabled = false; }
});
try { const result = await send({ type: 'get' }); counts(result.history); showSettings(result.settings); }
catch (error) { notify(error.message, true); }
await loadPageState();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.history?.newValue) counts(changes.history.newValue);
  if (changes.settings?.newValue) showSettings(changes.settings.newValue);
  loadPageState();
});
