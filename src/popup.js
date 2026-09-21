import { $, send, notify, counts, showSettings, bindSettings } from './ui.js';
bindSettings();
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
try { const result = await send({ type: 'get' }); counts(result.history); showSettings(result.settings); }
catch (error) { notify(error.message, true); }
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.history?.newValue) counts(changes.history.newValue);
  if (changes.settings?.newValue) showSettings(changes.settings.newValue);
});
