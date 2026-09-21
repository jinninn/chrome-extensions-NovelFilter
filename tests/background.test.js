import { test } from 'node:test';
import assert from 'node:assert/strict';
let listener, saved = {}, failNext = false;
globalThis.chrome = {
  runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
  storage: { local: {
    async get() { await new Promise(resolve => setTimeout(resolve, 2)); return structuredClone(saved); },
    async set(values) { if (failNext) { failNext = false; throw new Error('QUOTA'); } saved = { ...saved, ...structuredClone(values) }; }
  } }
};
await import('../src/background.js');
const send = data => new Promise(resolve => listener({ channel: 'novel-filter', ...data }, { id: 'test-extension' }, resolve));
test('concurrent tab writes are serialized; a failed write does not poison the queue', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => send({ type: 'status', work: { site: 'kakuyomu', workId: `${i + 1}` }, status: 'read' })));
  assert.ok(results.every(r => r.ok));
  assert.equal(Object.keys(saved.history.works).length, 20);
  failNext = true;
  assert.equal((await send({ type: 'settings', settings: { enabled: false } })).ok, false);
  assert.equal((await send({ type: 'settings', settings: { enabled: false } })).ok, true);
  assert.equal(saved.settings.enabled, false);
  const before = structuredClone(saved.history);
  assert.equal((await send({ type: 'import', data: { formatVersion: 999, works: {} } })).ok, false);
  assert.deepEqual(saved.history, before);
});
