+++
schema = 2
name = "dx-utf8"
outcome = "木から読んだ blob の不正な UTF-8 を、黙って U+FFFD に読み替えず、format の finding にする"
writes = ["src/repository.ts", "src/collection.ts", "src/formats.ts", "tests/dx-utf8.test.ts", "docs/spec.md"]
verify = ["bun test tests/dx-utf8.test.ts tests/repository.test.ts"]
timeout_s = 600
premises = ["file:src/repository.ts"]

[proposition]
id = "DX-UTF8"
claim = "木から読んだ blob の不正な UTF-8 を、黙って U+FFFD に読み替えず、format の finding にする"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- src/repository.ts:212 は blob を `toString("utf8")` で読む。不正な UTF-8 は黙って U+FFFD になる。I-07（判定できないものを空の成功にしない）に反する。soks は自前の document-text.ts で U+FFFD を拒んで補っている。

## やること
1. 記録と inputs として読むファイルは、不正な UTF-8 で失敗する decoder（`new TextDecoder("utf-8", { fatal: true })` など）で読む。不正なら、そのファイルについて `{ check: "format", path, field: path, message: "invalid UTF-8 at byte <n>" }` を出し、記録としては読まない。BOM は今と同じに扱う。
2. 試験: 不正な UTF-8 の記録と inputs が format の finding になる。正しい UTF-8（多バイト文字を含む）は今と同じに読める。
3. spec の I-07 か §7 の format の説明に 1 文足す。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-utf8.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。


## 前の回の返却を受けて（coordinator、2026-10-19 15:30。最新版）

- 前の回の止まった理由は、brief の誤りだった（書いてよい範囲、または作業の出発点の書き方）。writes と出発点の書き方を直した。この brief のとおりに進める。
