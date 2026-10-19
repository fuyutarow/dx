+++
schema = 2
name = "dx-016fix-sidecar-retry"
outcome = "0.1.6 の統合の merge で落ちる試験「passing sidecar verdict satisfies I-06 and is skipped on retry」を通す"
writes = ["src/commands/review.ts", "tests/review.test.ts"]
verify = ["bun test tests/review.test.ts -t \"passing sidecar verdict satisfies I-06 and is skipped on retry\" && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts tests/review.test.ts"]
timeout_s = 600
premises = ["file:tests/review.test.ts", "file:src/commands/review.ts"]

[proposition]
id = "DX-016FIX-SIDECAR-RETRY"
claim = "0.1.6 の統合の merge で落ちる試験「passing sidecar verdict satisfies I-06 and is skipped on retry」を通す"
refuted_by = "試験の期待が、0.1.6 の決定（問いの 5 行と元の bytes）と両立しない（その箇所を返す）"
+++

**dx 0.1.6 の統合の lane から返した issue（2026-10-19）。作業コピーは統合の merge 187ea851d775 の子で、依存は入っている。**

## 事実

- 0.1.6 の 4 本（dx-jex-questions、dx-jex-raw-bytes、dx-jex-docs-016、実験の結果）を merge し、src/commands/review.ts の競合を解いた後、全体の検査で tests/review.test.ts:76 の「passing sidecar verdict satisfies I-06 and is skipped on retry」が落ちる（394 pass、2 fail）。
- 0.1.6 の決定:
  - jex に渡す各問いの text は、審査対象の 1 文、前置き、rubric の問い、Yes と No の文の 5 行（.agents/tickets/dx-jex-questions.md）。
  - 記録のファイルは木の中の元の bytes。locator が木の中の path の evidence も元の bytes。木に無い locator は型の content（.agents/tickets/dx-jex-raw-bytes.md）。
- もう 1 つの失敗は、別の issue が同時に直している（同じファイルの別の試験）。

## やること

1. 落ちる原因を確かめる。試験が確かめている性質（名前のとおり）を仕様とする。
2. 原因が、試験の期待が 0.1.6 より前の渡し方（reviewText の中身、問いの text が rubric の問いだけ、など）を前提にしていることなら、試験の期待を 0.1.6 の決定に合わせて直す。確かめる性質は変えない。
3. 原因が src の欠陥なら、src/commands/review.ts を直す。0.1.6 の決定は変えない。
4. 返却に、原因と、どちらを直したかを書く。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。全体の検査は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。house の規則に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 原因、変えた箇所、verify の結果。
