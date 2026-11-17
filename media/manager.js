'use strict';

// GlyphMark mark-assignment form.
// One screen: the catalog of items as a list; each row may carry one glyph.
// Rows without a glyph do nothing. Saving writes glyphMark.marks.

const vscode = acquireVsCodeApi();

const STR = {
  en: {
    title: 'Mark assignments',
    intro: 'Pick a mark for an item and matching files and folders get that mark in the Explorer. Items without a mark do nothing.',
    saveTo: 'Save to',
    user: 'User settings',
    workspace: 'Workspace settings',
    save: 'Save',
    saved: 'Saved',
    none: 'None',
    custom: 'Custom',
    apply: 'Use',
    addRow: 'Add another row',
    remove: 'Remove row',
    matches: (n) => `${n} match${n === 1 ? '' : 'es'}`,
    days: 'days',
    minCount: 'at least',
    times: 'times',
    kb: 'KB or more',
    textPh: 'text',
    authorPh: 'name or email',
    glyphBad: 'Mark must be 1-2 characters.',
    paramBad: 'A row with a mark needs a positive number / non-empty text.',
    warnings: 'Notes on the current settings',
  },
  ja: {
    title: 'マーク割り当て',
    intro: '項目にマークを選ぶと、該当するファイルとフォルダにそのマークが付きます。マークのない項目は何もしません。',
    saveTo: '保存先',
    user: 'ユーザー設定',
    workspace: 'ワークスペース設定',
    save: '保存',
    saved: '保存しました',
    none: 'なし',
    custom: '任意',
    apply: '使う',
    addRow: '行を追加',
    remove: '行を削除',
    matches: (n) => `${n} 件`,
    days: '日以内',
    minCount: '回以上',
    times: '回',
    kb: 'KB 以上',
    textPh: '文字列',
    authorPh: '名前またはメール',
    glyphBad: 'マークは1〜2文字にしてください。',
    paramBad: 'マークのある行には、正の数値／空でない文字列が必要です。',
    warnings: '現在の設定についての注意',
  },
};

let S = null; // last state from the extension
let rows = []; // working copy: { item, glyph, params: {key: value}, count }
let openPaletteFor = -1;

