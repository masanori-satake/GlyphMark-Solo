'use strict';

const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const core = require('./core');

// Bounds for the per-folder collection. The git log still covers the full
// history (some items, e.g. untouchedLong, need the oldest commits), but a
// single git call may not buffer unbounded output or run unbounded time;
// hitting a bound is surfaced to the user (see gitLogFailed) instead of
// silently dropping the git-based marks.
const GIT_MAX_BUFFER = 32 * 1024 * 1024;
const GIT_TIMEOUT_MS = 60000;
const STAT_BATCH_SIZE = 64;

const LANG = vscode.env.language && vscode.env.language.startsWith('ja') ? 'ja' : 'en';
const STR = {
  en: {
    refreshed: 'GlyphMark: marks recalculated',
    editAssignments: 'Edit Mark Assignments',
    gitLogFailed: (name) =>
      `Git history for "${name}" could not be read (too large or timed out), so git-based marks are off for that folder. File time/size marks still apply.`,
  },
  ja: {
    refreshed: 'GlyphMark: マークを再計算しました',
    editAssignments: 'マーク割り当てを編集',
    gitLogFailed: (name) =>
      `「${name}」の Git 履歴を読めませんでした（大きすぎるか、時間切れ）。このフォルダでは Git 由来のマークは付きません。更新日時・サイズのマークは付きます。`,
  },
}[LANG];

let provider = null;
let state = null; // { marks, errors, folders: Map, decorations: Map<string, vscode.FileDecoration>, counts: number[] }
let managerPanel = null;

function execGitDetailed(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: GIT_MAX_BUFFER, timeout: GIT_TIMEOUT_MS, windowsHide: true },
      (err, stdout) => resolve({ text: err ? null : stdout, err: err || null })
    );
  });
}

async function execGit(args, cwd) {
  return (await execGitDetailed(args, cwd)).text;
}

function posixRel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

class GlyphDecorationProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this._onDidChange.event;
  }
  provideFileDecoration(uri) {
    if (!state) return undefined;
    return state.decorations.get(uri.toString());
  }
  refreshAll() {
    this._onDidChange.fire(undefined);
  }
}

async function collectFolder(folder) {
  const folderPath = folder.uri.fsPath;
  const data = { folder, gitRoot: null, stats: new Map(), me: null, ctxs: [], gitLogFailed: false };

  // Workspace Trust: in Restricted Mode, do not run git inside an
  // untrusted workspace (declared as "limited" support in package.json).
  // File stats are still collected, so time/size/name marks keep working.
  if (vscode.workspace.isTrusted) {
    const top = await execGit(['rev-parse', '--show-toplevel'], folderPath);
    if (top && top.trim()) {
      data.gitRoot = top.trim();
      const [logRes, name, email] = await Promise.all([
        execGitDetailed(['log', '--pretty=format:%x1e%at%x1f%an%x1f%ae', '--name-only'], data.gitRoot),
        execGit(['config', 'user.name'], data.gitRoot),
        execGit(['config', 'user.email'], data.gitRoot),
      ]);
      if (logRes.text) data.stats = core.parseGitLog(logRes.text);
      else data.gitLogFailed = true;
      data.me = { name: (name || '').trim(), email: (email || '').trim() };
    }
  }

  let fileUris = [];
  try {
    fileUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*'),
      '**/node_modules/**',
      20000
    );
  } catch {
    fileUris = [];
  }

  // Stat in bounded parallel batches instead of one await per file, so a
  // large workspace does not pay a full round-trip per file in sequence.
  for (let i = 0; i < fileUris.length; i += STAT_BATCH_SIZE) {
    const batch = fileUris.slice(i, i + STAT_BATCH_SIZE);
    const settled = await Promise.all(
      batch.map(async (uri) => {
        if (uri.scheme !== 'file') return null;
        const relPath = posixRel(folderPath, uri.fsPath);
        if (!relPath || relPath.startsWith('..')) return null;
        let stat = null;
        try {
          stat = await vscode.workspace.fs.stat(uri);
        } catch {
          return null;
        }
        if (stat.type !== vscode.FileType.File) return null;
        let stats = null;
        if (data.gitRoot) {
          const relToGit = posixRel(data.gitRoot, uri.fsPath);
          stats = data.stats.get(relToGit) || null;
        }
        return {
          uri,
          relPath,
          name: path.posix.basename(relPath),
          sizeBytes: stat.size,
          mtimeMs: stat.mtime,
          stats,
          me: data.me,
        };
      })
    );
    for (const ctx of settled) if (ctx) data.ctxs.push(ctx);
  }
  return data;
}

