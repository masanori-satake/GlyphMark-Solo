# GlyphMark-Solo

Your own glyphs on the files and folders you hunt for.

Version 1.1.3 — hardening: caps on mark settings, and no collection until marks exist.

The Explorer tree shows file types, but not what *you* are looking for. GlyphMark-Solo lets you assign a glyph — a mark you choose yourself, like a stamp on a map — to a catalog of items. Matching files and folders then carry that glyph next to their name, so what you hunt for floats up by glyph alone, without searching.

- **Your icon theme stays untouched.** Marks are Explorer badges (FileDecoration). They never replace icons and never claim a colour, so Git's `M` / `U` badges and change colours keep working, side by side (`M, ✦`).
- **Silent until you choose.** Nothing is assigned by default. An item without a glyph does nothing.
- **100% local.** Git history and file stats only. No tracking, no network, zero dependencies.

## The catalog

| Item | Looks at |
|---|---|
| Created recently | first commit within N days |
| Updated recently | last commit (or file time) within N days |
| Updated frequently | at least M commits within N days |
| Not updated for a long time | last update older than N days |
| Last edited by me | last commit author is you (git config) |
| Last edited by a named person | last commit author matches a name/email (repeatable) |
| Name contains text | file name contains a string (repeatable) |
| Path contains text | relative path contains a string (repeatable) |
| Large file | size at least N KB |

When several items match, the badge shows the first one in list order — the list order is the priority order, and the assignment form reorders rows by drag & drop; the tooltip lists every match with its evidence (for example `✦ Created recently — created 5d ago`). A folder carries the highest-priority mark found inside it, with counts in its tooltip (`◆ Path contains text — 12 inside`). Toggle folder marks with `glyphMark.folderBadges`.

## Assigning marks

Run **GlyphMark: Edit Mark Assignments** from the Command Palette. The one-screen form lists the catalog; click a mark cell to open the glyph palette (or type any 1–2 character glyph), adjust the parameters, and save to your user settings or the workspace settings (handy for sharing a legend with your team). The palette opens on monochrome symbols drawn in the editor's UI font, so marks sit quietly next to Git's letter badges; a Symbols / Emoji toggle in the palette switches to colour emoji instead (setting `glyphMark.paletteStyle`, default `symbol`).

The same assignments live in settings as `glyphMark.marks`, so you can also edit them as JSON:

```jsonc
"glyphMark.marks": [
  { "item": "createdRecent", "glyph": "✦", "days": 30 },
  { "item": "updatedFrequently", "glyph": "↻", "days": 90, "minCount": 10 },
  { "item": "pathContains", "glyph": "◆", "text": "docs/" }
]
```

Run **GlyphMark: Recalculate Marks** after big history changes; commits and checkouts are also picked up automatically via the git HEAD watcher.

## Notes

- Badges are limited to 1–2 characters by VS Code — that is why marks are glyphs, not words like `[New]`. The full wording lives in tooltips.
- Git statistics come from one `git log` pass per repository. In folders without git, time-based items fall back to file modification times (noted in the tooltip); author and frequency items simply do not match there.
- Up to 20,000 files per workspace folder are considered.

---

# GlyphMark-Solo（日本語）

探したいファイルとフォルダに、自分のグリフを。

エクスプローラのツリーはファイルの形式は教えてくれますが、**自分が探しているもの** は教えてくれません。GlyphMark-Solo は、項目カタログに自分で選んだグリフ（地図に打つスタンプのようなマーク）を割り当てる拡張です。該当するファイルとフォルダの名前の横にそのグリフが付くので、探し物が検索するまでもなくグリフだけで浮かび上がります。

- **アイコンテーマには触りません。** マークはエクスプローラのバッヂ（FileDecoration）です。アイコンを差し替えず、色も主張しないので、Git の `M` / `U` バッヂや変更色はこれまでどおり働き、並んで共存します（`M, ✦`）。
- **選ぶまで静かです。** 既定では何も割り当てません。グリフのない項目は何もしません。
- **100% ローカル。** 材料は git 履歴とファイル情報だけ。トラッキングなし、ネットワークなし、依存ゼロ。

## 項目カタログ

| 項目 | 見るもの |
|---|---|
| 新しく作られた | 初回コミットが N 日以内 |
| 最近更新された | 最終コミット（または更新日時）が N 日以内 |
| 頻繁に更新されている | 直近 N 日に M 回以上コミット |
| 長く更新されていない | 最終更新が N 日より前 |
| 自分が最後に編集した | 最終コミットの作者が自分（git config） |
| 指定した人が最後に編集した | 最終作者が名前／メールに一致（複数行可） |
| 名前に文字を含む | ファイル名に文字列を含む（複数行可） |
| パスに文字を含む | 相対パスに文字列を含む（複数行可） |
| サイズが大きい | サイズが N KB 以上 |

複数項目に一致した場合、バッヂは並び順で最初の1つになります。並び順がそのまま優先順位で、割り当てフォームでは行をドラッグ＆ドロップで並び替えられます。ツールチップに一致した全項目と根拠（例：`✦ 新しく作られた — 作成 5日前`）が並びます。フォルダには配下の最優先マークが付き、件数はツールチップに出ます（`◆ パスに文字を含む — 配下に 12 件`）。フォルダのマークは `glyphMark.folderBadges` で切り替えます。

## マークの割り当て

コマンドパレットから **GlyphMark: マーク割り当てを編集** を開きます。一画面のフォームにカタログが並ぶので、マークのセルをクリックしてグリフパレットから選ぶ（または1〜2文字の任意のグリフを入力する）、パラメータを調整する、保存先（ユーザー設定／ワークスペース設定。チームで凡例を共有するならワークスペース側）を選んで保存します。パレットは、エディタの UI フォントで単色に描かれるシンボルから開きます。Git の文字バッヂの隣でも浮きません。カラーの絵文字が好みなら、パレット内の「シンボル／絵文字」切り替えで変更できます（設定 `glyphMark.paletteStyle`、既定は `symbol`）。

割り当ては設定 `glyphMark.marks` にも同じ形で残るので、JSON で直接編集することもできます（上の英語欄の例を参照）。

履歴が大きく変わったときは **GlyphMark: マークを再計算** をどうぞ。コミットやチェックアウトは git HEAD の監視で自動的に拾います。

## 注意

- バッヂは VS Code の仕様で1〜2文字までです。`[New]` のような単語ではなくグリフなのはそのためで、言葉の意味はツールチップ側に残ります。
- git の統計はリポジトリごとに `git log` を一括で流して集計します。git のないフォルダでは、時間系の項目はファイルの更新日時で代替し（ツールチップに明記）、作者・頻度の項目は一致しません。
- 対象はワークスペースフォルダごとに最大 20,000 ファイルです。
