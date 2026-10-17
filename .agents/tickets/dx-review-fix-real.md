+++
schema = 2
name = "dx-review-fix-real"
outcome = "retrospectives の実際の木（workspace /home/fuyu/Workspace/retrospectives.ws/ws_retro-dx）で `dx review` を流すと、verdict が無い 6 件の記録について本物の Jev に問い合わせ、`.dx/` の file 置き場に verdict を書き、その後の `dx check --base 'alpha@origin' @` で I-06 の新しい finding が 0 件になる。その欠陥が、実際の木を写した試験で固定され、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/commands/review.ts"]

[proposition]
id = "DX-REVIEW-FIX-REAL"
claim = "dx review の事前検査（I-10）で、review が満たすはずの I-06 の finding が除外されていないために、review が Jev を呼ばずに止まっている"
refuted_by = "原因が I-10 の事前検査ではない（本当の原因を返す）"
+++

**owner の repo で見つかった dx review の欠陥の修理です。** 試験の repo では通っていましたが、実際の木では動きません。

## 再現（coordinator が 2026-10-17 19:3x JST に確かめた）

```
$ cd /home/fuyu/Workspace/retrospectives.ws/ws_retro-dx     # alpha 2875f2d4。@ は空の子
$ dx check --base 'alpha@origin' alpha
exit 1 / 新しい finding 6 件（すべて I-06.verdict）/ 既存 1102 件
$ dx review
exit 1
stderr: FINDINGS: review に不合格または構造の finding があります
stdout: I-06.verdict の finding が 6 行（"missing passing verdict bound to this record, rubric and another author"）
Jev への問い合わせは 0 回。verdict のファイルは 1 つも書かれていない。
```

対象の repo の type の定義は `.dx/retro.ts`。review は `place: "file:<glob>"`。retro の記録の frontmatter には `by` が無いものがある（未確認。確かめること）。

## やること

1. 上の再現を、あなたの手元で取る。retrospectives の workspace は**読むだけ**にし、書き込みは一時のコピーで行う。
2. 原因を特定する。候補は次のとおり。
   - I-10 の事前検査で、I-06 の finding を除外していない
   - REV の既定値（`@`）が空の commit で、対象の選び方が違う
   - 記録に `by` が無いと、I-06 の「作り手と別の判定者」が判定できない
   - それ以外
3. 直す。実際の木の形（`.dx/retro.ts` と同じ type の定義、`by` の無い記録、file の置き場、`alpha@origin` との比較）を、試験の fixture として写して固定する。
4. 受領を取る。retrospectives の workspace を一時の場所に写し（`jj` の clone か、ファイルのコピー）、本物の Jev で `dx review` → `dx check --base 'alpha@origin' @` を流し、I-06 の新しい finding が 0 件になることを確かめる。Jev への問い合わせは 10 回まで。
5. `by` が無い記録を、I-06 でどう扱うかが spec に無い場合は、目的に沿って決めて、`for_coordinator` に書く（spec は coordinator が直す）。

## jj について

- この workspace（dx）の作業コピーの上に commit する。jj のロックが取れなければ、commit しないまま返す。bookmark は動かさない。push しない。

## 返却

- 原因
- 変えたファイル
- 試験
- 受領（`dx review` と `dx check` の終了コード、verdict の件数、Jev の応答）
- `mise run check` の結果
