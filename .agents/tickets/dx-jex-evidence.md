+++
schema = 2
name = "dx-jex-evidence"
outcome = "dx review が、型の evidence（link 先の記録）を jex の引数のファイルとして必ず渡す。research-record-v2 の prediction の review で、link 先が渡らなかった原因を突き止めて直す"
writes = ["src/commands/review.ts", "src/review-request.ts", "tests/dx-jex-evidence.test.ts"]
verify = ["bun test tests/dx-jex-evidence.test.ts tests/dx-jex-invoke.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts src/review-request.ts tests/dx-jex-evidence.test.ts"]
timeout_s = 600
premises = ["file:src/commands/review.ts", "file:src/review-request.ts"]

[proposition]
id = "DX-JEX-EVIDENCE"
claim = "型の evidence が content を持つなら、dx はそれを jex の引数のファイルとして渡す"
refuted_by = "research-record-v2 の型の evidence が、dx の外の理由（型の側の条件）で空を返している（その条件を返す）"
+++

**dx 0.1.5 の受け入れの試しから返した issue（2026-10-19）。作業コピーは dx の alpha（c8e360f5、0.1.5 の候補）である。難しい 1 点の切り出し（2.5 の例外）。5 分の時点で、済んだことと残りを 1 枚で返却に書き足すこと。**

## 事実

- research-record-v2 が、本物の jex（0.2.3）で 0.1.5 の候補の review を試した。scratch は /tmp/rr2-dx015-reprobe.1aHnvd（commands.json に、全コマンド、終了コード、生の出力がある）。
- 0.1.4 の経路（agx worker jev）では、review の要求の state に `record` と `repository_evidence: [{locator, status: "linked repository record", content: <link 先の仮説>}]` が入っていた。research-record-v2 の型の format（review-format.ts、researchToml）の evidence が返したものである。
- 0.1.5 の jex の呼び出しは `args = ["questions.toml","records/statements/review-old.toml"]` で、evidence のファイルが 1 つも渡っていない。prediction の review の 2 問目（予測が link 先の仮説から導かれているか）の p が 0.82 から 0.49 に落ち、不合格になった。
- src/commands/review.ts:200 は `adapter.evidence?.(source, tree)` を呼び、:78-99 で content のある evidence を一時ディレクトリに書いて引数に足す作りである。

## やること

1. 原因を突き止める。research-record-v2 の repo（/home/fuyu/Workspace/research-record-v2 の alpha、読むだけ。書かない）の .dx/ の型と review-format.ts を読み、0.1.5 の review の経路で evidence がどこで空になるか（adapter が別の hook で evidence を返している、tree の渡し方が違う、fitEvidence が落とした、locator の path の扱い、など）を確かめる。
2. dx の側の不具合なら、src/commands/review.ts（と src/review-request.ts）で直す。0.1.4 の経路で要求に入っていた evidence は、0.1.5 でも、content のあるものをすべてファイルとして渡す。予算（30000 bytes）を超えるときの削り方は、0.1.4 と同じ決まり（記録と問いは削らない。evidence を先に削る）。
3. 試験（tests/dx-jex-evidence.test.ts）: link 先の記録を evidence として返す型で、偽の jex（tests/fixtures/fake-jex.ts）に、その link 先のファイルが引数と作業ディレクトリの中身として渡ることを確かめる。research-record-v2 の型と同じ形の evidence（locator が repo の path、status、content）を使う。
4. 原因が research-record-v2 の型の側にあるなら（dx の外）、直さずに、その箇所と理由を返す。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。全体の検査は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。house の規則（throw・try・`as`・入れ子の三項演算子は禁止）に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 原因、変えたファイル、verify の結果、未検証。
