'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core');

const NOW = 1_800_000_000_000; // fixed "now" for tests
const DAY = core.DAY_MS;

function logText(commits) {
  // commits: [{ atSec, name, email, files: [] }] newest first
  return commits
    .map((c) => `\x1e${c.atSec}\x1f${c.name}\x1f${c.email}\n\n${c.files.join('\n')}\n`)
    .join('');
}

test('glyphOk accepts 1-2 char glyphs only', () => {
  assert.equal(core.glyphOk('✨'), true);
  assert.equal(core.glyphOk('🔥'), true); // surrogate pair, length 2
  assert.equal(core.glyphOk('N'), true);
  assert.equal(core.glyphOk('NEW'), false);
  assert.equal(core.glyphOk('[New]'), false);
  assert.equal(core.glyphOk(''), false);
  assert.equal(core.glyphOk(5), false);
});

test('every palette glyph is badge-legal', () => {
  for (const g of core.PALETTE) assert.equal(core.glyphOk(g), true, g);
});

test('palettes: symbol is the default; every palette is badge-legal and unique', () => {
  assert.equal(core.DEFAULT_PALETTE_STYLE, 'symbol');
  assert.deepEqual(core.PALETTE, core.PALETTES.symbol);
  assert.deepEqual(new Set(core.PALETTE_STYLES), new Set(['symbol', 'emoji']));
  for (const style of core.PALETTE_STYLES) {
    const glyphs = core.PALETTES[style];
    assert.equal(glyphs.length, 20, style);
    assert.equal(new Set(glyphs).size, glyphs.length, style);
    for (const g of glyphs) assert.equal(core.glyphOk(g), true, `${style}: ${g}`);
  }
});

test('parseGitLog aggregates first/last/times/author per file', () => {
  const text = logText([
    { atSec: 1800000000 - 100, name: 'Aki', email: 'aki@x', files: ['src/a.js', 'src/b.js'] },
    { atSec: 1800000000 - 90000, name: 'Bo', email: 'bo@x', files: ['src/a.js'] },
    { atSec: 1800000000 - 200000, name: 'Aki', email: 'aki@x', files: ['src/a.js', 'README.md'] },
  ]);
  const stats = core.parseGitLog(text);
  const a = stats.get('src/a.js');
  assert.equal(a.lastAt, (1800000000 - 100) * 1000);
  assert.equal(a.firstAt, (1800000000 - 200000) * 1000);
  assert.equal(a.times.length, 3);
  assert.equal(a.lastAuthorName, 'Aki'); // newest commit wins
  const b = stats.get('src/b.js');
  assert.equal(b.times.length, 1);
  assert.equal(stats.get('README.md').lastAuthorName, 'Aki');
});

test('parseGitLog tolerates empty and malformed input', () => {
  assert.equal(core.parseGitLog('').size, 0);
  assert.equal(core.parseGitLog('\x1enotanumber\x1fx\x1fy\n\nz.js\n').size, 0);
});

test('validateMarks normalizes, keeps list order as priority, reports errors', () => {
  const { marks, errors } = core.validateMarks([
    { item: 'pathContains', glyph: '📌', text: 'docs/' },
    { item: 'createdRecent', glyph: '✨' },
    { item: 'nope', glyph: 'x' },
    { item: 'updatedRecent', glyph: 'TOOLONG' },
    { item: 'sizeLarge', glyph: '🐘', kb: -3 },
    { item: 'nameContains', glyph: 'a', text: '  ' },
  ]);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].item, 'pathContains'); // list order is kept: it is the priority order
  assert.equal(marks[1].item, 'createdRecent');
  assert.equal(marks[1].days, 30); // default filled
  assert.equal(errors.length, 4);
});

test('validateMarks handles non-array input', () => {
  const { marks, errors } = core.validateMarks('junk');
  assert.equal(marks.length, 0);
  assert.equal(errors.length, 1);
  assert.deepEqual(core.validateMarks(undefined), { marks: [], errors: [] });
});

function ctxFor(over) {
  return Object.assign(
    { relPath: 'src/a.js', name: 'a.js', sizeBytes: 100, stats: null, mtimeMs: null, me: null },
    over
  );
}

test('createdRecent / updatedRecent use git stats', () => {
  const stats = { firstAt: NOW - 5 * DAY, lastAt: NOW - 5 * DAY, times: [NOW - 5 * DAY], lastAuthorName: 'Aki', lastAuthorEmail: 'aki@x' };
  const ctx = ctxFor({ stats });
  assert.equal(core.matchMark({ item: 'createdRecent', glyph: '✨', days: 30 }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'createdRecent', glyph: '✨', days: 3 }, ctx, NOW), false);
  assert.equal(core.matchMark({ item: 'updatedRecent', glyph: '✨', days: 7 }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'untouchedLong', glyph: '🧊', days: 365 }, ctx, NOW), false);
});

