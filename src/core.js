/* Browser-independent data model; also usable by a future Userscript. */
(() => {
  'use strict';
  const defaults = Object.freeze({ enabled: true, hideRead: true, hideHidden: true, display: 'hide', autoRead: 'episode' });
  const statuses = Object.freeze({ unread: '未読', read: '既読', hidden: '非表示' });
  const empty = () => ({ formatVersion: 1, works: {} });
  const validId = (site, id) => typeof id === 'string' && (site === 'kakuyomu' ? /^\d{1,30}$/.test(id) : site === 'narou' && /^n\d{1,8}[a-z]{1,4}$/.test(id));
  const keyOf = (work) => `${work.site}:${work.workId}`;
  function parseWork(value, base) {
    let url;
    try { url = new URL(value, base); } catch { return null; }
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let match;
    if (url.hostname === 'kakuyomu.jp' && (match = url.pathname.match(/^\/works\/(\d{1,30})(?:\/|$)/))) {
      return { site: 'kakuyomu', workId: match[1] };
    }
    if (url.hostname === 'ncode.syosetu.com' && (match = url.pathname.match(/^\/(?:novelview\/infotop\/ncode\/)?(n\d{1,8}[a-z]{1,4})(?:\/|$)/i))) {
      return { site: 'narou', workId: match[1].toLowerCase() };
    }
    return null;
  }
  function workUrl(work) {
    if (!validId(work.site, work.workId)) throw new Error('作品IDが不正です。');
    return work.site === 'kakuyomu' ? `https://kakuyomu.jp/works/${work.workId}` : `https://ncode.syosetu.com/${work.workId}/`;
  }
  function settings(input = {}) {
    const result = { ...defaults };
    for (const key of ['enabled', 'hideRead', 'hideHidden']) if (typeof input[key] === 'boolean') result[key] = input[key];
    if (['hide', 'dim', 'placeholder'].includes(input.display)) result.display = input.display;
    if (['episode', 'work', 'manual'].includes(input.autoRead)) result.autoRead = input.autoRead;
    return result;
  }
  function validate(input) {
    if (!input || input.formatVersion !== 1 || !input.works || typeof input.works !== 'object' || Array.isArray(input.works)) throw new Error('対応していない履歴形式です。formatVersion: 1 のJSONを指定してください。');
    const output = empty();
    const entries = Object.entries(input.works);
    if (entries.length > 100000) throw new Error('一度に取り込める履歴は10万件までです。');
    for (const [key, value] of entries) {
      if (!value || !validId(value.site, value.workId) || key !== keyOf(value) || !Object.hasOwn(statuses, value.status) || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) throw new Error(`履歴の形式が不正です: ${key.slice(0, 80)}`);
      const record = { site: value.site, workId: value.workId, status: value.status, updatedAt: value.updatedAt };
      for (const field of ['title', 'author']) {
        if (value[field] !== undefined) {
          if (typeof value[field] !== 'string' || value[field].length > 2000) throw new Error(`${key}: ${field} が不正です。`);
          record[field] = value[field];
        }
      }
      if (value.firstReadAt !== undefined) {
        if (!Number.isSafeInteger(value.firstReadAt) || value.firstReadAt < 0 || value.firstReadAt > value.updatedAt) throw new Error(`${key}: firstReadAt が不正です。`);
        record.firstReadAt = value.firstReadAt;
      }
      output.works[key] = record;
    }
    return output;
  }
  function merge(local, incoming) {
    const next = validate(local);
    const other = validate(incoming);
    let added = 0, updated = 0;
    for (const [key, record] of Object.entries(other.works)) {
      const old = next.works[key];
      // Equal timestamps use a deterministic tie-break so merging converges.
      if (!old || record.updatedAt > old.updatedAt || (record.updatedAt === old.updatedAt && JSON.stringify(record) > JSON.stringify(old))) {
        next.works[key] = record;
        if (old) updated++; else added++;
      }
    }
    return { data: next, added, updated };
  }
  function setStatus(data, work, status, now = Date.now(), automatic = false) {
    if (!work || !validId(work.site, work.workId) || !Object.hasOwn(statuses, status)) throw new Error('作品または状態が不正です。');
    const key = keyOf(work), old = data.works[key];
    if (automatic && old && old.status !== 'unread') {
      // Repair titles saved by the old reader close-link fallback without
      // changing a user's read/hidden choice or the first-read timestamp.
      const title = typeof work.title === 'string' ? work.title.trim().slice(0, 2000) : '';
      const author = typeof work.author === 'string' ? work.author.trim().slice(0, 2000) : '';
      const patch = {};
      if ((!old.title || old.title === '閉じる') && title && title !== '閉じる') {
        patch.title = title;
      }
      if (!old.author?.trim() && author) patch.author = author;
      if (Object.keys(patch).length) {
        return { formatVersion: 1, works: { ...data.works, [key]: { ...old, ...patch, updatedAt: Math.max(now, old.updatedAt + 1) } } };
      }
      return data;
    }
    const record = { ...old, site: work.site, workId: work.workId, status, updatedAt: Math.max(now, (old?.updatedAt ?? 0) + 1) };
    for (const field of ['title', 'author']) if (typeof work[field] === 'string' && work[field].trim()) record[field] = work[field].trim().slice(0, 2000);
    if (status === 'read' && record.firstReadAt === undefined) record.firstReadAt = record.updatedAt;
    return { formatVersion: 1, works: { ...data.works, [key]: record } };
  }
  const filtered = (record, prefs) => prefs.enabled && ((record?.status === 'read' && prefs.hideRead) || (record?.status === 'hidden' && prefs.hideHidden));
  globalThis.NovelFilter = Object.freeze({ defaults, statuses, empty, validId, keyOf, parseWork, workUrl, settings, validate, merge, setStatus, filtered });
})();
