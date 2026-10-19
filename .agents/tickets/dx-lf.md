+++
schema = 2
name = "dx-lf"
outcome = "markdown-frontmatter の区切りを ---\\n に限り、frontmatter の中の CR を format の finding にする"
writes = ["src/formats.ts", "tests/dx-lf.test.ts", "docs/spec.md"]
verify = ["bun test tests/dx-lf.test.ts tests/strict-yaml.test.ts"]
timeout_s = 600
premises = ["file:src/formats.ts"]

[proposition]
id = "DX-LF"
claim = "markdown-frontmatter の区切りを ---\\n に限り、frontmatter の中の CR を format の finding にする"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha（4028299a）の上で行う。**

## 事実
- src/formats.ts:20 の正規表現は、区切りに `\r?\n` を受ける。retrospectives（retro.ts:38-41）と soks（format.ts）は、LF だけを受ける検査をそれぞれ自前で書いている。

## やること
1. 区切りは `---\n` だけを受ける。frontmatter の中（区切りを含む）に CR があれば `{ check: "format", path, field: path, message: "CR in frontmatter" }` を出し、記録としては読まない。本文の CR は扱わない。BOM の扱いは変えない。
2. 試験: CRLF の区切り、frontmatter の中の CR が format の finding になる。LF だけのものは今と同じに読める。
3. spec §7 の markdown-frontmatter の説明に 1 文足す。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-lf.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えたファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
