'use strict';

const vscode = require('vscode');
const path = require('path');
const { execFile } = require('child_process');
const core = require('./core');

const LANG = vscode.env.language && vscode.env.language.startsWith('ja') ? 'ja' : 'en';
const STR = {
  en: {
    refreshed: 'GlyphMark: marks recalculated',
    editAssignments: 'Edit Mark Assignments',
  },
  ja: {
    refreshed: 'GlyphMark: マークを再計算しました',
    editAssignments: 'マーク割り当てを編集',
  },
}[LANG];

let provider = null;
let state = null; // { marks, errors, folders: Map, decorations: Map<string, vscode.FileDecoration>, counts: number[] }
let managerPanel = null;

function execGit(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: 128 * 1024 * 1024, timeout: 120000, windowsHide: true },
      (err, stdout) => resolve(err ? null : stdout)
    );
  });
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
  const data = { folder, gitRoot: null, stats: new Map(), me: null, ctxs: [] };

  const top = await execGit(['rev-parse', '--show-toplevel'], folderPath);
  if (top && top.trim()) {
    data.gitRoot = top.trim();
    const [log, name, email] = await Promise.all([
      execGit(['log', '--pretty=format:%x1e%at%x1f%an%x1f%ae', '--name-only'], data.gitRoot),
      execGit(['config', 'user.name'], data.gitRoot),
      execGit(['config', 'user.email'], data.gitRoot),
    ]);
    if (log) data.stats = core.parseGitLog(log);
    data.me = { name: (name || '').trim(), email: (email || '').trim() };
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

  for (const uri of fileUris) {
    if (uri.scheme !== 'file') continue;
    const relPath = posixRel(folderPath, uri.fsPath);
    if (!relPath || relPath.startsWith('..')) continue;
    let stat = null;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      continue;
    }
    if (stat.type !== vscode.FileType.File) continue;
    let stats = null;
    if (data.gitRoot) {
      const relToGit = posixRel(data.gitRoot, uri.fsPath);
      stats = data.stats.get(relToGit) || null;
    }
    data.ctxs.push({
      uri,
      relPath,
      name: path.posix.basename(relPath),
      sizeBytes: stat.size,
      mtimeMs: stat.mtime,
      stats,
      me: data.me,
    });
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

async function recollectAll() {
  const folders = vscode.workspace.workspaceFolders || [];
  const collected = new Map();
  for (const folder of folders) {
    collected.set(folder.uri.toString(), await collectFolder(folder));
  }
  if (!state) state = { marks: [], errors: [], folders: collected, decorations: new Map(), counts: [] };
  else state.folders = collected;
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
  const nonce = String(Date.now()) + Math.random().toString(36).slice(2);
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
  const countsByRaw = (state.rawMarks || []).map((entry) => {
    const single = core.validateMarks([entry]);
    if (!single.marks.length) return null;
    const idx = state.marks.findIndex(
      (m) => JSON.stringify(m) === JSON.stringify(single.marks[0])
    );
    return idx >= 0 ? state.counts[idx] || 0 : null;
  });
  managerPanel.webview.postMessage({
    type: 'state',
    lang: LANG,
    catalog: core.CATALOG,
    itemNames: core.ITEM_NAMES,
    palette: core.PALETTE,
    marks: state.rawMarks || [],
    countsByRaw,
    errors: state.errors || [],
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
    } else if (msg.type === 'save' && Array.isArray(msg.marks)) {
      const target =
        msg.target === 'workspace' && (vscode.workspace.workspaceFolders || []).length
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
      await vscode.workspace.getConfiguration('glyphMark').update('marks', msg.marks, target);
      // The configuration change event reloads marks and rebuilds decorations;
      // the refreshed state is pushed back to the form from rebuildMatches().
    }
  });
}

function activate(context) {
  extensionUri = context.extensionUri;
  provider = new GlyphDecorationProvider();
  state = { marks: [], errors: [], folders: new Map(), decorations: new Map(), counts: [], rawMarks: [] };

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
        rebuildMatches();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
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
