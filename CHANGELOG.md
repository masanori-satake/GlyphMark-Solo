# Changelog

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
