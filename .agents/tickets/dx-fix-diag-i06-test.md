+++
schema = 2
name = "dx-fix-diag-i06-test"
outcome = "tests/dx-diag-i06.test.ts の試験を、消えた frontmatter の place から file:<glob> に移す"
writes = ["tests/dx-diag-i06.test.ts"]
verify = ["bun test tests/dx-diag-i06.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/dx-diag-i06.test.ts"]
timeout_s = 600
premises = ["file:tests/dx-diag-i06.test.ts"]

[proposition]
id = "DX-FIX-DIAG-I06-TEST"
claim = "tests/dx-diag-i06.test.ts の試験を、消えた frontmatter の place から file:<glob> に移す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）で、"I-06 missing verdict finding explains how to land the working-copy verdict" が `review.place = "frontmatter" は消えた` で落ちる（dx-diag-i06 と dx-purge-frontmatter を同時に行ったため）。

## やること

1. 試験の fixture を `place = "file:<glob>"`（verdict は .dx/ の外、例: `verdicts/*.jsonl`）に移す。確かめる内容（message に次の一手の文が入ること）は変えない。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
