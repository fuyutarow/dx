+++
schema = 2
name = "dx-diag-i09"
outcome = "I-09 の finding の message に、衝突した規則のファイルと、規則の定義を書く"
writes = ["src/collection.ts", "tests/dx-diag-i09.test.ts"]
verify = ["bun test tests/dx-diag-i09.test.ts"]
timeout_s = 600
premises = ["file:src/collection.ts"]

[proposition]
id = "DX-DIAG-I09"
claim = "I-09 の finding の message に、衝突した規則のファイルと、規則の定義を書く"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- src/collection.ts:276 の message は `policy and records changed together` だけで、どのファイルが規則に当たったか、何が規則かを言わない。

## やること
1. message を `policy and records changed together: policy files <最大 5 件、カンマ区切り。超えれば ", …">; 規則は dx.toml、.dx/ の下、[files] inputs。規則の変更は別の commit にする` にする。規則のファイルの一覧は、その change の paths のうち規則に当たるもの（今の式のままでよい。判定の関数は別の issue が置き換える）。check の名前、key、field は変えない。
2. 試験: 規則のファイルの名前と、定義の文が message に入る。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-diag-i09.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
