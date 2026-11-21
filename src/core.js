'use strict';

// GlyphMark-Solo core logic (no VS Code dependency, unit-testable).
// Model: a fixed catalog of items; each item may carry a user-chosen glyph.
// Only items with a glyph do anything. Priority follows the order of the
// marks list itself: earlier entries win (the form reorders by drag & drop).

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMES_PER_FILE = 1000;

// Numeric params carry an upper bound (max) as well as a positive lower
// bound: an unbounded value breaks the item's meaning (e.g. days so large
// that days * DAY_MS overflows to Infinity and matches every file).
// Bounds: days ≤ 100 years, kb ≤ 1 TB, minCount ≤ 10,000.
const CATALOG = [
  { id: 'createdRecent', repeatable: false, params: [{ key: 'days', kind: 'number', def: 30, max: 36500 }] },
  { id: 'updatedRecent', repeatable: false, params: [{ key: 'days', kind: 'number', def: 7, max: 36500 }] },
  {
    id: 'updatedFrequently',
    repeatable: false,
    params: [
      { key: 'days', kind: 'number', def: 90, max: 36500 },
      { key: 'minCount', kind: 'number', def: 10, max: 10000 },
    ],
  },
  { id: 'untouchedLong', repeatable: false, params: [{ key: 'days', kind: 'number', def: 365, max: 36500 }] },
  { id: 'lastAuthorMe', repeatable: false, params: [] },
  { id: 'lastAuthorNamed', repeatable: true, params: [{ key: 'text', kind: 'text', def: '' }] },
  { id: 'nameContains', repeatable: true, params: [{ key: 'text', kind: 'text', def: '' }] },
  { id: 'pathContains', repeatable: true, params: [{ key: 'text', kind: 'text', def: '' }] },
  { id: 'sizeLarge', repeatable: false, params: [{ key: 'kb', kind: 'number', def: 1024, max: 1048576 }] },
];

const ITEM_NAMES = {
  createdRecent: { en: 'Created recently', ja: '新しく作られた' },
  updatedRecent: { en: 'Updated recently', ja: '最近更新された' },
  updatedFrequently: { en: 'Updated frequently', ja: '頻繁に更新されている' },
  untouchedLong: { en: 'Not updated for a long time', ja: '長く更新されていない' },
  lastAuthorMe: { en: 'Last edited by me', ja: '自分が最後に編集した' },
  lastAuthorNamed: { en: 'Last edited by a named person', ja: '指定した人が最後に編集した' },
  nameContains: { en: 'Name contains text', ja: '名前に文字を含む' },
  pathContains: { en: 'Path contains text', ja: 'パスに文字を含む' },
  sizeLarge: { en: 'Large file', ja: 'サイズが大きい' },
};

// Glyph palettes offered in the picker. Every entry must satisfy glyphOk().
// A badge is a plain string and the editor owns the rendering font, so a
// "font switch" is really a character-set switch: 'symbol' glyphs are
// monochrome characters from ordinary UI fonts and sit quietly next to
// Git's letter badges, while 'emoji' glyphs render in colour.
const PALETTES = {
  symbol: [
    '✦', '★', '☆', '●', '○',
    '▲', '△', '◆', '◇', '■',
    '□', '✚', '✖', '✓', '✔',
    '↻', '♥', '♦', '♠', '♣',
  ],
  emoji: [
    '✨', '⭐', '🔥', '🧊', '🌱',
    '⚠', '👀', '✋', '📌', '📝',
    '🐛', '🔍', '✅', '📦', '🧪',
    '🎨', '🔒', '💡', '🚧', '🏷',
  ],
};
const PALETTE_STYLES = Object.keys(PALETTES);
const DEFAULT_PALETTE_STYLE = 'symbol';
// The default style's glyphs (kept as the classic single-palette export).
const PALETTE = PALETTES[DEFAULT_PALETTE_STYLE];

function catalogItem(id) {
  return CATALOG.find((c) => c.id === id) || null;
}

const MAX_LABEL_LENGTH = 100;
// The marks list and its text params are user/workspace-supplied and are
// re-evaluated against every file on each recalculation, so both are
// capped: an unbounded list makes evaluation files × marks, and an
// unbounded text makes every substring search scan a huge needle.
const MAX_MARKS = 200;
const MAX_TEXT_LENGTH = 200;

// Characters that must never appear in a badge glyph: C0/C1 controls and
// whitespace (a badge is rendered as-is, so these corrupt the Explorer
// display), plus invisible format characters: zero-width spaces and
// joiners, bidi controls, word joiner, BOM, soft hyphen, and variation
// selectors, which would show as a blank or misleading badge.
const GLYPH_FORBIDDEN =
  /[\u0000-\u0020\u007f-\u00a0\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufe00-\ufe0f\ufeff]/;

function glyphOk(g) {
  return (
    typeof g === 'string' &&
    (g.length === 1 || g.length === 2) &&
    !GLYPH_FORBIDDEN.test(g)
  );
}

