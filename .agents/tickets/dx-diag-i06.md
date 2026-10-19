+++
schema = 2
name = "dx-diag-i06"
outcome = "I-06 で verdict が無いという finding の message に、次の一手を添える"
writes = ["src/checks.ts", "tests/dx-diag-i06.test.ts"]
verify = ["bun test tests/dx-diag-i06.test.ts"]
timeout_s = 600
premises = ["file:src/checks.ts"]

[proposition]
id = "DX-DIAG-I06"
claim = "I-06 で verdict が無いという finding の message に、次の一手を添える"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha（4028299a）の上で行う。**

## 事実
- src/checks.ts:198 の message は `missing passing verdict bound to this record, rubric and another author` だけで、verdict が作業コピーにある場合の次の一手を言わない。retrospectives の書き手 3 人が、`dx review @-` の後の `dx land @-` で、ここで止まった。

## やること
1. message の末尾に `; dx review は verdict を作業コピーに書く。verdict を含む commit を land する（例: dx land @）` を足す。check の名前、key、field は変えない（key に message は入らない）。
2. 試験: message にその文が含まれる。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-diag-i06.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えたファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
