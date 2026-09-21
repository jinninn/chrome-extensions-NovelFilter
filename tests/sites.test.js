import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import '../src/core.js';
import '../src/sites.js';
const sites = globalThis.NovelFilterSites;
const doc = html => parseHTML(`<html><body>${html}</body></html>`).document;
test('Kakuyomu reader extracts author from metadata tied to its work title', () => {
  const document = doc('<meta property="og:title" content="第1話 - 作品（上巻）（作者（別名）） - カクヨム"><h1><a href="/works/123" title="作品（上巻）">作品（上巻）</a></h1><a href="/users/reviewer">レビュアー</a>');
  assert.equal(sites.currentWork(document, 'https://kakuyomu.jp/works/123/episodes/456').author, '作者（別名）');
  document.querySelector('meta').setAttribute('content', '別の作品（別の作者） - カクヨム');
  assert.equal(sites.currentWork(document, 'https://kakuyomu.jp/works/123/episodes/456').author, '');
});
test('Kakuyomu author box is preferred over unrelated user links', () => {
  const document = doc('<a href="/users/reviewer">レビュアー</a><h1><a href="/works/123">作品</a></h1><div class="WorkAuthorBox_workAuthorBox__abc"><a href="/users/author">作者A</a></div>');
  assert.equal(sites.currentWork(document, 'https://kakuyomu.jp/works/123').author, '作者A');
});
test('Narou linked and unlinked pen names are captured without the author label', () => {
  for (const markup of ['<div class="p-novel__author">作者：<a href="https://mypage.syosetu.com/1/">作者A</a></div>', '<div class="novel_writername">作者： 作者A</div>']) {
    assert.equal(sites.currentWork(doc(markup), 'https://ncode.syosetu.com/n1234ab/1/').author, '作者A');
  }
});
test('Kakuyomu reader takes the matching work heading, not the close icon or episode title', () => {
  const document = doc(`<a href="/works/123"><svg><title>閉じる</title></svg></a>
    <h1><a href="/works/999" title="別の作品">別の作品</a></h1>
    <h1 class="js-vertical-composition-item"><a href="/works/123" title="作品の正式タイトル" itemprop="item"><span itemprop="name">作品の正式タイトル</span></a></h1>
    <h2 title="第1話"><span itemprop="name">第1話</span></h2>`);
  assert.equal(sites.currentWork(document, 'https://kakuyomu.jp/works/123/episodes/456').title, '作品の正式タイトル');
});
test('title fallback ignores an unlabelled close link when the heading is missing', () => {
  const document = doc('<meta property="og:title" content="作品のメタタイトル"><a href="/works/123"><svg><title>閉じる</title></svg></a>');
  assert.equal(sites.currentWork(document, 'https://kakuyomu.jp/works/123').title, '作品のメタタイトル');
});
test('current Kakuyomu ranking and search structures identify the whole card', () => {
  const document = doc(`<ol><li class="Rankings_item__abc"><div class="NewBox_borderSize-bb-m__abc"><ul><li><a href="/works/123">キャッチコピー</a></li></ul><h3><a href="/works/123" title="作品A">作品A</a></h3><a href="/users/a">作者A</a></div></li></ol><div class="NewBox_box__abc NewBox_borderSize-bb-m__abc"><h3><a href="/works/456">作品B</a></h3></div>`);
  const cards = sites.findCards(document, 'https://kakuyomu.jp/search?q=x');
  assert.equal(cards.length, 2); assert.equal(cards[0].element.className, 'Rankings_item__abc');
  assert.equal(cards[0].work.title, '作品A'); assert.equal(cards[0].work.author, '作者A');
});
test('Narou search hides the card, not only its title, and supports current ranking', () => {
  const document = doc(`<div class="searchkekka_box"><div class="novel_h"><a href="https://ncode.syosetu.com/n1234ab/">作品A</a></div><p>あらすじ</p><a href="https://mypage.syosetu.com/123/">作者A</a></div><div class="p-ranklist-item"><div class="p-ranklist-item__title"><a href="https://ncode.syosetu.com/n5678ab/">作品B</a></div></div>`);
  const cards = sites.findCards(document, 'https://yomou.syosetu.com/search.php');
  assert.equal(cards.length, 2); assert.equal(cards[0].element.className, 'searchkekka_box');
  assert.equal(cards[0].work.author, '作者A');
});
test('multiple-work wrappers, navigation and the current work are never hidden', () => {
  const document = doc(`<nav><li><a href="/works/111">navigation</a></li></nav><div class="widget-work"><a href="/works/222">A</a><a href="/works/333">B</a></div><article><a href="/works/444">Current work</a></article><article><a href="/works/555/episodes/666">episode</a></article>`);
  assert.equal(sites.findCards(document, 'https://kakuyomu.jp/works/444').length, 0);
});
test('episode registration distinguishes short story body, index and information page', () => {
  assert.equal(sites.isEpisode(doc('<div class="p-novel__text">本文</div>'), 'https://ncode.syosetu.com/n1234ab/'), true);
  assert.equal(sites.isEpisode(doc('<div class="p-eplist">目次</div>'), 'https://ncode.syosetu.com/n1234ab/'), false);
  assert.equal(sites.isEpisode(doc('<div class="p-novel__text">あらすじ</div>'), 'https://ncode.syosetu.com/novelview/infotop/ncode/n1234ab/'), false);
  assert.equal(sites.isEpisode(doc('<div class="widget-episodeBody">本文</div>'), 'https://kakuyomu.jp/works/123/episodes/456'), true);
  assert.equal(sites.isEpisode(doc('Loading'), 'https://kakuyomu.jp/works/123/episodes/456'), false);
});