// Parse the output of:
//   git log --pretty=format:%x1e%at%x1f%an%x1f%ae --name-only
// Returns a Map: posix relPath -> { firstAt, lastAt, times[], lastAuthorName, lastAuthorEmail }
// git log is newest-first, so the first sighting of a file is its latest commit.
function parseGitLog(text) {
  const stats = new Map();
  if (!text) return stats;
  for (const chunk of text.split('\x1e')) {
    const lines = chunk.split('\n');
    let header = null;
    const files = [];
    for (const line of lines) {
      if (header === null) {
        const t = line.trim();
        if (!t) continue;
        const parts = t.split('\x1f');
        if (parts.length < 3 || !/^\d+$/.test(parts[0])) { header = false; break; }
        header = { at: Number(parts[0]) * 1000, name: parts[1] || '', email: parts[2] || '' };
      } else if (line.trim()) {
        files.push(line.trim());
      }
    }
    if (!header) continue;
    for (const rel of files) {
      let s = stats.get(rel);
      if (!s) {
        s = {
          firstAt: header.at,
          lastAt: header.at,
          times: [],
          lastAuthorName: header.name,
          lastAuthorEmail: header.email,
        };
        stats.set(rel, s);
      }
      s.firstAt = Math.min(s.firstAt, header.at);
      if (s.times.length < MAX_TIMES_PER_FILE) s.times.push(header.at);
    }
  }
  return stats;
}

