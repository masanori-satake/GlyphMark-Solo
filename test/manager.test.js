'use strict';

// Regression tests for the assignment form (media/manager.js): host errors
// from a failed save must not linger on screen once they no longer apply.
// manager.js is a webview script (acquireVsCodeApi + DOM), so it is loaded
// in a vm context with a minimal fake DOM instead of a real browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MANAGER_PATH = path.resolve(__dirname, '..', 'media', 'manager.js');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this._text = '';
    this._listeners = {};
    this._id = '';
    this.className = '';
    this.value = '';
  }

  get id() {
    return this._id;
  }

  set id(v) {
    this._id = v;
    if (v) this._doc._byId[v] = this;
  }

  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this._text = String(v ?? '');
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }

  click() {
    for (const fn of this._listeners.click || []) fn({});
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

function loadManager() {
  const posted = [];
  const messageHandlers = [];
  const document = {
    _byId: {},
    createElement: (tag) => {
      const el = new FakeElement(tag);
      el._doc = document;
      return el;
    },
    getElementById: (id) => document._byId[id] || null,
  };
  const app = new FakeElement('main');
  app._doc = document;
  app.id = 'app';
  const ctx = {
    document,
    window: {
      addEventListener: (type, fn) => {
        if (type === 'message') messageHandlers.push(fn);
      },
    },
    acquireVsCodeApi: () => ({ postMessage: (msg) => posted.push(msg) }),
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(MANAGER_PATH, 'utf8'), ctx, { filename: 'manager.js' });
  return {
    posted,
    dispatch: (data) => {
      for (const h of messageHandlers) h({ data });
    },
    byId: (id) => document.getElementById(id),
    findByClass: (root, cls) => {
      if (root.className && root.className.split(' ').includes(cls)) return root;
      for (const c of root.children) {
        const found = findByClass(c, cls);
        if (found) return found;
      }
      return null;
    },
  };

  function findByClass(root, cls) {
    if (root.className && root.className.split(' ').includes(cls)) return root;
    for (const c of root.children) {
      const found = findByClass(c, cls);
      if (found) return found;
    }
    return null;
  }
}

const CATALOG = [
  { id: 'createdRecent', params: [{ key: 'days', kind: 'number', def: 7 }], repeatable: false },
];

function stateMsg(marks) {
  return {
    type: 'state',
    lang: 'en',
    catalog: CATALOG,
    itemNames: { createdRecent: { en: 'Created recently', ja: '最近作成' } },
    palettes: { symbol: ['★'], emoji: ['✨'] },
    paletteStyle: 'symbol',
    marks,
    countsByRaw: marks.map(() => null),
    errors: [],
    notices: [],
    target: 'user',
    hasWorkspace: false,
  };
}

// A saved mark whose number param fails the form's own validation
// (days must be a positive number), so onSave stops at the early return.
const BAD_MARKS = [{ item: 'createdRecent', glyph: '★', days: 0 }];

test('failed save, then client validation fails: stale host error is cleared from the notes box', () => {
  const m = loadManager();
  m.dispatch(stateMsg(BAD_MARKS));
  m.dispatch({ type: 'saveErrors', errors: ['Host: glyph rejected'] });
  const app = m.byId('app');
  assert.ok(m.findByClass(app, 'warn'), 'host error is shown after the failed save');
  assert.equal(m.byId('msg').textContent, 'Could not save — see the notes above.');

  m.findByClass(app, 'save').click(); // onSave: client validation fails (days = 0)

  assert.equal(m.findByClass(app, 'warn'), null, 'stale host error must be gone');
  assert.equal(
    m.byId('msg').textContent,
    'A row with a mark needs a positive number / non-empty text.'
  );
  assert.equal(
    m.posted.filter((p) => p.type === 'save').length,
    0,
    'nothing is sent to the host when validation fails'
  );
});

test('state with changed marks clears errors from the previous save attempt', () => {
  const m = loadManager();
  m.dispatch(stateMsg(BAD_MARKS));
  m.dispatch({ type: 'saveErrors', errors: ['Host: glyph rejected'] });
  assert.ok(m.findByClass(m.byId('app'), 'warn'));

  m.dispatch(stateMsg([])); // saved marks changed: rows are rebuilt

  assert.equal(m.findByClass(m.byId('app'), 'warn'), null);
});

test('state with unchanged marks (e.g. palette-style change) keeps the errors', () => {
  const m = loadManager();
  m.dispatch(stateMsg(BAD_MARKS));
  m.dispatch({ type: 'saveErrors', errors: ['Host: glyph rejected'] });
  assert.ok(m.findByClass(m.byId('app'), 'warn'));

  m.dispatch(stateMsg(BAD_MARKS)); // same marks: still the last save attempt

  assert.ok(m.findByClass(m.byId('app'), 'warn'), 'errors still describe the last save');
});
