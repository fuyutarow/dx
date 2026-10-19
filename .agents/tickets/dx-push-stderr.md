+++
schema = 2
name = "dx-push-stderr"
outcome = "push が hook に拒まれたとき、git の stderr の remote: の行をすべて stderr に出す"
writes = ["src/commands/land.ts", "src/land/process.ts", "tests/dx-push-stderr.test.ts"]
verify = ["bun test tests/dx-push-stderr.test.ts tests/land"]
timeout_s = 600
premises = ["file:src/commands/land.ts"]

[proposition]
id = "DX-PUSH-STDERR"
claim = "push が hook に拒まれたとき、git の stderr の remote: の行をすべて stderr に出す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- src/commands/land.ts:80 は、PUSH_REJECTED のとき git の stderr の最初の空でない 1 行だけを出す。research-record-v2 の書き手は、どのファイルが拒まれたかを hook の出力から探し直した。

## やること
1. PUSH_REJECTED のとき、git の stderr のうち `remote:` で始まる行をすべて（無ければ今と同じく最初の空でない 1 行を）、`PUSH_REJECTED` の行の後に stderr へ出す。上限は 200 行（超えれば `… <n> lines omitted`）。exit（1）、stdout、コードは変えない。
2. 試験: 拒む pre-receive hook を持つ bare remote で、hook の複数行の出力が stderr に出る。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-push-stderr.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
