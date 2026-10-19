+++
schema = 2
name = "dx-r16-measured"
outcome = "spec の残差 R-16 を、research-record-v2 が 0.1.6 で取り直した 90 件の数で書き直す"
writes = ["docs/spec.md"]
verify = ["git diff --check docs/spec.md"]
timeout_s = 600
premises = ["file:docs/spec.md"]

[proposition]
id = "DX-R16-MEASURED"
claim = "R-16 は、測った数だけで書ける"
refuted_by = "git diff --check が通らない"
+++

**dx の spec の更新（2026-10-19）。作業コピーは dx の alpha の子である。**

## 事実（research-record-v2 の 0.1.6 での取り直し。alpha 3b809485 の docs/jex-rereview-016.json）

- 対象は 90 件。jex 0.2.4、1 回ずつ。
- 同じ rubric で比べられる記録で、jev の経路で合格、jex の経路で不合格になったもの（flip）: 0.1.5 で 11 件（すべて statement の explicit-content）→ 0.1.6 で 1 件。
- 残る 1 件は pe4-flip-clarified-seed1-observation。p は jev [0.83, 0.54, 0.92]、0.1.5 [0.91, 0.32, 0.81]、0.1.6 [0.82, 0.46, 0.91]。jev の経路でも 2 問目は 0.54 で、合格の線（0.5）の近く。
- すべての flip は 22 件 → 9 件。9 件のうち 8 件は、問いの違う旧 rubric（record.toml の 1 問）の verdict との比較で、参考扱い。
- jex の入力の上限（30000 bytes）で、42 件の要求の link 先が切り詰められていた。審査対象の 90 件の本文は、すべて完全に渡っている。0.1.4 の jev の経路も、同じ 30000 bytes の予算で link 先を削っていた（前後の切り詰めの件数は比べていない）。
- reasons は、238 問すべてが {na:true, why} だった（Jev が理由の文を返さない）。
- 0.1.6 の前の実験（notes/jex-presentation/results.json）では、prediction の 2 問目は 0.61 だった。0.1.6 の本物の review では 0.80（1 回）。

## やること

1. docs/spec.md §10 の R-16 の行を、上の数で書き直す。中身: 残差は「同じ rubric で 1 件の flip（合格の線の近くの記録）」と「link 先の切り詰め（90 件中 42 件）」の 2 つ。どちらも判定が厳しくなる向きで、悪い記録が入る向きではない。持ち主は dx（予算の配り方）と jex（入力の上限）。見張り方: 合否の変わる記録が出たら、記録の id と p で報告を受ける。link 先の切り詰めが合否を変えた例が出たら、予算の配り方を見直す。
2. 数の出どころ（research-record-v2 の alpha 3b809485 の docs/jex-rereview-016.json）を 1 行で書く。
3. `.md` には oxfmt をかけない。R-16 の行だけを直す。

## 共通の決まり

- 上限は 10 分。docs/spec.md の R-16 の行だけを変える。jj: commit しない。bookmark は動かさない。push しない。
- 返却: 書き直した行、verify の結果。
