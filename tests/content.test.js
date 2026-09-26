import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
const scripts = ['core', 'sites', 'content'].map(name => readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8'));
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(html, history, settings = {}, url = 'https://kakuyomu.jp/rankings/all/weekly') {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
  let change, mutation, pageMessage, state = { history: history || { formatVersion: 1, works: {} }, settings }, timers = new Map(), nextTimer = 0;
  const messages = [];
  const context = vm.createContext({ document, window, location: { href: url }, URL, console,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval() { return 1; }, clearInterval() {},
    MutationObserver: class { constructor(fn) { mutation = fn; } disconnect() {} observe() {} },
    chrome: { storage: { onChanged: { addListener(fn) { change = fn; } } }, runtime: { id: 'test-extension', onMessage: { addListener(fn) { pageMessage = fn; } }, async sendMessage(message) {
      messages.push(message);
      if (message.type === 'status') state.history = context.NovelFilter.setStatus(state.history, message.work, message.status, 200, message.automatic);
      return { ok: true, ...state, settings: context.NovelFilter.settings(state.settings) };
    } } }
  });
  scripts.forEach(source => vm.runInContext(source, context)); await flush();
  async function tick() { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); await flush(); }
  function sendPage(type) { let response; pageMessage({ channel: 'novel-filter-page', type }, { id: 'test-extension' }, value => { response = value; }); return response; }
  return { document, window, messages, tick, sendPage, mutation: () => mutation([]), async settings(next) { state.settings = next; change({ settings: { newValue: next } }, 'local'); await tick(); }, async history(next) { state.history = next; change({ history: { newValue: next } }, 'local'); await tick(); } };
}
const history = { formatVersion: 1, works: { 'kakuyomu:123': { site: 'kakuyomu', workId: '123', status: 'read', updatedAt: 100 } } };
const card = '<li class="Rankings_item__abc"><h3><a href="/works/123">作品A</a></h3><p>あらすじ</p></li>';
test('content filters and restores cards, tracks dynamic additions and avoids duplicate controls', async () => {
  const app = await setup(`<ol>${card}</ol>`, history);
  assert.equal(app.document.querySelector('li').dataset.nfFilter, 'hide');
  assert.equal(app.document.querySelectorAll('.nf-controls').length, 1);
  assert.equal(app.document.querySelector('.nf-toolbar'), null);
  assert.equal(app.sendPage('getPageState').filteredCount, 1);
  assert.equal(app.sendPage('toggleTemporaryShow').temporaryShow, true);
  assert.equal(app.document.querySelector('li').hasAttribute('data-nf-filter'), false);
  assert.equal(app.sendPage('toggleTemporaryShow').temporaryShow, false);
  assert.equal(app.document.querySelector('li').dataset.nfFilter, 'hide');
  await app.settings({ enabled: false });
  assert.equal(app.document.querySelector('li').hasAttribute('data-nf-filter'), false);
  assert.equal(app.document.querySelectorAll('.nf-controls').length, 0);
  await app.settings({ enabled: true, display: 'dim' });
  assert.equal(app.document.querySelector('li').dataset.nfFilter, 'dim');
  app.document.querySelector('ol').insertAdjacentHTML('beforeend', card);
  app.mutation(); await app.tick();
  assert.equal(app.document.querySelectorAll('[data-nf-filter="dim"]').length, 2);
  assert.equal(app.document.querySelectorAll('.nf-controls').length, 2);
  await app.history({ formatVersion: 1, works: {} });
  assert.equal(app.document.querySelectorAll('[data-nf-filter]').length, 0);
});
test('placeholder reveal survives unrelated mutations without changing history', async () => {
  const app = await setup(`<ol>${card}</ol>`, history, { display: 'placeholder' });
  assert.equal(app.document.querySelectorAll('.nf-placeholder').length, 1);
  app.document.querySelector('.nf-placeholder button').click(); await flush();
  app.mutation(); await app.tick();
  assert.equal(app.document.querySelectorAll('[data-nf-filter]').length, 0);
  assert.equal(app.document.querySelectorAll('.nf-placeholder').length, 0);
  assert.equal(app.messages.filter(m => m.type === 'status').length, 0);
});
test('automatic read writes once per page and never hides the reader', async () => {
  const app = await setup('<h1 id="workTitle">作品</h1><div class="widget-episodeBody">本文</div>', null, {}, 'https://kakuyomu.jp/works/123/episodes/456');
  await app.tick(); app.mutation(); await app.tick();
  assert.equal(app.messages.filter(m => m.type === 'status').length, 1);
  assert.equal(app.document.querySelectorAll('[data-nf-filter]').length, 0);
  assert.equal(app.document.querySelector('.widget-episodeBody').textContent, '本文');
});