test('updatedRecent falls back to mtime without git; createdRecent does not', () => {
  const ctx = ctxFor({ stats: null, mtimeMs: NOW - 2 * DAY });
  assert.equal(core.matchMark({ item: 'updatedRecent', glyph: '✨', days: 7 }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'createdRecent', glyph: '✨', days: 30 }, ctx, NOW), false);
  assert.equal(core.matchMark({ item: 'untouchedLong', glyph: '🧊', days: 1 }, ctx, NOW), true);
});

test('updatedFrequently counts commits inside the window', () => {
  const times = [NOW - 1 * DAY, NOW - 2 * DAY, NOW - 40 * DAY];
  const stats = { firstAt: NOW - 40 * DAY, lastAt: NOW - 1 * DAY, times, lastAuthorName: 'A', lastAuthorEmail: 'a@x' };
  const ctx = ctxFor({ stats });
  assert.equal(core.matchMark({ item: 'updatedFrequently', glyph: '🔥', days: 90, minCount: 3 }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'updatedFrequently', glyph: '🔥', days: 7, minCount: 3 }, ctx, NOW), false);
});

test('lastAuthorMe matches name or email; lastAuthorNamed matches substring', () => {
  const stats = { firstAt: NOW, lastAt: NOW, times: [NOW], lastAuthorName: 'Aki Sato', lastAuthorEmail: 'aki@example.com' };
  const ctx = ctxFor({ stats, me: { name: 'aki sato', email: '' } });
  assert.equal(core.matchMark({ item: 'lastAuthorMe', glyph: '✋' }, ctx, NOW), true);
  const ctx2 = ctxFor({ stats, me: { name: 'Other', email: 'AKI@example.com' } });
  assert.equal(core.matchMark({ item: 'lastAuthorMe', glyph: '✋' }, ctx2, NOW), true);
  const ctx3 = ctxFor({ stats, me: { name: 'Other', email: 'o@x' } });
  assert.equal(core.matchMark({ item: 'lastAuthorMe', glyph: '✋' }, ctx3, NOW), false);
  assert.equal(core.matchMark({ item: 'lastAuthorNamed', glyph: '👀', text: 'aki' }, ctx3, NOW), true);
  assert.equal(core.matchMark({ item: 'lastAuthorNamed', glyph: '👀', text: 'bo' }, ctx3, NOW), false);
});

test('nameContains / pathContains / sizeLarge', () => {
  const ctx = ctxFor({ relPath: 'docs/guide.md', name: 'guide.md', sizeBytes: 2048 * 1024 });
  assert.equal(core.matchMark({ item: 'nameContains', glyph: 'a', text: 'guide' }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'nameContains', glyph: 'a', text: 'spec' }, ctx, NOW), false);
  assert.equal(core.matchMark({ item: 'pathContains', glyph: 'a', text: 'docs/' }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'sizeLarge', glyph: '🐘', kb: 1024 }, ctx, NOW), true);
  assert.equal(core.matchMark({ item: 'sizeLarge', glyph: '🐘', kb: 4096 }, ctx, NOW), false);
});

test('evaluate returns matches in mark order; tooltip lists all with evidence', () => {
  const stats = { firstAt: NOW - 5 * DAY, lastAt: NOW - 5 * DAY, times: [NOW - 5 * DAY], lastAuthorName: 'Aki', lastAuthorEmail: 'aki@x' };
  const ctx = ctxFor({ stats });
  const marks = [
    { item: 'createdRecent', glyph: '✨', days: 30 },
    { item: 'pathContains', glyph: '📌', text: 'src/' },
  ];
  const matched = core.evaluate(ctx, marks, NOW);
  assert.equal(matched.length, 2);
  const tip = core.tooltipFor(matched, ctx, NOW, 'en');
  assert.match(tip, /✨ Created recently — created 5d ago/);
  assert.match(tip, /📌 Path contains text — src\//);
  const tipJa = core.tooltipFor(matched, ctx, NOW, 'ja');
  assert.match(tipJa, /新しく作られた — 作成 5日前/);
});

test('aggregateFolders picks highest-priority mark and counts per folder', () => {
  const mNew = { item: 'createdRecent', glyph: '✨', days: 30 };
  const mPin = { item: 'pathContains', glyph: '📌', text: 'docs/' };
  const marks = [mNew, mPin];
  const fileMatches = new Map([
    ['docs/a.md', [mPin]],
    ['docs/deep/b.md', [mNew, mPin]],
    ['src/c.js', [mNew]],
  ]);
  const folders = core.aggregateFolders(fileMatches, marks);
  const docs = folders.get('docs');
  assert.equal(docs.mark, mNew); // createdRecent outranks pathContains
  assert.equal(docs.count, 1);
  assert.deepEqual(
    docs.all.map((x) => [x.mark.glyph, x.count]),
    [['✨', 1], ['📌', 2]]
  );
  assert.equal(folders.get('docs/deep').mark, mNew);
  assert.equal(folders.get('src').count, 1);
  const tip = core.folderTooltip(docs, 'ja');
  assert.match(tip, /配下に 2 件/);
});
