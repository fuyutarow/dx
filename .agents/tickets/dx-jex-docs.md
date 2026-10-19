+++
schema = 2
name = "dx-jex-docs"
outcome = "spec と README を、dx review が jex を呼ぶ形に合わせる。D9 を書き直し、SDK の package の固定の仕方を書く"
writes = ["docs/spec.md","README.md"]
verify = ["git diff --check docs/spec.md README.md"]
timeout_s = 600
premises = ["file:docs/spec.md","file:README.md"]

[proposition]
id = "DX-JEX-DOCS"
claim = "spec と README を、dx review が jex を呼ぶ形に合わせる。D9 を書き直し、SDK の package の固定の仕方を書く"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.5 の issue（2026-10-19）。dx review を jex に切り替える。**

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

- spec の D9 は「dotfiles の rubric の道具（`rubric request R a b | agx jev | rubric bits`）ができたら、dx review をその pipeline に切り替え、src/review-request.ts を消す」としている。dotfiles には rubric の道具は無く、作る予定もない（2026-10-19 の dotfiles の答え）。持ち主の判断で、dx review は jex を呼ぶ。
- soks は、.dx/package.json で dx の SDK の package を tag 名（v0.1.4）で解決できず、release の commit（88b0dfc2）で固定した。

## やること

1. §9 の D9 を書き直す: dx review は `[review] command`（例 `["jex"]`）を、受け渡しの形のとおりに呼ぶ。dx は rubric を jex の問いの TOML に変え、記録と evidence を一時ディレクトリに書いて渡し、bits と終了コードから verdict を作る。要求の JSON は組み立てない。経緯（rubric の道具の前提が崩れたこと、持ち主の判断）を 1 行で残す。
2. §5 の review の行と CLI CONTRACT（C2・C4）に、jex の終了コードの扱い（受け渡しの形の「dx の扱い」）を書く。§6 の `[review] command` の例を `["jex"]` にし、dx は既定を持たないことを残す。
3. README の review の説明を合わせる。SDK の package は、release の commit で固定する書き方（例 `"dx": "github:fuyutarow/dx#<release の commit>"`）を、tag 名が解決できない場合の手として書く。
4. `.md` には oxfmt をかけない。直すのは上の節だけ。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。A（dx-jex-invoke）、B（dx-jex-fixture）、C（dx-jex-docs）が同時に動いている。統合は coordinator が行う。
- 作業コピーは alpha の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- house の規則に従う（throw・try・`as`・入れ子の三項演算子は禁止。neverthrow の Result、fromThrowable、早期 return）。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
