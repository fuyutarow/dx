+++
schema = 2
name = "jev-contract"
outcome = "notes/jev-contract.md に、`agx jev` が受け付ける要求の JSON と、返す応答の JSON の形（フィールド、型、上限、失敗のときの形）が、retrospectives の review.ts の実装と、実際に 1 回問い合わせた受領（要求、応答、終了コード）を根拠にして書かれて返る"
writes = ["notes/jev-contract.md"]
verify = ["test -s notes/jev-contract.md"]
timeout_s = 1200
premises = ["file:/home/fuyu/Workspace/retrospectives/tools/review/review.ts", "file:/home/fuyu/Workspace/retrospectives/tools/review/retro-review-v4.toml"]

[proposition]
id = "JEV-CONTRACT"
claim = "agx jev の要求と応答の形は、review.ts の実装と 1 回の実際の問い合わせから、dx review が依存できる契約として書き下せる"
refuted_by = "agx jev が応答しない、または review.ts が agx jev を使っていない（どちらも理由と受領を返す）"
+++

**読み取りと、1 回の問い合わせだけの調査です。** どの repo のファイルも変えない。書いてよいのは `notes/jev-contract.md` だけ。

## 背景

dx（`docs/spec.md` 版 1）の `dx review` は、`dx.toml` の `[review] command`（既定は `["agx", "jev"]`）に、stdin で JSON の要求を 1 つ渡し、stdout で JSON の答えを受け取る。今それを実際に使っているのは、retrospectives の `tools/review/review.ts`。dx review は、その要求の組み立て方を一般化して持ってくる予定である。そのために、契約を先に固めたい。

## やること

1. `/home/fuyu/Workspace/retrospectives/tools/review/review.ts` を読み、次のことを file:line で書く。
   - Jev への要求の JSON の組み立て方（state、questions、keys、model などのフィールド）
   - 根拠の文書の集め方と、30,000 バイトの上限（`REVIEW_INPUT_LIMIT_BYTES`）
   - UTF-8 を壊さない切り詰め
   - 応答の読み方（bits、p）
   - 本文の sha256 の計算（`recordSha256`、`withoutReview`）
2. review.ts が Jev をどう呼んでいるかを確かめる（`agx jev` か、それ以外か）。
3. `agx jev --help` を読み、小さな要求を 1 回だけ実際に投げて、受領（要求、応答、終了コード）を記録する。題材は、`/home/fuyu/Workspace/retrospectives/records/` の短い記録 1 件と、retro-review-v4.toml の問い 1 つ。
4. 失敗の形も書く: 届かないとき、上限を超えたとき、応答の形が違うとき。それぞれの終了コードと出力。
5. dx review が依存してよい部分（安定）と、review.ts の中だけの都合（retro に固有のパスなど）を分けて書く。

## 返却

`notes/jev-contract.md` に、日本語で次を書く。

- 要求の JSON の形
- 応答の JSON の形
- 上限
- 失敗の形
- 受領（実際の要求、応答、終了コード）
- dx review に持ってくる関数の一覧（file:line）

確かめた事実と推測を分けて書く。
