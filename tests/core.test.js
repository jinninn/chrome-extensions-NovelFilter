import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/core.js';
const core = globalThis.NovelFilter;
const work = { site: 'narou', workId: 'n1234ab' };
test('automatic revisit fills a missing author without changing status or first-read time', () => {
  for (const status of ['read', 'hidden']) {
    let data = core.setStatus(core.empty(), { ...work, title: '作品' }, 'read', 100);
    data = core.setStatus(data, work, status, 200);
    const repaired = core.setStatus(data, { ...work, title: '作品', author: '作者A' }, 'read', 300, true);
    const record = repaired.works[core.keyOf(work)];
    assert.equal(record.author, '作者A');
    assert.equal(record.status, status);
    assert.equal(record.firstReadAt, 100);
    assert.equal(record.updatedAt, 300);
    assert.equal(core.setStatus(repaired, { ...work, author: '' }, 'read', 400, true), repaired);
    assert.equal(core.setStatus(repaired, { ...work, author: '作者A' }, 'read', 400, true), repaired);
    assert.equal(core.merge(data, repaired).data.works[core.keyOf(work)].author, '作者A');
  }
});
test('automatic revisit repairs the legacy close title while preserving read and hidden status', () => {
  for (const status of ['read', 'hidden']) {
    let data = core.setStatus(core.empty(), { ...work, title: '閉じる' }, 'read', 100);
    data = core.setStatus(data, work, status, 200);
    const repaired = core.setStatus(data, { ...work, title: '作品の正式タイトル' }, 'read', 300, true);
    const record = repaired.works[core.keyOf(work)];
    assert.equal(record.title, '作品の正式タイトル');
    assert.equal(record.status, status);
    assert.equal(record.firstReadAt, 100);
    assert.equal(record.updatedAt, 300);
    assert.equal(core.setStatus(repaired, { ...work, title: '作品の正式タイトル' }, 'read', 400, true), repaired);
    assert.equal(core.merge(data, repaired).data.works[core.keyOf(work)].title, '作品の正式タイトル');
  }
});
test('URLs identify the same work across episodes and information pages', () => {
  for (const url of ['https://ncode.syosetu.com/n1234ab/2/?x=1', 'https://ncode.syosetu.com/novelview/infotop/ncode/N1234AB/']) assert.deepEqual(core.parseWork(url), work);
  assert.deepEqual(core.parseWork('/works/123456/episodes/789', 'https://kakuyomu.jp'), { site: 'kakuyomu', workId: '123456' });
  for (const url of ['https://kakuyomu.jp.evil.test/works/123', 'https://ncode.syosetu.com.evil.test/n1234ab/', 'javascript:alert(1)', 'https://kakuyomu.jp/users/123']) assert.equal(core.parseWork(url), null);
});
test('unread is retained as a tombstone and old backups cannot resurrect read', () => {
  const read = core.setStatus(core.empty(), work, 'read', 100);
  const unread = core.setStatus(read, work, 'unread', 200);
  assert.equal(core.merge(unread, read).data.works['narou:n1234ab'].status, 'unread');
  assert.deepEqual(core.merge(read, unread).data, unread);
  assert.equal(unread.works['narou:n1234ab'].firstReadAt, 100);
});
test('merge is additive and deterministic for equal timestamps', () => {
  const a = core.setStatus(core.empty(), work, 'read', 100);
  const b = core.setStatus(core.empty(), work, 'hidden', 100);
  assert.deepEqual(core.merge(a, b).data, core.merge(b, a).data);
  const other = core.setStatus(core.empty(), { site: 'kakuyomu', workId: '123' }, 'read', 200);
  assert.equal(Object.keys(core.merge(a, other).data.works).length, 2);
});
test('automatic read preserves hidden and timestamps; manual changes are monotonic', () => {
  const hidden = core.setStatus(core.empty(), work, 'hidden', 500);
  assert.equal(core.setStatus(hidden, work, 'read', 600, true), hidden);
  const read = core.setStatus(hidden, work, 'read', 100);
  assert.equal(read.works['narou:n1234ab'].updatedAt, 501);
  assert.equal(core.setStatus(read, work, 'read', 700, true), read);
});
test('invalid imports are rejected before changes and metadata is bounded', () => {
  for (const data of [null, {}, { formatVersion: 2, works: {} }, { formatVersion: 1, works: [] }, { formatVersion: 1, works: { '__proto__': null, bad: {} } }]) assert.throws(() => core.validate(data));
  const valid = core.setStatus(core.empty(), work, 'read', 100);
  for (const change of [{ status: 'toString' }, { updatedAt: NaN }, { firstReadAt: 101 }, { title: '<x>'.repeat(1000) }, { workId: 'wrong' }]) {
    const data = structuredClone(valid); Object.assign(data.works['narou:n1234ab'], change); assert.throws(() => core.validate(data));
  }
  assert.deepEqual(core.validate(JSON.parse(JSON.stringify(valid))), valid);
});
test('filter settings keep disabled and unread works visible', () => {
  assert.equal(core.filtered({ status: 'read' }, core.settings()), true);
  assert.equal(core.filtered({ status: 'read' }, core.settings({ enabled: false })), false);
  assert.equal(core.filtered({ status: 'unread' }, core.settings()), false);
  assert.equal(core.filtered(undefined, core.settings()), false);
  assert.deepEqual(core.settings({ display: 'bad', enabled: 'false' }), { ...core.defaults });
});
