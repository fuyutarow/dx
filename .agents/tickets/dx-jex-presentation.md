+++
schema = 2
name = "dx-jex-presentation"
outcome = "同じ記録と同じ問いで、渡し方を変えた 5 通りの p を測り、jex の経路で 2 問目の p が下がる原因を、審査対象の指定・記録の見せ方・link 先の有無のどれかに切り分けた表を返す"
writes = ["notes/jex-presentation/**"]
verify = ["bun -e \"const t=await Bun.file('notes/jex-presentation/results.json').json(); if (!Array.isArray(t.rows) || t.rows.length < 5) process.exit(1)\""]
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
- dx 0.1.4 のバイナリ: /tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/rel14/bin/dx 。dx 0.1.5（公開版、bin/dx の sha256 は 215d3d54…）: 同じ場所の rel15b/bin/dx 。

## やること

結果は、すべて notes/jex-presentation/ に書く。dx の作業コピーの notes/jex-presentation/ だけに書く（作業用の写しや wrapper は、/tmp の自分のディレクトリに置いてよい）。ほかの repo には書かない。

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

- 上限は 10 分。書いてよいのは notes/jex-presentation/ と、/tmp の自分の作業ディレクトリだけ。ほかの repo、bookmark、push には触らない。commit しない。
- Jev を呼ぶので、ネットワークが要る。呼び出しの数は 40 回を超えない。
- 返却: 結論、results.json の path、未検証。

## 前の回の返却を受けて（coordinator、2026-10-19 20:15。最新版）

- jex は 0.2.4 を使う。0.2.4 は reason の形を変えた版（dotfiles 8268fd6a。reason は Jev の文か {na:true, why}）で、dx 0.1.5 を使う repo が実際に呼ぶのはこれである。p の求め方は変わっていない。
- V0（agx worker jev の経路）は流さない。agx jev と agx worker jev は 20:06 に消えた（dotfiles の持ち主の決定）。V0 の値は、research-record-v2 が記録したものを使う: prediction は [0.76, 0.82, 0.80] と [0.78, 0.85, 0.81]（alpha 22038792 の docs/review-command-result.json と、19:42 の送り直し）。review-old の jev の値は、その記録にあれば使い、無ければ「無し」と書く。V0 の要求の形は、capture の中の 0.1.4 の要求（あれば）か、research-record-v2 の review-format.ts から読み取って、request_diff に書く。
- V1〜V4 は jex 0.2.4 で流す。Jev の呼び出しは 30 回を超えない。

## 2 回目の返却を受けて（coordinator、2026-10-19 20:30。最新版）

- V0 と V1 の要求の違いのうち、dx の側で落としていたものが 2 つ見つかった: (a) どの問いにも付いていた前置き「Evaluate ONLY the supplied record and repository_evidence…」（中身をデータとして扱い、外の仮定を禁じる文）、(b) rubric の基準の true と false の文。dx 0.1.5 の questions.toml は id と text だけで、この 2 つを落としている。jex の問いの TOML の text に入れれば、jex を変えずに渡せる。
- 追加の 2 案を、V1〜V4 と同じやり方で、prediction と review-old をそれぞれ 3 回ずつ流す（Jev の呼び出しは 12 回）。結果は同じ results.json に足す。
  - V5: V1 の各問いの text を、次の順に組み立てる。1 行目「審査対象は <記録の path>。ほかのファイルは、審査対象が link している記録で、審査の対象ではない。」、2 行目に V0 の前置き（V0 の要求の文面をそのまま）、3 行目に rubric の問い、4 行目「はい: <criteria の true の文>」、5 行目「いいえ: <criteria の false の文>」。true と false の文は、research-record-v2 の rubric（.dx/rubrics/）から読む。
  - V6: V5 の記録のファイル（審査対象と link 先）の中身を、木の中の元の bytes（TOML の原文）に替えたもの。
- 返却に、V5 と V6 の 2 問目が V0（0.835）にどこまで近づいたか、反復の幅に比べて意味があるか、1 問目と 3 問目が V0 から離れていないか、を 3 行以内で書く。

## 3 回目の返却を受けて（coordinator、2026-10-19 20:40。最新版）

- research-record-v2 の rubric には true と false の文が無い（id、bit、question だけ）。V0 の要求の criteria.true と criteria.false の文は、dx 0.1.4 が要求を組み立てるときに足していたもの、と見る。
- V5 と V6 の true と false の文は、保存してある V0 の要求（capture の中の 0.1.4 の要求）の文面を、そのまま使う。前置きも同じく V0 の要求から取る。2 件の記録とも、その記録の V0 の要求の文を使う。review-old の V0 の要求が無ければ、prediction の V0 の要求の文を、問いの id ごとに当てる（id が合わなければ、文の型（はい・いいえの言い回し）だけを借りて、その問いに合わせて書く。その場合は返却に書く）。
- 返却に、V0 の要求で true と false の文がどこから来ていたか（dx 0.1.4 の src/review-request.ts の決まった文か、research-record-v2 の review-format.ts か）を 1 行で書く（git show 88b0dfc2:src/review-request.ts で読める）。
