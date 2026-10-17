+++
schema = 2
name = "dx-review-fix-422"
outcome = "dx review が組み立てた要求を本物の `agx jev` に渡すと、exit 0 で verdict が返って書かれ、その後の dx check が I-06 を満たす。その受領（要求、応答、終了コード）と、422 の原因が返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 1800
premises = ["file:notes/jev-contract.md", "file:docs/spec.md"]

[proposition]
id = "DX-REVIEW-FIX-422"
claim = "dx review の要求と、notes/jev-contract.md の受領で通った要求の差を埋めれば、Jev は 422 を返さない"
refuted_by = "notes/jev-contract.md の受領と同じ形の要求でも、今の Jev が 422 を返す（その要求と応答を返す）"
+++

**dx-review（run 44799a73）の受け入れ検査で見つかった失敗の修理です。** 範囲は、review の要求の形と、その試験だけです。

## 失敗の事実

あなたの 1 回の問い合わせの受領（`/tmp/dx-review-live-receipt.json`）:

```
dx review → exit 3
REVIEW_UNAVAILABLE: records/20261010_firedancer-coord-retro2610-1010nnzyq.md: review command exited 1: agx jev: endpoint returned HTTP 422
```

一方、`notes/jev-contract.md` の受領では、次の要求が exit 0 で通っている（同じ記録、同じ rubric の問い）。

```json
{"model":"jev-latest","state":{"record":"…","repository_evidence":[],"hex_locators":[]},"questions":{"blameless":{"type":"noul","instructions":"…","criteria":{"true":"…","false":"…"}}}}
```

## やること

1. dx review が実際に `agx jev` に渡している要求の JSON を取り出し、上の通った要求と比べる。差は、フィールド名、型、`model` の有無、`questions` の形、`criteria`、state の値の型（配列か文字列か）など。
2. 原因を 1 つに絞る。必要なら本物の `agx jev` に問い合わせてよい（10 回まで）。各回の要求と応答を記録する。
3. 直す。通った要求の形を、試験の fixture（偽の review コマンドが要求を検査して、形が違えば 422 相当で落ちる）として固定し、二度と崩れないようにする。
4. retrospectives の短い記録の写しを一時 repo に置き、本物の Jev に対して `dx review` → `dx check` を流す。review が exit 0（または、不合格なら 1）で verdict を書き、check が I-06 を満たすことを受領として残す。

## 作業場所の事実

- この workspace の土台は、dx 本体の commit（help の修理を入れる前）。そのため `tests/contracts.test.ts` の C1（help に `USAGE:` があるか）は、coordinator の環境で落ちることが分かっている。修理は別の commit で済んでいて、統合のときに入る。**この試験は直さないでよい。**
- あなたの前の回の変更は、coordinator がこの workspace で commit した。その上に積む。

## jj について

- 今の作業コピーの上に commit する。bookmark `alpha` は動かさない。push しない。

## 返却

- 422 の原因
- 変えたファイル
- 試験
- 本物の Jev に対する受領（要求、応答、終了コード、verdict）
- `mise run check` の結果
