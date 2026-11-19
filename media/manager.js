'use strict';

// GlyphMark mark-assignment form.
// One screen: the catalog of items as a list; each row may carry one glyph.
// Rows without a glyph do nothing. Saving writes glyphMark.marks.

const vscode = acquireVsCodeApi();

const STR = {
  en: {
    title: 'Mark assignments',
    intro: 'Pick a mark for an item and matching files and folders get that mark in the Explorer. Items without a mark do nothing. When several items match, the topmost row wins — drag rows by the handle to change the priority.',
    dragHint: 'Drag to change priority',
    saveTo: 'Save to',
    user: 'User settings',
    workspace: 'Workspace settings',
    save: 'Save',
    saved: 'Saved',
    saveFailed: 'Could not save — see the notes above.',
    none: 'None',
    styleSymbol: 'Symbols',
    styleEmoji: 'Emoji',
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
    intro: '項目にマークを選ぶと、該当するファイルとフォルダにそのマークが付きます。マークのない項目は何もしません。複数該当した場合は一番上の行のマークが付きます。左端のつまみをドラッグすると優先順位を変えられます。',
    dragHint: 'ドラッグで優先順位を変更',
    saveTo: '保存先',
    user: 'ユーザー設定',
    workspace: 'ワークスペース設定',
    save: '保存',
    saved: '保存しました',
    saveFailed: '保存できませんでした。上の注意を確認してください。',
    none: 'なし',
    styleSymbol: 'シンボル',
    styleEmoji: '絵文字',
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
let saveErrors = []; // validation errors the host returned for the last save
let rows = []; // working copy: { item, glyph, params: {key: value}, count }
let openPaletteFor = -1;
let paletteStyle = 'symbol'; // which picker palette is shown: 'symbol' | 'emoji'
let listEl = null; // current .list element, for drag & drop reordering

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
  const catalogById = new Map(S.catalog.map((c) => [c.id, c]));
  // Assigned rows first, in saved order: the saved order is the priority order.
  (S.marks || []).forEach((entry, i) => {
    const item = catalogById.get(entry.item);
    if (!item) return;
    const params = {};
    for (const p of item.params) params[p.key] = entry[p.key] !== undefined ? entry[p.key] : p.def;
    rows.push({ item: item.id, glyph: entry.glyph || '', params, count: (S.countsByRaw || [])[i] });
  });
  // Then catalog items with no assignment yet, in catalog order.
  const assigned = new Set(rows.map((r) => r.item));
  for (const item of S.catalog) {
    if (assigned.has(item.id)) continue;
    const params = {};
    for (const p of item.params) params[p.key] = p.def;
    rows.push({ item: item.id, glyph: '', params, count: null });
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

  const notes = [...(S.errors || []), ...(S.notices || []), ...saveErrors];
  if (notes.length) {
    const warn = el('div', 'warn');
    warn.appendChild(el('strong', null, str.warnings));
    const ul = el('ul');
    for (const e of notes) ul.appendChild(el('li', null, String(e)));
    warn.appendChild(ul);
    app.appendChild(warn);
  }

  const list = el('div', 'list');
  listEl = list;
  list.addEventListener('dragover', (e) => {
    const dragging = list.querySelector('.row.dragging');
    if (!dragging) return;
    e.preventDefault();
    const after = [...list.querySelectorAll('.row:not(.dragging)')].find(
      (ch) => e.clientY <= ch.getBoundingClientRect().top + ch.offsetHeight / 2
    );
    if (after) list.insertBefore(dragging, after);
    else list.appendChild(dragging);
  });
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
  wrap._row = row;

  const grip = el('span', 'grip', '⠿');
  grip.title = str.dragHint;
  grip.addEventListener('mousedown', () => {
    wrap.draggable = true;
  });
  wrap.addEventListener('dragstart', (e) => {
    openPaletteFor = -1;
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.item);
  });
  wrap.addEventListener('dragend', () => {
    wrap.draggable = false;
    wrap.classList.remove('dragging');
    if (listEl) rows = [...listEl.children].filter((ch) => ch._row).map((ch) => ch._row);
    render();
  });
  wrap.appendChild(grip);

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
  const styles = el('div', 'palStyles');
  for (const style of ['symbol', 'emoji']) {
    const label = style === 'symbol' ? str.styleSymbol : str.styleEmoji;
    const b = el('button', 'palStyle' + (paletteStyle === style ? ' sel' : ''), label);
    b.addEventListener('click', () => {
      paletteStyle = style;
      vscode.postMessage({ type: 'paletteStyle', style });
      render();
    });
    styles.appendChild(b);
  }
  pal.appendChild(styles);
  const noneBtn = el('button', 'pal none', str.none);
  noneBtn.addEventListener('click', () => {
    row.glyph = '';
    openPaletteFor = -1;
    render();
  });
  pal.appendChild(noneBtn);
  const glyphs = (S.palettes && S.palettes[paletteStyle]) || S.palette || [];
  for (const g of glyphs) {
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
  saveErrors = [];
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
  if (data && data.type === 'saveErrors') {
    // The host re-validated the save and rejected it: show its errors in
    // the notes box and mark the save as failed (onSave already showed
    // "Saved" optimistically, so override it after the re-render).
    saveErrors = Array.isArray(data.errors) ? data.errors : [];
    render();
    const msg = document.getElementById('msg');
    if (msg) msg.textContent = t().saveFailed;
    return;
  }
  if (data && data.type === 'state') {
    // A palette-style change also pushes fresh state; when the marks are
    // unchanged, keep the working rows so unsaved edits are not lost.
    const sameMarks = S && JSON.stringify(data.marks || []) === JSON.stringify(S.marks || []);
    S = data;
    if (S.palettes && S.palettes[S.paletteStyle]) paletteStyle = S.paletteStyle;
    if (!sameMarks) buildRows();
    render();
  }
});

vscode.postMessage({ type: 'ready' });
