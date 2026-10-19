+++
schema = 2
name = "dx-purge-match"
outcome = "links の match を消し、宣言に残っていれば規則の読み込みで exit 4 にする"
writes = ["src/model.ts", "src/checks.ts", "tests/link-match.test.ts", "tests/dx-purge-match.test.ts", "docs/spec.md", "README.md", "src/collection.ts"]
verify = ["bun test tests/link-match.test.ts tests/dx-purge-match.test.ts"]
timeout_s = 600
premises = ["file:src/model.ts", "file:src/checks.ts"]

[proposition]
id = "DX-PURGE-MATCH"
claim = "links の match を消し、宣言に残っていれば規則の読み込みで exit 4 にする"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- links の `match`（src/model.ts:102、134、および checks.ts でそれを使う所）は、retrospectives、soks、research-record-v2 のどれも使っていない（DevX ヒアリング 2026-10-19）。`values` で同じことができる。

## やること
1. links の宣言から `match` を消す。宣言に `match` があれば `UNDETERMINED:policy: <type>.links.<rel>: match は消えた。values を使う` で exit 4。
2. `match` の試験を消し、exit 4 の試験を足す。`values` と `dx:` の扱いは変えない。
3. spec §7 と README の links の説明から match を消す。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-purge-match.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。


## 前の回の返却を受けて（coordinator、2026-10-19 15:30。最新版）

- 前の回の止まった理由は、brief の誤りだった（書いてよい範囲、または作業の出発点の書き方）。writes と出発点の書き方を直した。この brief のとおりに進める。