function rebuildMatches() {
  if (!state) return;
  const now = Date.now();
  const decorations = new Map();
  const counts = state.marks.map(() => 0);
  const folderBadges = vscode.workspace.getConfiguration('glyphMark').get('folderBadges', true);

  for (const data of state.folders.values()) {
    const fileMatches = new Map();
    for (const ctx of data.ctxs) {
      const matched = core.evaluate(ctx, state.marks, now);
      if (!matched.length) continue;
      fileMatches.set(ctx.relPath, matched);
      for (const m of matched) counts[state.marks.indexOf(m)]++;
      decorations.set(
        ctx.uri.toString(),
        new vscode.FileDecoration(matched[0].glyph, core.tooltipFor(matched, ctx, now, LANG))
      );
    }
    if (folderBadges) {
      const folders = core.aggregateFolders(fileMatches, state.marks);
      for (const [relDir, result] of folders) {
        const uri = vscode.Uri.file(path.join(data.folder.uri.fsPath, ...relDir.split('/')));
        decorations.set(
          uri.toString(),
          new vscode.FileDecoration(result.mark.glyph, core.folderTooltip(result, LANG))
        );
      }
    }
  }
  state.decorations = decorations;
  state.counts = counts;
  if (provider) provider.refreshAll();
  if (managerPanel) sendManagerState();
}

// Collection is slow (git log + stats), and several triggers can fire
// while one run is still in flight. Each run takes a generation number;
// only the newest run may publish its result, so a stale collection that
// finishes late cannot overwrite fresher state.
let collectGeneration = 0;

async function recollectAll() {
  const gen = ++collectGeneration;
  if (!state) state = { marks: [], errors: [], notices: [], folders: new Map(), decorations: new Map(), counts: [], rawMarks: [] };
  // With no marks configured nothing can be displayed, so skip the
  // expensive collection (full git log + findFiles/stat for every
  // folder) entirely. Collection starts when marks are added: the
  // configuration-change handler re-enters here once marks exist.
  loadMarks();
  if (!state.marks.length) {
    state.folders = new Map();
    state.notices = [];
    rebuildMatches();
    return;
  }
  const folders = vscode.workspace.workspaceFolders || [];
  const collected = new Map();
  for (const folder of folders) {
    collected.set(folder.uri.toString(), await collectFolder(folder));
    if (gen !== collectGeneration) return; // superseded by a newer run
  }
  if (gen !== collectGeneration) return;
  if (!state) state = { marks: [], errors: [], notices: [], folders: collected, decorations: new Map(), counts: [] };
  else state.folders = collected;
  state.notices = [...collected.values()]
    .filter((d) => d.gitLogFailed)
    .map((d) => STR.gitLogFailed(d.folder.name));
  loadMarks();
  rebuildMatches();
}

function loadMarks() {
  const raw = vscode.workspace.getConfiguration('glyphMark').get('marks', []);
  const { marks, errors } = core.validateMarks(raw);
  state.marks = marks;
  state.errors = errors;
  state.rawMarks = Array.isArray(raw) ? raw : [];
}

