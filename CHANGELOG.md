# Changelog

## [1.1.3] - 2026-11-22

- Hardening (security/reliability audit, no behaviour change for valid settings): numeric mark parameters now have upper bounds in validation and in the `glyphMark.marks` settings schema alike (`days` ≤ 36500, `kb` ≤ 1048576, `minCount` ≤ 10000), so an extreme value can no longer overflow and make an item match every file. The marks list is capped at 200 entries and the `text` parameter at 200 characters.
- The assignment form's per-entry match counts are now aligned through a single lookup map instead of repeated linear searches, so recalculation no longer slows down quadratically as the number of marks grows.
- When no marks are configured, activation no longer collects the full git history and file stats for every workspace folder; collection starts when marks are added through a settings change.

---

- 堅牢化（セキュリティ／信頼性監査対応。有効な設定での挙動は不変）：数値パラメータに上限を設けました（`days` ≤ 36500、`kb` ≤ 1048576、`minCount` ≤ 10000。検証ロジックと `glyphMark.marks` の設定スキーマの両方）。極端な値で計算が溢れて全ファイルに一致するようなことがなくなります。マークの件数は最大200件、`text` パラメータは最大200文字に制限しました。
- 割り当てフォームの項目別マッチ件数を、線形探索の繰り返しではなく一度だけ構築する対応表で引くようにし、マーク件数が増えても再計算が二乗的に重くならないようにしました。
- マークが未設定の場合は、起動時に全ワークスペースフォルダの git 履歴とファイル情報の収集を行わないようにしました。設定でマークが追加された時点で収集を開始します。

## [1.1.2] - 2026-11-20

- Fixed the assignment form keeping a stale host save error on screen: when client-side validation stops a save, the notes box is now redrawn with the previous errors cleared, and when the saved marks change (fresh state from the host), errors from the previous save attempt are dropped before the re-render. Errors still describe the last save attempt when the marks are unchanged (e.g. switching the palette style).

---

- 割り当てフォームで古いホスト側の保存エラーが画面に残り続ける問題を修正しました。クライアント側の検証で保存が止まったときは、直前のエラーを消して注意ボックスを描き直します。保存済みマークが変わった状態がホストから届いたときは、前回の保存時のエラーを破棄してから再描画します。マークが変わっていない場合（パレット切り替えなど）は、エラーは前回の保存時のものとしてそのまま残ります。

## [1.1.1] - 2026-11-20

- Hardening (security/reliability audit, no behaviour change for valid settings): glyphs now reject control, whitespace and invisible format characters, and labels are capped at 100 characters — in validation and in the `glyphMark.marks` settings schema alike. The assignment form's saves are re-validated on the extension-host side and only the normalized marks are written; validation errors are handed back to the form instead of being persisted.
- Workspace Trust is now declared (`untrustedWorkspaces: limited`): in Restricted Mode the extension does not run git in the workspace and ignores workspace-folder values of `glyphMark.marks`, while marks from user settings and file time/size items keep working. Virtual workspaces are declared unsupported (the extension reads local git history and file stats).
- Git collection is bounded (32 MB buffer, 60 s per git call) and file stats are collected in parallel batches; when a folder's git history cannot be read, the form now shows a note instead of the git-based marks silently disappearing. Overlapping recollections are generation-guarded so a stale result cannot overwrite fresher state, and the assignment form's CSP nonce is generated from cryptographic randomness.

---

- 堅牢化（セキュリティ／信頼性監査対応。有効な設定での挙動は不変）：グリフで制御文字・空白・不可視の書式文字を拒否し、ラベルに 100 文字の上限を設けました（検証ロジックと `glyphMark.marks` の設定スキーマの両方）。割り当てフォームからの保存は拡張ホスト側でも再検証し、正規化済みのマークだけを書き込みます。検証エラーは保存せずフォームへ返します。
- ワークスペース信頼を宣言しました（`untrustedWorkspaces: limited`）：制限モードではワークスペース内で git を実行せず、`glyphMark.marks` のワークスペース設定値を採用しません。ユーザー設定のマークと、更新日時・サイズの項目は引き続き動きます。仮想ワークスペースは未対応と宣言しました（ローカルの git 履歴とファイル情報を読むため）。
- git 収集に上限を設け（バッファ 32MB、git 1 回あたり 60 秒）、ファイル情報の取得を並行バッチ化しました。フォルダの git 履歴を読めなかった場合は、Git 由来のマークが黙って消えるのではなく、フォームに注意が表示されます。収集の重なりは世代管理で防ぎ、古い結果が新しい状態を上書きしないようにしました。割り当てフォームの CSP nonce は暗号論的乱数から生成します。

## [1.1.0] - 2026-11-18