function t() {
  return STR[S && S.lang === 'ja' ? 'ja' : 'en'];
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildRows() {
  rows = [];
  const byItem = new Map();
  (S.marks || []).forEach((m, i) => {
    if (!byItem.has(m.item)) byItem.set(m.item, []);
    byItem.get(m.item).push({ entry: m, count: (S.countsByRaw || [])[i] });
  });
  for (const item of S.catalog) {
    const stored = byItem.get(item.id) || [];
    if (stored.length) {
      for (const { entry, count } of stored) {
        const params = {};
        for (const p of item.params) params[p.key] = entry[p.key] !== undefined ? entry[p.key] : p.def;
        rows.push({ item: item.id, glyph: entry.glyph || '', params, count });
      }
    } else {
      const params = {};
      for (const p of item.params) params[p.key] = p.def;
      rows.push({ item: item.id, glyph: '', params, count: null });
    }
  }
}

function paramLabel(item, p) {
  const str = t();
  if (p.key === 'days') return str.days;
  if (p.key === 'minCount') return str.minCount;
  if (p.key === 'kb') return str.kb;
  return '';
}

function render() {
  const str = t();
  const app = document.getElementById('app');
  app.textContent = '';

  const head = el('header', 'head');
  head.appendChild(el('h1', null, str.title));
  const targetWrap = el('label', 'target');
  targetWrap.appendChild(el('span', null, str.saveTo));
  const sel = el('select', 'targetSel');
  sel.id = 'targetSel';
  const optU = el('option', null, str.user);
  optU.value = 'user';
  sel.appendChild(optU);
  if (S.hasWorkspace) {
    const optW = el('option', null, str.workspace);
    optW.value = 'workspace';
    sel.appendChild(optW);
  }
  sel.value = S.target || 'user';
  targetWrap.appendChild(sel);
  head.appendChild(targetWrap);
  app.appendChild(head);
  app.appendChild(el('p', 'intro', str.intro));

  if (S.errors && S.errors.length) {
    const warn = el('div', 'warn');
    warn.appendChild(el('strong', null, str.warnings));
    const ul = el('ul');
    for (const e of S.errors) ul.appendChild(el('li', null, String(e)));
    warn.appendChild(ul);
    app.appendChild(warn);
  }

  const list = el('div', 'list');
  rows.forEach((row, idx) => list.appendChild(renderRow(row, idx)));
  app.appendChild(list);

  const foot = el('footer', 'foot');
  const saveBtn = el('button', 'save', str.save);
  saveBtn.addEventListener('click', onSave);
  foot.appendChild(saveBtn);
  const msg = el('span', 'msg');
  msg.id = 'msg';
  foot.appendChild(msg);
  app.appendChild(foot);
}

function renderRow(row, idx) {
  const str = t();
  const item = S.catalog.find((c) => c.id === row.item);
  const names = S.itemNames[row.item] || {};
  const wrap = el('div', 'row');

  const glyphBtn = el('button', 'glyph' + (row.glyph ? '' : ' empty'), row.glyph || '＋');
  glyphBtn.title = row.glyph || str.none;
  glyphBtn.addEventListener('click', () => {
    openPaletteFor = openPaletteFor === idx ? -1 : idx;
    render();
  });
  wrap.appendChild(glyphBtn);

  const main = el('div', 'main');
  main.appendChild(el('div', 'itemName', names[S.lang === 'ja' ? 'ja' : 'en'] || row.item));
  const params = el('div', 'params');
  for (const p of item.params) {
    if (p.kind === 'number') {
      const input = el('input', 'num');
      input.type = 'number';
      input.min = '1';
      input.value = row.params[p.key];
      input.addEventListener('change', () => {
        row.params[p.key] = Number(input.value);
      });
      params.appendChild(input);
      params.appendChild(el('span', 'unit', paramLabel(item, p)));
    } else {
      const input = el('input', 'text');
      input.type = 'text';
      input.value = row.params[p.key];
      input.placeholder = row.item === 'lastAuthorNamed' ? str.authorPh : str.textPh;
      input.addEventListener('change', () => {
        row.params[p.key] = input.value;
      });
      params.appendChild(input);
    }
  }
  main.appendChild(params);
  wrap.appendChild(main);

  if (typeof row.count === 'number') {
    wrap.appendChild(el('span', 'count', str.matches(row.count)));
  }

  const tools = el('div', 'tools');
  if (item.repeatable) {
    const add = el('button', 'tool', '＋');
    add.title = str.addRow;
    add.addEventListener('click', () => {
      const params = {};
      for (const p of item.params) params[p.key] = p.def;
      rows.splice(idx + 1, 0, { item: row.item, glyph: '', params, count: null });
      render();
    });
    tools.appendChild(add);
  }
  const del = el('button', 'tool', '✕');
  del.title = str.remove;
  del.addEventListener('click', () => {
    rows.splice(idx, 1);
    if (openPaletteFor === idx) openPaletteFor = -1;
    render();
  });
  tools.appendChild(del);
  wrap.appendChild(tools);

  if (openPaletteFor === idx) wrap.appendChild(renderPalette(row));
  return wrap;
}

function renderPalette(row) {
  const str = t();
  const pal = el('div', 'palette');
  const noneBtn = el('button', 'pal none', str.none);
  noneBtn.addEventListener('click', () => {
    row.glyph = '';
    openPaletteFor = -1;
    render();
  });
  pal.appendChild(noneBtn);
  for (const g of S.palette) {
    const b = el('button', 'pal' + (row.glyph === g ? ' sel' : ''), g);
    b.addEventListener('click', () => {
      row.glyph = g;
      openPaletteFor = -1;
      render();
    });
    pal.appendChild(b);
  }
  const custom = el('span', 'custom');
  const input = el('input', 'customIn');
  input.maxLength = 4;
  input.placeholder = str.custom;
  const use = el('button', 'pal use', str.apply);
  use.addEventListener('click', () => {
    const v = input.value.trim();
    if (v.length === 1 || v.length === 2) {
      row.glyph = v;
      openPaletteFor = -1;
      render();
    } else {
      input.focus();
    }
  });
  custom.appendChild(input);
  custom.appendChild(use);
  pal.appendChild(custom);
  return pal;
}

function onSave() {
  const str = t();
  const msg = document.getElementById('msg');
  const out = [];
  for (const row of rows) {
    if (!row.glyph) continue;
    if (!(row.glyph.length === 1 || row.glyph.length === 2)) {
      msg.textContent = str.glyphBad;
      return;
    }
    const item = S.catalog.find((c) => c.id === row.item);
    const entry = { item: row.item, glyph: row.glyph };
    for (const p of item.params) {
      const v = row.params[p.key];
      if (p.kind === 'number') {
        if (!Number.isFinite(Number(v)) || Number(v) <= 0) {
          msg.textContent = str.paramBad;
          return;
        }
        entry[p.key] = Number(v);
      } else {
        if (!String(v).trim()) {
          msg.textContent = str.paramBad;
          return;
        }
        entry[p.key] = String(v);
      }
    }
    out.push(entry);
  }
  const targetSel = document.getElementById('targetSel');
  vscode.postMessage({ type: 'save', marks: out, target: targetSel ? targetSel.value : 'user' });
  msg.textContent = str.saved;
}

window.addEventListener('message', (ev) => {
  const data = ev.data;
  if (data && data.type === 'state') {
    S = data;
    buildRows();
    render();
  }
});

vscode.postMessage({ type: 'ready' });
