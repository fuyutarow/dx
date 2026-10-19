+++
schema = 2
name = "dx-jex-invoke-timeout"
outcome = "tests/dx-jex-invoke.test.ts の、dx を何度も走らせる試験に、ほかの同じ試験と同じ上限を付け、全体の検査の負荷で 5 秒を超えて落ちないようにする"
writes = ["tests/dx-jex-invoke.test.ts"]
verify = ["bun test tests/dx-jex-invoke.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/dx-jex-invoke.test.ts"]
timeout_s = 600
premises = ["file:tests/dx-jex-invoke.test.ts"]

[proposition]
id = "DX-JEX-INVOKE-TIMEOUT"
claim = "上限を付けるだけで、試験の確かめる内容は変わらない"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.5 の統合の lane から返した issue（2026-10-19）。作業コピーは dx の 0cf76c5e の子で、依存は入っている。**

## 事実

- 全体の検査（`mise run check`）で、tests/dx-jex-invoke.test.ts:80 の "jex unavailable and undetermined responses do not write verdicts" が 5000.40ms で落ちた（既定の 5 秒の上限）。単独で 2 回流すと、2 回とも通る（7 pass）。全体の負荷で上限を超えた。
- ほかの試験のファイル（tests/review.test.ts など）は、dx を何度も走らせる試験に `60000` の上限を付けている。

## やること

1. tests/dx-jex-invoke.test.ts の、dx を 1 回より多く走らせる試験（:80 を含む）に、ほかのファイルと同じ形で 60000 の上限を付ける。確かめる内容は変えない。

## 共通の決まり

- 上限は 10 分。このファイルだけを変える。全体の検査は流さない。verify の命令だけを流す。整形は `bun run node_modules/oxfmt/bin/oxfmt tests/dx-jex-invoke.test.ts` だけ。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 変えた試験、verify の結果。
