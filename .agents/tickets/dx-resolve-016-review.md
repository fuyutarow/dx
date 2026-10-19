+++
schema = 2
name = "dx-resolve-016-review"
outcome = "0.1.6 の統合の merge で競合した src/commands/review.ts を、dx-jex-questions と dx-jex-raw-bytes の変更をどちらも残す形で解く"
writes = ["src/commands/review.ts"]
verify = ["bun -e \"const t=await Bun.file('src/commands/review.ts').text(); if (/^(<{7}|>{7}|%{7}|[+]{7}) /m.test(t)) process.exit(1)\" && bun test tests/dx-jex-questions.test.ts tests/dx-jex-raw-bytes.test.ts tests/dx-jex-invoke.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts"]
timeout_s = 600
premises = ["file:src/commands/review.ts"]

[proposition]
id = "DX-RESOLVE-016-REVIEW"
claim = "2 つの issue の変更は両立する"
refuted_by = "2 つの変更が同じ箇所で両立しない（その箇所を返す）"
+++

**dx 0.1.6 の統合の lane から返した issue（2026-10-19）。作業コピーは統合の merge e59aae98 の子で、依存は入っている。**

## 事実

- 0.1.6 の 4 本を merge したところ、src/commands/review.ts が 2 面で競合した。
  - 643d5e48（dx-jex-questions）: questionFile の各問いの text を、審査対象の 1 文、前置き、rubric の問い、Yes と No の文の 5 行にした。記録の path と link 先の有無を questionFile に渡すよう、呼び出し側の引数を足した（.agents/tickets/dx-jex-questions.md）。
  - 19b987d7（dx-jex-raw-bytes）: 一時ディレクトリに書く記録のファイルを木の中の元の bytes にし、locator が木の中の path の evidence も元の bytes にした。予算は実際に書く bytes で数える（.agents/tickets/dx-jex-raw-bytes.md）。
- 各 issue の変更は `git show <commit> -- src/commands/review.ts` で読める（jj は lock が取れないので使わない）。

## やること

1. 競合の印をすべて解き、2 つの変更をどちらも残す（和をとる）。予算の計算には、長くなった問いの bytes と、元の bytes の記録と evidence の両方を入れる。
2. verify の試験（2 つの issue の試験と dx-jex-invoke の試験）がすべて通ること。

## 共通の決まり

- 上限は 10 分。src/commands/review.ts だけを変える。全体の検査は流さない。verify の命令だけを流す。整形は `bun run node_modules/oxfmt/bin/oxfmt src/commands/review.ts` だけ。house の規則に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 解いた箇所ごとに、2 つの変更をどう合わせたか、verify の結果。
