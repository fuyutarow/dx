+++
schema = 2
name = "dx-review"
outcome = "dx に spec.md 版 1 の `dx review [REV]` が加わる。rubric を持つ type の記録のうち、新しいものと変わったもので check の finding が無いものについて、`[review] command` に要求を渡し、verdict を `review.place` に書く。I-06 と I-10 を一時の jj repo と偽の review コマンドで確かめ、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 3600
premises = ["file:docs/spec.md", "file:notes/jev-contract.md", "file:/home/fuyu/Workspace/retrospectives/tools/review/review.ts"]

[proposition]
id = "DX-REVIEW"
claim = "retrospectives の review.ts の要求の組み立て（根拠の収集、30,000 バイトの上限、UTF-8 を壊さない切り詰め、応答の読み取り）は、retro 固有の部分を type の定義に移せば、dx review として一般化できる"
refuted_by = "notes/jev-contract.md の契約と spec.md §5 の review の規定が、同時に満たせない（その箇所を返す）"
+++

**仕様は `docs/spec.md`（版 1）。`agx jev` の契約は `notes/jev-contract.md`。** 最初に両方を読んでください。spec.md は書き換えないでください。食い違いは目的に沿って解き、返却の `for_coordinator` に書いてください。

## この issue の範囲

`dx review [REV]` を足します（spec §5 の表、C2 の review の行、C3 の verdict の形、C4）。

- 対象は、`.dx/` の type が `review` を宣言している記録のうち、base（`<branch>@<remote>`）から見て新しいものと変わったもの。
- check の finding がある記録には要求を出さない（I-10）。その記録は stdout に出して、終了コード 1 にする。
- 今の sha256 と今の rubric の sha256 に結びついた合格の verdict がすでにある記録は飛ばす。
- 要求は `[review] command` に stdin で 1 つ渡し、stdout の JSON を受け取る。既定は `["agx","jev"]`。
- 要求の組み立ては、retrospectives の `tools/review/review.ts` の `capEvidence`、`fitEvidence`、`assembleBits`、`runAgx`、`evaluate` を持ってきて一般化する（`notes/jev-contract.md` の最後の表）。
  - retro 固有の部分は dx 本体に固定しない。対象はパス、frontmatter の `review:` を除く規則、リンクの解決の方針。これらは type の定義（`review.place`、`format` のアダプタ）の側で決める。
- 上限は 30,000 バイト（要求全体）。記録と問いは切り詰めない。上限を超えたら、その記録は終了コード 4 で返す（spec R-8）。
- verdict の形は `{"v":1,"id","sha256","rubric","rubric_sha256","by","at","bits","p":[…],"pass":bool}`。
  - `by` は `process:jev/<応答の model>`。
  - `pass` は、すべての問いで `p >= [review] pass` のとき true。
- `review.place = "frontmatter"` なら、記録の frontmatter の `review:` に書く。そのときも記録の sha256 は変わらないことを確かめる（review.ts の `writeReview` と同じ確かめ方）。
- `review.place = "file:<glob>"` なら、別のファイルに書く。
- review コマンドに届かない、時間切れ（1 件 120 秒）、応答の形が違う → 終了コード 3。verdict は書かない。
- dx-core が作った `check` の I-06 の読み取りと、同じ verdict の形・置き場を使うこと（形を二重に定義しない）。

## 試験

- 試験は、一時の jj repo と、**偽の review コマンド**（決まった JSON を返す小さな script）で行う。実在の Jev は試験で呼ばない。
- 次のことを、それぞれ試験で確かめる。
  - 合格の場合、不合格の場合、check の finding がある記録に要求を出さないこと、すでに合格している記録を飛ばすこと
  - 上限超過で 4、届かないときと形が違うときに 3
  - frontmatter に書いても sha256 が変わらないこと
  - review の後の `dx check` が I-06 を満たすこと
- 受領として、retrospectives の短い記録 1 件の写しを一時 repo に置き、実際の `agx jev` に 1 回だけ問い合わせて、結果を返却に載せる（試験のファイルには入れない）。

## 作業場所の事実

- この workspace は、dx-core を統合した後の dx の `alpha` から作る。`src/commands/` の構成と、記録のモデルは dx-core のものを使う。

## jj について

- commit は 1 つにまとめてよい。bookmark `alpha` は動かさない。push しない。

## 止まる方針

小さな食い違いは目的に沿って解き、返却に書いてください。

## 返却

- 変えたファイル
- 試験の一覧
- 実際の Jev への 1 回の受領
- `mise run check` の結果
- spec との食い違い
- 未検証のこと
