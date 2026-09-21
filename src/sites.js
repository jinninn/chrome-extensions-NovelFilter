(() => {
  'use strict';
  const core = globalThis.NovelFilter;
  const selectors = {
    kakuyomu: '[class*="Rankings_item__"], .widget-work, .widget-workCard, [class*="WorkCard_container__"], [class*="WorkCard_workCard__"], [class*="WorkListItem_container__"]',
    narou: '.p-ranklist-item, .searchkekka_box, .p-novelcard, .p-search-results__item, .p-novel-list__item'
  };
  function uniqueWork(card, base, target) {
    const keys = new Set(Array.from(card.querySelectorAll('a[href]'), link => core.parseWork(link.getAttribute('href'), base)).filter(Boolean).map(core.keyOf));
    return keys.size === 1 && keys.has(core.keyOf(target));
  }
  function findCards(doc, base) {
    const current = core.parseWork(base);
    const found = new Map();
    for (const link of doc.querySelectorAll('a[href]')) {
      if (link.closest('[data-nf-ui], nav, header, footer')) continue;
      const work = core.parseWork(link.getAttribute('href'), base);
      if (!work || (current && core.keyOf(current) === core.keyOf(work))) continue;
      const url = new URL(link.getAttribute('href'), base);
      // Only work title/root links nominate cards, not episode or review links.
      if (!(work.site === 'kakuyomu' ? /^\/works\/\d+\/?$/ : /^\/n\d+[a-z]+\/?$/i).test(url.pathname)) continue;
      let card = link.closest(selectors[work.site]);
      if (!card && work.site === 'kakuyomu') card = link.closest('[class*="NewBox_borderSize-bb-"]');
      if (!card) {
        const candidate = link.closest('article, li');
        if (candidate && uniqueWork(candidate, base, work)) card = candidate;
      }
      if (!card || found.has(card) || !uniqueWork(card, base, work)) continue;
      const titleLink = Array.from(card.querySelectorAll('h2 a[href], h3 a[href], .p-ranklist-item__title a, .p-novelcard__title a, .novel_title a, a[title]'))
        .find(a => core.keyOf(core.parseWork(a.getAttribute('href'), base) || {}) === core.keyOf(work)) || link;
      const author = card.querySelector('[class*="WorkTitle_workLabelAuthor"] a, .p-ranklist-item__author, .p-novelcard__author') || card.querySelector('a[href*="/users/"], a[href*="mypage.syosetu.com/"]');
      found.set(card, { ...work, title: titleLink.getAttribute('title') || titleLink.textContent.trim(), author: author?.textContent.trim() || '' });
    }
    // Prefer a whole card to a nested review/list item.
    return Array.from(found, ([element, work]) => ({ element, work })).filter(({ element }) => !Array.from(found.keys()).some(other => other !== element && other.contains(element)));
  }
  function currentWork(doc, base) {
    const work = core.parseWork(base);
    if (!work) return null;
    const title = doc.querySelector(work.site === 'kakuyomu' ? '#workTitle, #workTitle a, .widget-episodeTitle a, a[data-link-click-action-name="WorkTitle"]' : '.p-novel__title, .novel_title, .novel_subtitle');
    // A reader's close button also links to the work, and its SVG has a
    // <title>閉じる</title>. Only semantic title links may supply a work name.
    const rootLinks = Array.from(doc.querySelectorAll('h1 a[href], a[title][href], a[itemprop="item"][href]')).filter(a => {
      try { return new URL(a.getAttribute('href'), base).href.replace(/\/$/, '') === core.workUrl(work).replace(/\/$/, '') && !a.closest('[data-nf-ui]'); } catch { return false; }
    });
    const rootLink = rootLinks.find(a => a.closest('h1')) || rootLinks.find(a => a.querySelector('[itemprop="name"]')) || rootLinks[0];
    const og = doc.querySelector('meta[property="og:title"]')?.content;
    const workTitle = (rootLink?.getAttribute('title')?.trim() || rootLink?.textContent.trim() || title?.textContent.trim() || og || doc.title).trim().slice(0, 2000);
    let author = '';
    if (work.site === 'kakuyomu') {
      // Restrict to the work's author area; other user links may be reviewers.
      const authorElement = doc.querySelector('#workAuthor-activityName, [class*="WorkAuthorBox_workAuthorBox"] a[href*="/users/"]');
      author = authorElement?.textContent.trim() || '';
      // The episode reader has no author link. Its page title embeds the
      // exact work title followed by the author's display name.
      if (!author && workTitle) for (const metadata of [og, doc.title]) {
        if (!metadata?.endsWith('） - カクヨム')) continue;
        const marker = `${workTitle}（`, start = metadata.lastIndexOf(marker);
        if (start !== -1) { author = metadata.slice(start + marker.length, -'） - カクヨム'.length).trim(); break; }
      }
    } else {
      const authorElement = doc.querySelector('.p-novel__author, .novel_writername');
      author = (authorElement?.querySelector('a')?.textContent || authorElement?.textContent || '').trim().replace(/^作者[：:]\s*/, '');
    }
    return { ...work, title: workTitle, author: author.slice(0, 2000) };
  }
  function isEpisode(doc, base) {
    const work = core.parseWork(base);
    if (!work) return false;
    const path = new URL(base).pathname;
    if (work.site === 'kakuyomu') return /^\/works\/\d+\/episodes\/\d+\/?$/.test(path) && !!doc.querySelector('.widget-episodeBody, [class*="EpisodeBody"]');
    return /^\/n\d+[a-z]+\/(?:\d+\/?)?$/i.test(path) && !!doc.querySelector('.js-novel-text, #novel_honbun, .p-novel__text');
  }
  globalThis.NovelFilterSites = Object.freeze({ findCards, currentWork, isEpisode });
})();
