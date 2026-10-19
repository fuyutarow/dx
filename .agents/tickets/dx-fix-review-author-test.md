+++
schema = 2
name = "dx-fix-review-author-test"
outcome = "tests/review-author.test.ts の、verdict を .dx/ に置く試験を、.dx/ の外に置く形に移す"
writes = ["tests/review-author.test.ts"]
verify = ["bun test tests/review-author.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/review-author.test.ts"]
timeout_s = 600
premises = ["file:tests/review-author.test.ts"]

[proposition]
id = "DX-FIX-REVIEW-AUTHOR-TEST"
claim = "tests/review-author.test.ts の、verdict を .dx/ に置く試験を、.dx/ の外に置く形に移す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）で、66 行の "real retrospective policy and six authorless records review into .dx sidecars from an empty child" が `UNDETERMINED:policy: retro: review.place は規則のファイル（dx.toml、.dx/、inputs）の外に置く` で落ちる。issue dx-place-guard の新しい制約による。retrospectives も、verdict を .dx/ の外（verdicts/）に移している。

## やること

1. 試験の fixture の verdict の place を `.dx/` の外（例: `file:verdicts/*.jsonl`）に移し、試験の名前の ".dx sidecars" を合わせて直す。確かめる内容（著者のない 6 つの記録が、空の子から review されること）は変えない。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
