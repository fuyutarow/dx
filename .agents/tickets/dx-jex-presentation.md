+++
schema = 2
name = "dx-jex-presentation"
outcome = "同じ記録と同じ問いで、渡し方を変えた 5 通りの p を測り、jex の経路で 2 問目の p が下がる原因を、審査対象の指定・記録の見せ方・link 先の有無のどれかに切り分けた表を返す"
writes = ["/tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/dx-jex-presentation/**"]
verify = ["bun -e \"const t=await Bun.file('/tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/dx-jex-presentation/results.json').json(); if (!Array.isArray(t.rows) || t.rows.length < 5) process.exit(1)\""]
timeout_s = 600
premises = []

[proposition]
id = "DX-JEX-PRESENTATION"
claim = "jex の経路で 2 問目の p が下がるのは、渡し方の 1 つの要因（審査対象の指定、記録の見せ方、link 先の有無のどれか）で説明できる"
refuted_by = "5 通りのどれでも p が jev の経路に近づかない、または 3 回の幅が案どうしの差より大きい（その表を返す）"
+++

**dx 0.1.5 の受け入れの試しから切り出した、難しい 1 点の実験（2.5 の例外。2026-10-19）。5 分の時点で、済んだ案と残りの案を 1 枚で results.json に書き足すこと。**

## 事実

- research-record-v2 が、dx 0.1.5 の候補（バイナリの sha256 は 35dd1121…）で本物の jex（0.2.3）の review を試した。採った記録は /tmp/claude-1000/-home-fuyu-Workspace-research-record-v2/0d1c7e39-934e-4582-afa6-faafa2c963a6/scratchpad/dx015-prediction-capture/ にある（summary.json、calls/<呼び出し>/{invocation.json, tmpdir/, request.stdout, response.stdout}、repo/、capture.ts、wrapper/jex）。読むだけで、書かない。
- 同じ記録、同じ rubric で:
  - 0.1.4 の経路（agx worker jev。dx が要求の JSON を組み立て、state に `record` と、`status: "linked repository record"` の印を付けた `repository_evidence` を入れる）: prediction の p は [0.76, 0.82, 0.80] と [0.78, 0.85, 0.81]。
  - 0.1.5 の経路（jex に `questions.toml records/predictions/review-prediction.toml records/statements/review-old.toml` を渡す）: [0.66, 0.49, 0.78] と [0.67, 0.59, 0.82]。2 問目（derived-prediction）が大きく下がる。
  - link 先を持たない仮説の記録（review-old）も、0.1.5 の経路で 2 問目（explicit-content）が 0.47〜0.48 になる。
- jex の `--request` は、送らずに要求を出す。agx worker jev は、stdin の要求の JSON をそのまま Jev に送る。どちらも、このマシンで動く（本物の Jev に届く）。
- dx 0.1.4 のバイナリ: /tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/rel14/bin/dx 。dx 0.1.5 の候補: 同じ場所の rel15/bin/dx 。

## やること

結果は、すべて /tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/dx-jex-presentation/ に書く。どの repo にも書かない。

1. 次の 5 通りで、prediction と review-old の 2 件を、それぞれ 3 回ずつ review する（Jev の呼び出しは合わせて 30 回ほど）。
   - V0: 0.1.4 の経路。採った記録の repo/ を、scratch の写しの上で dx 0.1.4 に `[review] command = ["agx","worker","jev"]` で review させる。要求の JSON も保存する（stdin を写して agx worker jev に渡す小さな wrapper を、scratch に置いてよい）。
   - V1: 0.1.5 の経路のまま（jex に、問い・記録・link 先のファイル）。
   - V2: V1 の記録のファイルの中身を、木の中の元の記録の bytes（TOML の原文）に替えたもの。V1 の中身と同じなら、そう書いて省いてよい。
   - V3: V1 から link 先のファイルを外したもの（prediction のみ）。
   - V4: V1 の questions.toml の各問いの先頭に「審査対象は <記録の path>。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。」を足したもの。
   V1〜V4 は、jex を直接呼んでよい（dx を通さなくてよい）。
2. results.json に、`{ rows: [{ variant, record, run, p: [..], pass }...], summary: [{ variant, record, mean: [..], min: [..], max: [..] }...], request_diff: "<V0 の要求と V1 の要求（jex --request）の形の違いを、箇条で>" }` を書く。
3. 返却に、2 問目の p がどの案で jev の経路（V0）に近づいたか、3 回の幅に比べて差が意味を持つか、の結論を 3 行以内で書く。

## 共通の決まり

- 上限は 10 分。書いてよいのは上の scratch のディレクトリだけ。どの repo にも、bookmark にも、push にも触らない。
- Jev を呼ぶので、ネットワークが要る。呼び出しの数は 40 回を超えない。
- 返却: 結論、results.json の path、未検証。
