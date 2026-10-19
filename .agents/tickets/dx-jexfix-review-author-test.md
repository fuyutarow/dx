+++
schema = 2
name = "dx-jexfix-review-author-test"
outcome = "0.1.5 の統合の merge で落ちる tests/review-author.test.ts を、jex の呼び出し方に合わせて直す"
writes = ["tests/review-author.test.ts","tests/helpers.ts","tests/fixtures/**"]
verify = ["bun test tests/review-author.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/review-author.test.ts"]
timeout_s = 600
premises = ["file:tests/review-author.test.ts"]

[proposition]
id = "DX-JEXFIX-REVIEW-AUTHOR-TEST"
claim = "0.1.5 の統合の merge で落ちる tests/review-author.test.ts を、jex の呼び出し方に合わせて直す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.5 の統合の lane から返した issue（2026-10-19）。**

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

- "real retrospective policy and six authorless records review into external verdict files from an empty child" が落ちる。dx-jex-invoke と dx-jex-fixture を合わせた後に落ちるようになった。

## やること

1. 落ちる原因を確かめる。fixture の review コマンドが古い呼び出し方を前提にしていれば、共通の偽の jex を使う形に直す。verdict の `by` は `process:jex/<model>` になる（既存の verdict の `process:jev/…` も有効のまま）。確かめる内容（著者のない 6 つの記録が、空の子から review され、verdict が .dx/ の外に書かれること）は変えない。
2. 原因が src の欠陥であれば、直さずに、その箇所と理由を返す。

## 共通の決まり

- 上限は 10 分。書いてよいファイル（この試験のファイルと、共通の偽の jex を直す必要があれば tests/helpers.ts と tests/fixtures/）だけを変える。ほかの 2 つの issue が同時に、ほかの試験のファイルを直している。
- 作業コピーは統合の merge（01fcb3be103d）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。house の規則（throw・try・`as`・入れ子の三項演算子は禁止）に従う。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
