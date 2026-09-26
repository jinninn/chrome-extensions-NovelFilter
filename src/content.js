(() => {
  'use strict';
  const core = globalThis.NovelFilter, sites = globalThis.NovelFilterSites;
  let history = core.empty(), prefs = core.settings(), temporaryShow = false;
  let lastUrl = location.href, autoDone = false, timer, stopped = false;
  let currentWork = null, filteredCount = 0, lastError = '';
  const cards = new Map();
  const revealed = new Set();
  function button(label, action) {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
    el.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation(); el.disabled = true;
      try { await action(); } catch (error) { lastError = `保存できませんでした: ${error.message}`; console.error('[Novel Filter]', error); }
      finally { el.disabled = false; }
    });
    return el;
  }
  async function send(payload) {
    const result = await chrome.runtime.sendMessage({ channel: 'novel-filter', ...payload });
    if (!result?.ok) throw new Error(result?.error || '拡張機能を再読み込みした場合はページも再読み込みしてください。');
    return result;
  }
  function controls(work) {
    const row = document.createElement('div'); row.className = 'nf-controls'; row.dataset.nfUi = 'controls';
    const status = history.works[core.keyOf(work)]?.status || 'unread';
    const label = document.createElement('span'); label.textContent = `NF · ${core.statuses[status]}`; row.append(label);
    for (const state of ['read', 'hidden', 'unread']) {
      if (state === status) continue;
      row.append(button(state === 'unread' ? '未読に戻す' : `${core.statuses[state]}にする`, async () => {
        if (core.keyOf(core.parseWork(location.href) || {}) === core.keyOf(work)) autoDone = true;
        const result = await send({ type: 'status', work, status: state });
        history = result.history; scan();
      }));
    }
    return row;
  }
  function restore(element, record) {
    element.removeAttribute('data-nf-filter'); record.controls?.remove(); record.placeholder?.remove();
  }
  const observer = new MutationObserver(schedule);
  function schedule() {
    if (stopped) return;
    clearTimeout(timer); timer = setTimeout(scan, 180);
  }
  function scan() {
    if (stopped) return;
    observer.disconnect();
    try {
      if (lastUrl !== location.href) { lastUrl = location.href; autoDone = false; temporaryShow = false; revealed.clear(); }
      for (const [element, record] of cards) restore(element, record);
      cards.clear();
      currentWork = sites.currentWork(document, location.href);
      let hiddenCount = 0;
      if (prefs.enabled) for (const { element, work } of sites.findCards(document, location.href)) {
        const row = controls(work); element.append(row);
        const record = { controls: row };
        if (core.filtered(history.works[core.keyOf(work)], prefs)) {
          hiddenCount++;
          if (!temporaryShow && !revealed.has(core.keyOf(work))) {
            element.dataset.nfFilter = prefs.display;
            if (prefs.display === 'placeholder') {
              const placeholder = document.createElement(element.tagName === 'LI' ? 'li' : 'div');
              placeholder.dataset.nfUi = 'placeholder'; placeholder.className = 'nf-placeholder';
              const text = document.createElement('span'); text.textContent = `${core.statuses[history.works[core.keyOf(work)].status]}の作品 `;
              placeholder.append(text, button('この作品を表示', () => { revealed.add(core.keyOf(work)); element.removeAttribute('data-nf-filter'); placeholder.remove(); }));
              element.before(placeholder); record.placeholder = placeholder;
            }
          }
        }
        cards.set(element, record);
      }
      filteredCount = hiddenCount;
      lastError = '';
      maybeAutoRead(currentWork);
    } catch (error) { lastError = `ページの処理に失敗しました: ${error.message}`; console.error('[Novel Filter]', error); }
    finally { observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] }); }
  }
  async function maybeAutoRead(work) {
    if (!work || autoDone || !prefs.enabled || prefs.autoRead === 'manual' || document.visibilityState !== 'visible') return;
    if (prefs.autoRead === 'episode' && !sites.isEpisode(document, location.href)) return;
    autoDone = true;
    try {
      const result = await send({ type: 'status', work, status: 'read', automatic: true });
      history = result.history; schedule();
    } catch (error) { lastError = `自動既読の保存に失敗しました: ${error.message}`; console.error('[Novel Filter]', error); }
  }
  function pageState() {
    return {
      enabled: prefs.enabled,
      filteredCount,
      temporaryShow,
      work: currentWork,
      status: currentWork ? (history.works[core.keyOf(currentWork)]?.status || 'unread') : null,
      error: lastError
    };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== 'novel-filter-page') return false;
    if (message.type === 'getPageState') { respond({ ok: true, ...pageState() }); return false; }
    if (message.type === 'toggleTemporaryShow') {
      temporaryShow = !temporaryShow;
      scan();
      respond({ ok: true, ...pageState() });
      return false;
    }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.history) history = changes.history.newValue || core.empty();
    if (changes.settings) prefs = core.settings(changes.settings.newValue);
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  // Isolated worlds cannot reliably intercept a site's history.pushState.
  const navigationTimer = setInterval(() => { if (lastUrl !== location.href) schedule(); }, 1000);
  send({ type: 'get' }).then(result => { history = result.history; prefs = result.settings; scan(); }).catch(error => {
    stopped = true; clearInterval(navigationTimer);
    lastError = `初期化できませんでした: ${error.message}`;
    console.error('[Novel Filter]', error);
  });
})();
