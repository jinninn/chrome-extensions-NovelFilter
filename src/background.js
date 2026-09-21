import './core.js';
const core = globalThis.NovelFilter;
let queue = Promise.resolve();

async function handle(message) {
  const saved = await chrome.storage.local.get(['history', 'settings']);
  const history = saved.history ? core.validate(saved.history) : core.empty();
  const prefs = core.settings(saved.settings);
  switch (message.type) {
    case 'get': return { history, settings: prefs };
    case 'status': {
      const next = core.setStatus(history, message.work, message.status, Date.now(), message.automatic === true);
      if (next !== history) await chrome.storage.local.set({ history: next });
      return { history: next };
    }
    case 'settings': {
      const next = core.settings({ ...prefs, ...message.settings });
      await chrome.storage.local.set({ settings: next });
      return { settings: next };
    }
    case 'import': {
      const result = core.merge(history, message.data);
      await chrome.storage.local.set({ history: result.data });
      return { added: result.added, updated: result.updated };
    }
    default: throw new Error('不明な操作です。');
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'novel-filter') return false;
  // All writes pass through one queue: concurrent tabs cannot overwrite one another.
  const task = queue.then(() => handle(message));
  queue = task.catch(() => {});
  task.then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: error.message }));
  return true;
});
