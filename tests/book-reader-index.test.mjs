import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBookPageIndex} from '../apps/web/src/bookReader/pages.js';
const settle = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  const counts = [2, 5, 1], requests = [], measures = [], notices = [];
  const index = createBookPageIndex({
    load: async (start, signal) => {
      requests.push({start, signal});
      return {total: 3, next: 3, items: counts.slice(start).map((n, i) => ({chapter: start + i, html: String(n)}))};
    },
    measure: (html, geometry) => {measures.push(html); return Number(html) * geometry;},
    changed: () => notices.push('ready'), frame: async () => {},
  });
  return {index, requests, measures, notices};
}
test('whole-book pages sum preceding chapters; reading starts before background counting finishes', async () => {
  const h = harness();
  h.index.refresh('phone', 3, 1, 5, 1);
  assert.equal(h.index.position(1, 2), null, 'Do not show an invented whole-book total');
  await settle();
  assert.deepEqual(plain(h.index.position(1, 2)), {page: 5, total: 8});
  assert.deepEqual(plain(h.index.position(0, 0)), {page: 1, total: 8});
  assert.deepEqual(plain(h.index.position(2, 0)), {page: 8, total: 8});
  assert.deepEqual(h.measures, ['2', '1'], 'Use the actual current chapter measurement');
  h.index.refresh('phone', 3, 2, 1, 1);
  assert.equal(h.requests.length, 1, 'Page and TOC turns do not recount the entire book');
  h.index.refresh('large-font', 3, 1, 10, 2);
  await settle();
  assert.deepEqual(plain(h.index.position(1, 2)), {page: 7, total: 16});
  h.index.refresh('phone', 3, 0, 2, 1);
  assert.deepEqual(plain(h.index.position(0, 1)), {page: 2, total: 8});
  assert.equal(h.requests.length, 2, 'Closing panels can reuse the earlier screen geometry');
  h.index.invalidate(); h.index.refresh('phone', 3, 0, 2, 1); await settle();
  assert.equal(h.requests.length, 3, 'Font loading invalidates even identical CSS metrics');
});
test('resize and close abort stale requests and cannot publish old totals', async () => {
  const pending = [], measures = [], notices = [];
  const index = createBookPageIndex({load: (start, signal) => new Promise(resolve => pending.push({resolve, signal})),
    measure: (html, geometry) => {measures.push(html); return geometry;}, changed: () => notices.push(1), frame: async () => {}});
  index.refresh('a', 2, 0, 1, 1);
  index.refresh('b', 2, 0, 2, 2);
  assert(pending[0].signal.aborted);
  const batch = {total: 2, next: 2, items: [{chapter: 1, html: 'text'}]};
  pending[0].resolve(batch); await settle();
  assert.equal(measures.length, 0); assert.equal(index.position(0, 0), null);
  pending[1].resolve(batch); await settle();
  assert.deepEqual(plain(index.position(1, 1)), {page: 4, total: 4});
  index.refresh('c', 2, 0, 3, 3); index.close();
  assert(pending[2].signal.aborted);
  pending[2].resolve(batch); await settle();
  assert.equal(measures.length, 1); assert.equal(notices.length, 1);
  assert.equal(index.position(0, 0), null);
});
test('offline or malformed batch leaves reading usable, then retries on connection recovery', async () => {
  let failure = true;
  const index = createBookPageIndex({load: async () => {
    if (failure) throw Error('offline');
    return {total: 2, next: 2, items: [{chapter: 1, html: ''}]};
  }, measure: () => 1, changed() {}, frame: async () => {}});
  index.refresh('a', 2, 0, 1, 1); await settle();
  assert(index.error); assert.equal(index.position(0, 0), null);
  failure = false; index.refresh('a', 2, 0, 1, 1, true); await settle();
  assert(!index.error); assert.deepEqual(plain(index.position(1, 0)), {page: 2, total: 2});
  const malformed = createBookPageIndex({load: async () => ({total: 2, next: 0, items: []}),
    measure() {throw Error('not reached');}, changed() {}, frame: async () => {}});
  malformed.refresh('a', 2, 0, 1, 1); await settle();
  assert(malformed.error);
});
