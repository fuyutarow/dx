+++
schema = 2
name = "dx-purge-frontmatter"
outcome = "review の place = \"frontmatter\" を消し、place は \"file:<glob>\" だけにする"
writes = ["src/model.ts", "src/checks.ts", "src/policy.ts", "src/commands/review.ts", "tests/review.test.ts", "tests/review-author.test.ts", "tests/dx-purge-frontmatter.test.ts", "docs/spec.md", "README.md"]
verify = ["bun test tests/review.test.ts tests/review-author.test.ts tests/dx-purge-frontmatter.test.ts"]
timeout_s = 600
premises = ["file:src/model.ts", "file:src/checks.ts", "file:src/policy.ts"]

[proposition]
id = "DX-PURGE-FRONTMATTER"
claim = "review の place = \"frontmatter\" を消し、place は \"file:<glob>\" だけにする"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- `place = "frontmatter"`（src/model.ts:146、src/checks.ts:213・246、src/policy.ts:125、および review.ts の書き戻し）は、3 つの repo のどれも使っていない。immutable と両立しない（spec §3 の反例）。

## やること
1. place は `"file:<glob>"` だけを受ける（鍵の形は変えない）。`"frontmatter"` は `UNDETERMINED:policy: <type>: review.place = "frontmatter" は消えた。"file:<glob>" を使う` で exit 4。
2. frontmatter に verdict を書き戻す処理、読む処理、I-06 の対象集合の frontmatter の分岐、policy.ts:125 の immutable との組み合わせ検査を消す。
3. 試験: frontmatter を使う既存の試験は `file:` に移すか消す。exit 4 の試験を足す。
4. spec §3 の「immutable な記録の frontmatter に verdict を書く」反例と §7 の place の説明、README を直す。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-purge-frontmatter.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。


## 前の回の返却を受けて（coordinator、2026-10-19 15:30。最新版）

- 前の回で、docs/spec.md（と README.md）全体に oxfmt がかかり、数百行が整形し直された。このままでは、ほかの issue と統合で衝突する。
- `jj restore --from @- docs/spec.md README.md` で 2 つのファイルを戻し、この issue の「やること」に書いた文だけを、手で入れ直す。`.md` には oxfmt をかけない。
- 前の回の verify は、並列の負荷で試験が 5 秒の上限を超えた。負荷を下げたので、verify をもう一度流す。時間切れになった試験があれば、その試験だけを `bun test <file> -t '<name>'` で流し直して確かめてよい。
- src と tests の変更は、そのまま残してよい（前の回の実装を続ける）。