// Validate the raw glyphMark.marks setting. Returns { marks, errors } where
// marks are normalized, kept in list order (the list order is the priority
// order), and errors describe dropped entries.
function validateMarks(raw) {
  const marks = [];
  const errors = [];
  if (raw === undefined || raw === null) return { marks, errors };
  if (!Array.isArray(raw)) {
    errors.push('glyphMark.marks must be an array');
    return { marks, errors };
  }
  let entries = raw;
  if (raw.length > MAX_MARKS) {
    errors.push(`glyphMark.marks must have ${MAX_MARKS} entries or fewer`);
    entries = raw.slice(0, MAX_MARKS);
  }
  entries.forEach((entry, index) => {
    const where = `marks[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    const item = catalogItem(entry.item);
    if (!item) {
      errors.push(`${where}: unknown item "${entry.item}"`);
      return;
    }
    if (!glyphOk(entry.glyph)) {
      errors.push(`${where}: glyph must be 1-2 characters`);
      return;
    }
    const mark = { item: entry.item, glyph: entry.glyph };
    if (typeof entry.label === 'string' && entry.label.trim()) {
      const label = entry.label.trim();
      if (label.length > MAX_LABEL_LENGTH) {
        errors.push(`${where}: label must be ${MAX_LABEL_LENGTH} characters or fewer`);
        return;
      }
      mark.label = label;
    }
    for (const p of item.params) {
      const v = entry[p.key];
      if (p.kind === 'number') {
        const n = v === undefined ? p.def : Number(v);
        if (!Number.isFinite(n) || n <= 0) {
          errors.push(`${where}: ${p.key} must be a positive number`);
          return;
        }
        if (p.max !== undefined && n > p.max) {
          errors.push(`${where}: ${p.key} must be ${p.max} or less`);
          return;
        }
        mark[p.key] = n;
      } else {
        const s = v === undefined ? p.def : String(v);
        if (!s.trim()) {
          errors.push(`${where}: ${p.key} must not be empty`);
          return;
        }
        if (s.length > MAX_TEXT_LENGTH) {
          errors.push(`${where}: ${p.key} must be ${MAX_TEXT_LENGTH} characters or fewer`);
          return;
        }
        mark[p.key] = s;
      }
    }
    marks.push(mark);
  });
  return { marks, errors };
}

function updatedAtOf(ctx) {
  if (ctx.stats) return ctx.stats.lastAt;
  return ctx.mtimeMs || null;
}

function matchMark(mark, ctx, now) {
  const s = ctx.stats;
  switch (mark.item) {
    case 'createdRecent':
      return !!s && now - s.firstAt <= mark.days * DAY_MS && s.firstAt <= now;
    case 'updatedRecent': {
      const t = updatedAtOf(ctx);
      return t !== null && now - t <= mark.days * DAY_MS;
    }
    case 'updatedFrequently': {
      if (!s) return false;
      const from = now - mark.days * DAY_MS;
      let n = 0;
      for (const t of s.times) if (t >= from) n++;
      return n >= mark.minCount;
    }
    case 'untouchedLong': {
      const t = updatedAtOf(ctx);
      return t !== null && now - t > mark.days * DAY_MS;
    }
    case 'lastAuthorMe': {
      if (!s || !ctx.me) return false;
      const meName = (ctx.me.name || '').toLowerCase();
      const meEmail = (ctx.me.email || '').toLowerCase();
      return (
        (meName && s.lastAuthorName.toLowerCase() === meName) ||
        (meEmail && s.lastAuthorEmail.toLowerCase() === meEmail)
      );
    }
    case 'lastAuthorNamed': {
      if (!s) return false;
      const q = mark.text.toLowerCase();
      return (
        s.lastAuthorName.toLowerCase().includes(q) ||
        s.lastAuthorEmail.toLowerCase().includes(q)
      );
    }
    case 'nameContains':
      return ctx.name.includes(mark.text);
    case 'pathContains':
      return ctx.relPath.includes(mark.text);
    case 'sizeLarge':
      return typeof ctx.sizeBytes === 'number' && ctx.sizeBytes >= mark.kb * 1024;
    default:
      return false;
  }
}

function evaluate(ctx, marks, now) {
  return marks.filter((m) => matchMark(m, ctx, now));
}

function daysAgo(ms, now) {
  return Math.max(0, Math.round((now - ms) / DAY_MS));
}

function evidence(mark, ctx, now, lang) {
  const ja = lang === 'ja';
  const s = ctx.stats;
  switch (mark.item) {
    case 'createdRecent':
      return ja ? `作成 ${daysAgo(s.firstAt, now)}日前` : `created ${daysAgo(s.firstAt, now)}d ago`;
    case 'updatedRecent': {
      const t = updatedAtOf(ctx);
      const base = ja ? `更新 ${daysAgo(t, now)}日前` : `updated ${daysAgo(t, now)}d ago`;
      return s ? base : `${base} (${ja ? '更新日時ベース' : 'by file time'})`;
    }
    case 'updatedFrequently': {
      const from = now - mark.days * DAY_MS;
      const n = s.times.filter((t) => t >= from).length;
      return ja ? `直近${mark.days}日で ${n} 回` : `${n} commits in ${mark.days}d`;
    }
    case 'untouchedLong': {
      const t = updatedAtOf(ctx);
      return ja ? `${daysAgo(t, now)}日間更新なし` : `not updated for ${daysAgo(t, now)}d`;
    }
    case 'lastAuthorMe':
    case 'lastAuthorNamed':
      return s.lastAuthorName || s.lastAuthorEmail;
    case 'nameContains':
    case 'pathContains':
      return mark.text;
    case 'sizeLarge':
      return `${Math.round(ctx.sizeBytes / 1024)} KB`;
    default:
      return '';
  }
}

function markTitle(mark, lang) {
  if (mark.label) return mark.label;
  const names = ITEM_NAMES[mark.item];
  return names ? names[lang === 'ja' ? 'ja' : 'en'] : mark.item;
}

function tooltipFor(matches, ctx, now, lang) {
  return matches
    .map((m) => {
      const ev = evidence(m, ctx, now, lang);
      return ev ? `${m.glyph} ${markTitle(m, lang)} — ${ev}` : `${m.glyph} ${markTitle(m, lang)}`;
    })
    .join('\n');
}

// Aggregate file results into folder results.
// fileMatches: Map relPath -> matched marks array (only non-empty entries needed).
// Returns Map relDir -> { mark, count, all: [{ mark, count }] } where mark is the
// highest-priority (earliest in the marks list) mark present below.
function aggregateFolders(fileMatches, marks) {
  const markIndex = new Map(marks.map((m, i) => [m, i]));
  const perDir = new Map();
  for (const [relPath, matched] of fileMatches) {
    const parts = relPath.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/');
      let bucket = perDir.get(dir);
      if (!bucket) {
        bucket = new Map();
        perDir.set(dir, bucket);
      }
      for (const m of matched) bucket.set(m, (bucket.get(m) || 0) + 1);
    }
  }
  const result = new Map();
  for (const [dir, bucket] of perDir) {
    const all = [...bucket.entries()]
      .map(([mark, count]) => ({ mark, count }))
      .sort((a, b) => markIndex.get(a.mark) - markIndex.get(b.mark));
    if (all.length) result.set(dir, { mark: all[0].mark, count: all[0].count, all });
  }
  return result;
}

function folderTooltip(folderResult, lang) {
  const ja = lang === 'ja';
  return folderResult.all
    .map(
      ({ mark, count }) =>
        `${mark.glyph} ${markTitle(mark, lang)} — ${ja ? `配下に ${count} 件` : `${count} inside`}`
    )
    .join('\n');
}

module.exports = {
  DAY_MS,
  MAX_LABEL_LENGTH,
  MAX_MARKS,
  MAX_TEXT_LENGTH,
  CATALOG,
  ITEM_NAMES,
  PALETTE,
  PALETTES,
  PALETTE_STYLES,
  DEFAULT_PALETTE_STYLE,
  catalogItem,
  glyphOk,
  parseGitLog,
  validateMarks,
  matchMark,
  evaluate,
  evidence,
  markTitle,
  tooltipFor,
  aggregateFolders,
  folderTooltip,
};
