import { core, $, send, notify, counts, showSettings, bindSettings } from './ui.js';
let history = core.empty(), page = 0, pendingImport = null;
const pageSize = 50;
bindSettings();
function render() {
  counts(history);
  const query = $('search').value.trim().toLocaleLowerCase(), site = $('siteFilter').value, status = $('statusFilter').value;
  const works = Object.values(history.works).filter(work =>
    (site === 'all' || work.site === site) && (status === 'all' || (status === 'active' ? work.status !== 'unread' : work.status === status)) &&
    `${work.title || ''} ${work.author || ''} ${core.keyOf(work)}`.toLocaleLowerCase().includes(query)
  ).sort((a, b) => b.updatedAt - a.updatedAt || core.keyOf(a).localeCompare(core.keyOf(b)));
  page = Math.min(page, Math.max(0, Math.ceil(works.length / pageSize) - 1));
  $('resultCount').textContent = `${works.length.toLocaleString()}件`;
  const list = $('historyList'); list.replaceChildren();
  if (!works.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '該当する履歴はありません。対象サイトや作品URLから登録できます。'; list.append(empty); }
  for (const work of works.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = document.createElement('div'); row.className = 'history-row';
    const details = document.createElement('div'); details.className = 'details';
    const link = document.createElement('a'); link.href = core.workUrl(work); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = work.title || work.workId;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${work.site === 'kakuyomu' ? 'カクヨム' : '小説家になろう'} · ${work.author ? `${work.author} · ` : ''}${work.workId} · ${new Date(work.updatedAt).toLocaleString('ja-JP')}`;
    const select = document.createElement('select'); select.setAttribute('aria-label', `${work.title || work.workId}の状態`);
    for (const [value, label] of Object.entries(core.statuses)) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
    select.value = work.status;
    select.addEventListener('change', async () => {
      select.disabled = true;
      try { const result = await send({ type: 'status', work, status: select.value }); history = result.history; render(); notify('作品の状態を更新しました。'); }
      catch (error) { select.value = work.status; select.disabled = false; notify(error.message, true); }
    });
    details.append(link, meta); row.append(details, select); list.append(row);
  }
  $('pageLabel').textContent = `${page + 1} / ${Math.max(1, Math.ceil(works.length / pageSize))}`;
  $('previous').disabled = page === 0; $('next').disabled = (page + 1) * pageSize >= works.length;
}
for (const id of ['search', 'siteFilter', 'statusFilter']) $(id).addEventListener('input', () => { page = 0; render(); });
$('previous').addEventListener('click', () => { page--; render(); });
$('next').addEventListener('click', () => { page++; render(); });
$('addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = event.submitter; submit.disabled = true;
  try {
    const work = core.parseWork($('workUrl').value.trim());
    if (!work) throw new Error('カクヨムまたは小説家になろうの作品URLを入力してください。');
    const result = await send({ type: 'status', work, status: $('addStatus').value });
    history = result.history; $('workUrl').value = ''; page = 0; render(); notify('作品を登録しました。');
  } catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; }
});
$('export').addEventListener('click', async () => {
  try {
    const result = await send({ type: 'get' });
    const blob = new Blob([JSON.stringify(result.history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `novel-filter-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify('履歴を書き出しました。');
  } catch (error) { notify(error.message, true); }
});
function clearImport() { pendingImport = null; $('importFile').value = ''; $('importPreview').hidden = true; }
$('chooseImport').addEventListener('click', () => $('importFile').click());
$('cancelImport').addEventListener('click', clearImport);
$('importFile').addEventListener('change', async () => {
  const file = $('importFile').files[0]; if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('10MB以下のJSONファイルを指定してください。');
    pendingImport = core.validate(JSON.parse(await file.text()));
    const result = core.merge((await send({ type: 'get' })).history, pendingImport);
    $('importSummary').textContent = `新規 ${result.added}件、更新 ${result.updated}件を取り込みます。既存の他の履歴は保持します。`;
    $('importPreview').hidden = false;
  } catch (error) { clearImport(); notify(`取り込めません: ${error.message}`, true); }
});
$('confirmImport').addEventListener('click', async () => {
  if (!pendingImport) return;
  $('confirmImport').disabled = true;
  try {
    const result = await send({ type: 'import', data: pendingImport });
    clearImport(); history = (await send({ type: 'get' })).history; render();
    notify(`新規 ${result.added}件、更新 ${result.updated}件を取り込みました。`);
  } catch (error) { notify(error.message, true); }
  finally { $('confirmImport').disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.history) { history = changes.history.newValue || core.empty(); render(); }
  if (changes.settings) showSettings(core.settings(changes.settings.newValue));
});
try { const result = await send({ type: 'get' }); history = result.history; showSettings(result.settings); render(); }
catch (error) { notify(error.message, true); }