function managerHtml(webview) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'manager.css'));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'manager.js'));
  return `<!DOCTYPE html>
<html lang="${LANG}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${cssUri}">
<title>${STR.editAssignments}</title>
</head>
<body>
<main id="app"></main>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

let extensionUri = null;

function sendManagerState() {
  if (!managerPanel || !state) return;
  const inspect = vscode.workspace.getConfiguration('glyphMark').inspect('marks');
  const target = inspect && inspect.workspaceValue !== undefined ? 'workspace' : 'user';
  // Align match counts to the raw setting entries the form displays.
  // Build the normalized-mark lookup once: matching raw entries against
  // state.marks by repeated findIndex + JSON.stringify is quadratic in
  // the number of marks.
  const indexByKey = new Map(state.marks.map((m, i) => [JSON.stringify(m), i]));
  const countsByRaw = (state.rawMarks || []).map((entry) => {
    const single = core.validateMarks([entry]);
    if (!single.marks.length) return null;
    const idx = indexByKey.get(JSON.stringify(single.marks[0]));
    return idx !== undefined ? state.counts[idx] || 0 : null;
  });
  const styleRaw = vscode.workspace.getConfiguration('glyphMark').get('paletteStyle', core.DEFAULT_PALETTE_STYLE);
  const paletteStyle = core.PALETTE_STYLES.includes(styleRaw) ? styleRaw : core.DEFAULT_PALETTE_STYLE;
  managerPanel.webview.postMessage({
    type: 'state',
    lang: LANG,
    catalog: core.CATALOG,
    itemNames: core.ITEM_NAMES,
    palettes: core.PALETTES,
    paletteStyle,
    marks: state.rawMarks || [],
    countsByRaw,
    errors: state.errors || [],
    notices: state.notices || [],
    target,
    hasWorkspace: (vscode.workspace.workspaceFolders || []).length > 0,
  });
}

function openManager(context) {
  if (managerPanel) {
    managerPanel.reveal();
    sendManagerState();
    return;
  }
  managerPanel = vscode.window.createWebviewPanel(
    'glyphMarkManager',
    STR.editAssignments,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );
  managerPanel.webview.html = managerHtml(managerPanel.webview);
  managerPanel.onDidDispose(() => {
    managerPanel = null;
  });
  managerPanel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') {
      sendManagerState();
    } else if (msg.type === 'paletteStyle' && core.PALETTE_STYLES.includes(msg.style)) {
      await vscode.workspace.getConfiguration('glyphMark').update('paletteStyle', msg.style, vscode.ConfigurationTarget.Global);
    } else if (msg.type === 'save' && Array.isArray(msg.marks)) {
      // Re-validate on the host side: the form checks its own input, but
      // what gets persisted must not depend on the sender being our form.
      // Write the normalized marks; on errors, hand them back to the form
      // and write nothing.
      const { marks, errors } = core.validateMarks(msg.marks);
      if (errors.length) {
        managerPanel.webview.postMessage({ type: 'saveErrors', errors });
        return;
      }
      const target =
        msg.target === 'workspace' && (vscode.workspace.workspaceFolders || []).length
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration('glyphMark').update('marks', marks, target);
      // The configuration change event reloads marks and rebuilds decorations;
      // the refreshed state is pushed back to the form from rebuildMatches().
    }
  });
}

function activate(context) {
  extensionUri = context.extensionUri;
  provider = new GlyphDecorationProvider();
  state = { marks: [], errors: [], notices: [], folders: new Map(), decorations: new Map(), counts: [], rawMarks: [] };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(provider),
    vscode.commands.registerCommand('glyphMark.refresh', async () => {
      await recollectAll();
      vscode.window.showInformationMessage(STR.refreshed);
    }),
    vscode.commands.registerCommand('glyphMark.manageMarks', () => openManager(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('glyphMark')) {
        loadMarks();
        // Marks were added while collection was skipped (no marks at
        // activation): start collecting now. Otherwise the already
        // collected data just needs its matches rebuilt.
        if (state.marks.length && state.folders.size === 0) recollectAll();
        else rebuildMatches();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      recollectAll();
    }),
    // Once the user trusts the workspace, git-based marks become
    // available (collectFolder skips git while untrusted).
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      recollectAll();
    })
  );

  // Refresh git-derived marks when HEAD moves (commit / checkout / pull).
  const headWatcher = vscode.workspace.createFileSystemWatcher('**/.git/logs/HEAD');
  let debounce = null;
  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => recollectAll(), 1000);
  };
  headWatcher.onDidChange(schedule);
  headWatcher.onDidCreate(schedule);
  context.subscriptions.push(headWatcher);

  recollectAll();
}

function deactivate() {}

module.exports = { activate, deactivate };
