+++
schema = 2
name = "dx-jex-invoke"
outcome = "dx review が、要求の JSON を組み立てずに jex を呼び、jex の出力から verdict を作る"
writes = ["src/commands/review.ts","src/review-request.ts","src/model.ts","src/config.ts","tests/dx-jex-invoke.test.ts"]
verify = ["bun test tests/dx-jex-invoke.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts src/review-request.ts src/model.ts tests/dx-jex-invoke.test.ts"]
timeout_s = 600
premises = ["file:src/commands/review.ts","file:src/review-request.ts","file:src/model.ts"]

[proposition]
id = "DX-JEX-INVOKE"
claim = "dx review が、要求の JSON を組み立てずに jex を呼び、jex の出力から verdict を作る"
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

- 今の dx review は、src/review-request.ts の assembleRequest で Jev の要求の JSON を組み立て、`[review] command`（agx jev）の stdin に渡し、stdout の `{model, answers}` を jevResponseSchema で読む。
- dotfiles は、単独の jev を作らず jex に一本化した（持ち主の判断）。agx jev と agx worker jev は、dx 0.1.5 が出たら消える。
- 型の evidence（FormatAdapter.evidence(file, tree) が返す Evidence[]。src/model.ts:71）は、research-record-v2 が link 先の記録を review に入れるために使っている。

## やること

1. 上の「受け渡しの形」のとおりに、dx review の呼び出しを jex に切り替える。evidence は、locator を path として一時ディレクトリに書き出して渡す（content の無い evidence は渡さない）。一時ディレクトリは、呼び出しの後に必ず消す（`await using` など。try は使わない）。
2. assembleRequest と jevResponseSchema、それだけが使う型と関数を消す。capEvidence と fitEvidence は残してよい。
3. verdictSchema に、任意の field `reasons`（record<string, string>）を足す。既存の verdict（reasons の無いもの、by が process:jev/… のもの）は、そのまま有効である（I-06 は by が process: で始まることだけを見る）。
4. 試験（tests/dx-jex-invoke.test.ts）: 偽の jex（引数と作業ディレクトリのファイルを記録し、決めた stdout と終了コードを返す bun の script）で、次を確かめる。exit 0 で合格の verdict、exit 1 で不合格の verdict と dx の exit 1、exit 3 で exit 3、exit 4 と model の na と bits の欠けで exit 4（verdict を書かない）、questions.toml の形、渡したファイルの path、criteria が 9 つで jex を呼ばずに exit 4、一時ディレクトリが残らないこと。
5. 既存の試験（tests/review.test.ts ほか）の偽の review コマンドは、issue dx-jex-fixture が jex の形に移す。この issue では変えない。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。A（dx-jex-invoke）、B（dx-jex-fixture）、C（dx-jex-docs）が同時に動いている。統合は coordinator が行う。
- 作業コピーは alpha の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- house の規則に従う（throw・try・`as`・入れ子の三項演算子は禁止。neverthrow の Result、fromThrowable、早期 return）。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
