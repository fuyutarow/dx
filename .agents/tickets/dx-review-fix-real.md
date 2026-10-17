+++
schema = 2
name = "dx-review-fix-real"
outcome = "記録に by が無いときの I-06 の扱いが、spec.md（I-06 の行）のとおりに review と check で一致し、retrospectives の実際の木を写した一時の repo で、本物の Jev による dx review が 6 件の verdict を file の置き場に書き、その後の dx check --base 'alpha@origin' @ で I-06 の新しい finding が 0 件になる。実際の木の形を写した回帰試験があり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/commands/review.ts", "file:src/checks.ts"]

[proposition]
id = "DX-REVIEW-FIX-REAL"
claim = "記録に by が無いとき、機械の判定者（by が process: で始まる）の verdict だけを認めるように review と check をそろえれば、retrospectives の実際の記録に review をかけられる"
refuted_by = "Jev の verdict の by が process: で始まらない（実際の応答の model と by を返す）"
+++

**owner の repo で見つかった dx review の欠陥の修理です。この brief は、前の回（run fba1940f）の返却を受けて書き直した最新版です。**

## 前の回で分かった原因（あなたの返却）

- `src/commands/review.ts:97` は、I-06.verdict を I-10 の事前検査からすでに除外している。
- しかし `src/commands/review.ts:118-120` の `record.by === undefined` の分岐が、I-06 の finding を戻して `continue` している。そのため Jev が呼ばれない。
- `src/checks.ts:257` も、`record.by !== undefined` を合格の条件にしている。
- retrospectives の 6 件の記録は、すべて `by` を持たない。
- 証拠: `/tmp/dx-review-real-KQMpu6/`（cause.json、reproduction.json、copy.json、repro/）

## 決定（coordinator が spec.md の I-06 の行に書いた）

> verdict の `by` は、記録の `by` と違う。記録に `by` が無いときは、作り手と判定者の違いを確かめられないので、`by` が `process:` で始まる（機械の判定者の）verdict だけを認める。

著者をでっち上げてはいけない。記録に `by` を足してもいけない。

## やること

1. `review.ts` と `checks.ts` を、上の決定にそろえる。`by` の無い記録にも review は Jev を呼ぶ。check は、`process:` で始まる verdict なら合格として扱う。
2. 回帰試験を足す。次の 3 つを確かめる。
   - `by` の無い記録に、機械の判定者の verdict がある → 合格
   - `by` の無い記録に、人や agent の判定者（`process:` で始まらない）の verdict がある → I-06
   - `by` のある記録で、判定者が作り手と同じ → I-06（今の振る舞いを保つ）
3. 受領を取る。前の回の一時 repo（`/tmp/dx-review-real-KQMpu6/repro/`）で、本物の Jev に `dx review` を流す（6 件。問い合わせは 10 回まで）。その後 `dx check --base 'alpha@origin' @` を流し、I-06 の新しい finding が 0 件になることを確かめる。verdict の各件の `by`、`pass`、`p` を返す。不合格の記録があれば、その記録と `p` を返す（それ自体は受け入れを妨げない）。

## jj について

- この workspace の作業コピーの上に commit する。jj のロックが取れなければ、commit しないまま返す。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- 試験
- 受領（`dx review` と `dx check` の終了コード、6 件の verdict）
- `mise run check` の結果
