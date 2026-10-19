+++
schema = 2
name = "dx-jexfix-shared-sidecar"
outcome = "jex に切り替えた dx review で、試験「sidecar glob, shared JSON and TOML storage satisfy I-06 and retries」が通る"
writes = ["src/commands/review.ts", "src/review-request.ts", "tests/review.test.ts"]
verify = ["bun test tests/review.test.ts -t \"sidecar glob, shared JSON and TOML storage satisfy I-06 and retries\" && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts src/review-request.ts tests/review.test.ts"]
timeout_s = 600
premises = ["file:src/commands/review.ts", "file:tests/review.test.ts"]

[proposition]
id = "DX-JEXFIX-SHARED-SIDECAR"
claim = "jex に切り替えた dx review で、試験「sidecar glob, shared JSON and TOML storage satisfy I-06 and retries」が通る"
refuted_by = "試験の期待が、jex の受け渡しの形と両立しない（その箇所を返す）"
+++

**dx 0.1.5 の統合の lane から返した issue（2026-10-19）。作業コピーは ec1a2f44（tests/review.test.ts を jex の形に直しかけた commit）の子である。**

## 受け渡しの形（A・B・C に共通。dotfiles の jex 0.2.3 の約束）

- dx は、`[review] command` の後ろに引数を足して呼ぶ: `<command…> questions.toml <記録の path> <evidence の path…>`。作業ディレクトリは、dx が作る一時ディレクトリである。記録と evidence は、repo の中の path（`records/x.md` など）で、その一時ディレクトリに書き出す。path は相対で渡す。
- questions.toml の形: `schema = 1`、`[[question]]` の表を最大 8 つ（`id` と `text`）。dx の rubric の `[[criteria]]` の `id` と `question` から作る。criteria が 8 つを超えれば、jex を呼ばずに exit 4（`UNDETERMINED:review: <rubric>: jex の問いは 8 つまで`）。
- jex の stdout は JSON の 1 値: `{ "model": string | { "na": true, "why": string }, "bits": [{ "id": string, "p": number, "reason": string }], "refuted"?: { "p": number, "reason": string } }`。exit 0 と exit 1 のとき、必ず出る。exit 4 でも、答えが届いて検証に落ちたときは出る。
- 終了コード: 0 = すべて p ≥ 0.5、1 = どれかが「いいえ」、2 = 使い方の誤り、3 = Jev に届かない、4 = 判定できない（入力が 30000 bytes を超えたときを含む。黙って切り詰めない）。
- dx の扱い:
  - exit 0 と 1: stdout から verdict を作る。各 criteria の p は、bits の同じ id の p。pass はすべての p ≥ 0.5（REVIEW_PASS）。verdict の `by` は `process:jex/<model>`、`model` は model の文字列。reason は、verdict の任意の field `reasons`（id → reason）に残す。
  - model が `{ na: true }`、bits に criteria の id が欠ける、stdout が形に合わない: exit 4（UNDETERMINED）。verdict は書かない。
  - exit 3: REVIEW_UNAVAILABLE（exit 3）。exit 2 と 4: UNDETERMINED（exit 4）。どれも verdict は書かない。
- 大きさ: 記録と問いは切り詰めない。evidence は、今の fitEvidence の決まりで、合わせて 30000 bytes に収める（jex の上限と同じ）。収まらなければ exit 4。

## 事実

- 試験「sidecar glob, shared JSON and TOML storage satisfy I-06 and retries」が落ちる。複数の記録の verdict を 1 つの sidecar のファイル（JSON と TOML）にまとめて書いたとき、dx check が I-06.verdict を 2 件返す。書き足すべき所で上書きしている、または読み戻しで記録との結びつきを失っている疑いがある（未確認）。
- tests/review.test.ts のほかの 12 件は通る。残りの 2 件の失敗は、別の issue が同時に直している。

## やること

1. 落ちる原因を確かめる。試験が確かめている性質を仕様とし、src（src/commands/review.ts、src/review-request.ts）の欠陥なら、src を直す。試験が古い呼び出し方（stdin の JSON、`{model, answers}`、Jev 用の by の値）を前提にしている箇所だけは、試験のほうを受け渡しの形に合わせて直してよい。
2. 試験の名前と、確かめる性質は変えない。ほかの試験の期待値を変えない。
3. 原因と、直した箇所を返却に書く。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの 2 つの issue が同時に、同じファイルの別の試験を直している（統合は coordinator が行う）。
- 依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。house の規則（throw・try・`as`・入れ子の三項演算子は禁止）に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 原因、変えたファイル、verify の結果、決めた読み、未検証。