- Glyph palettes: the assignment form's picker now opens on monochrome symbols drawn in the editor's UI font (✦ ★ ● ▲ ◆ …), so marks sit quietly next to Git's letter badges. A Symbols / Emoji toggle in the palette switches to the colour emoji palette. The choice is kept in the new `glyphMark.paletteStyle` setting (default `symbol`); marks already assigned do not change.

---

- グリフパレットを追加：割り当てフォームのパレットが、エディタの UI フォントで単色に描かれるシンボル（✦ ★ ● ▲ ◆ …）から開くようになり、Git の文字バッヂの隣でも浮かなくなりました。パレット内の「シンボル／絵文字」切り替えで、カラーの絵文字パレットにも変更できます。選択は新しい設定 `glyphMark.paletteStyle`（既定は `symbol`）に保存され、割り当て済みのマークは変わりません。

## [1.0.0] - 2026-11-17

- First public release (Visual Studio Marketplace, Open VSX, GitHub Release). Feature set as of 0.2.0: catalog-based glyph badges for Explorer files and folders (FileDecoration only — icon themes untouched, no colour claimed), a one-screen assignment form with a glyph palette and drag & drop priority ordering, git-history aggregation in one pass per repository, folder aggregation with counts in tooltips, full English/Japanese UI. 100% local, no tracking, zero dependencies.

---

- 初回公開リリース（Visual Studio Marketplace、Open VSX、GitHub Release）。0.2.0 時点の機能一式：項目カタログによるファイル／フォルダへのグリフバッヂ（FileDecoration のみ使用し、アイコンテーマには触らず色も主張しない）、グリフパレットとドラッグ＆ドロップの優先順位変更を備えた一画面の割り当てフォーム、リポジトリごとの一括 git 履歴集計、件数付きツールチップによるフォルダ集約、英語／日本語の完全対応。100% ローカル、トラッキングなし、依存ゼロ。

## [0.2.0] - 2026-11-17

- Priority now follows the order of the marks list itself (previously the fixed catalog order): when several items match, the earliest entry's glyph is shown. The assignment form reorders rows by drag & drop (handle at the left edge of each row), lists assigned rows first in saved order, and the form intro and the `glyphMark.marks` setting description state the rule.

---

- 優先順位が、固定のカタログ順から、マーク一覧の並び順そのものに変わりました：複数該当した場合は一番上のエントリのグリフが表示されます。割り当てフォームでは行左端のつまみでドラッグ＆ドロップの並び替えができ、割り当て済みの行が保存順に先頭へ並びます。フォームの説明文と `glyphMark.marks` の設定説明にもこの規則を明記しました。

## [0.1.1] - 2026-11-17

- Fixed the commands not being findable by the extension name in the Command Palette: both commands now declare the "GlyphMark" category, so they appear as "GlyphMark: Edit Mark Assignments" and "GlyphMark: Recalculate Marks".

---

- コマンドパレットで拡張名からコマンドを探せなかった問題を修正：両コマンドにカテゴリ「GlyphMark」を付け、「GlyphMark: マーク割り当てを編集」「GlyphMark: マークを再計算」と表示されるようにしました。

## [0.1.0] - 2026-11-17

- Initial release: assign your own glyphs to a catalog of items and matching files and folders carry the glyph as an Explorer badge (FileDecoration). Your icon theme is never touched and no colour is claimed, so Git decorations keep working as before.
- Catalog: created recently, updated recently, updated frequently, not updated for a long time, last edited by me, last edited by a named person (repeatable), name contains text (repeatable), path contains text (repeatable), large file.
- One-screen assignment form (command "GlyphMark: Edit Mark Assignments") with a glyph palette, per-item parameters, live match counts, and a choice of user or workspace settings. Nothing is assigned by default, so the extension stays silent until you pick a mark.
- Git history is aggregated in one pass per repository; folders show the highest-priority mark found inside, with counts in the tooltip. 100% local, no tracking, zero dependencies.

---

- 初回リリース：項目カタログに自分のグリフを割り当てると、該当するファイルとフォルダにエクスプローラのバッヂとして付きます（FileDecoration）。アイコンテーマには触らず、色も主張しないので、Git の装飾は従来どおり働きます。
- カタログ：新しく作られた／最近更新された／頻繁に更新されている／長く更新されていない／自分が最後に編集した／指定した人が最後に編集した（複数行可）／名前に文字を含む（複数行可）／パスに文字を含む（複数行可）／サイズが大きい。
- 一画面の割り当てフォーム（コマンド「GlyphMark: マーク割り当てを編集」）に、グリフパレット、項目ごとのパラメータ、現在の一致件数、保存先（ユーザー／ワークスペース）の選択を用意。既定では何も割り当てないので、マークを選ぶまで拡張は静かです。
- git 履歴はリポジトリごとに一括集計。フォルダには配下の最優先マークを付け、件数はツールチップに出します。100% ローカル、トラッキングなし、依存ゼロ。
