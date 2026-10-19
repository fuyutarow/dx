# dx 仕様

版: 1（2026-10-17 確定）。**この文書が dx の唯一の仕様である。**

- 設計の論証と、3 システムの観察は [design.md](design.md) と `notes/genealogy/` に置く。両者の内容が食い違ったら、この文書を正とする。
- 旧い草案の `cli.md`、`config.md`、`needs.md` は、この文書にまとめて消した（履歴は git にある）。

## 0. 目的

**dx は、記録を「構造の検査」と「Jev による review」の両方に通したものだけを正規の branch に入れ、入ったものを書き換えさせない道具である。**

1 つの道具を、retrospectives・soks・research_record のどの repo にも同じように使う。repo ごとの決まりは、各 repo の `.dx/` に書く。

## 1. 用語

| 用語 | 意味 |
|---|---|
| repo | dx が相手にする jj（git）の repository。ルートに `dx.toml` を持つ |
| 記録 | `.dx/` の type の `match` に当たるファイルから読み出した、1 件の単位。1 つのファイルから複数の記録を読むこともある（research_record の fragment） |
| type | 記録の種類。`.dx/<type>.ts` に定義する（retrospectives なら retro、soks なら evi・sok・pro・led） |
| 正規の branch | `dx.toml` の `branch`（既定は `alpha`）。remote 側のものが正本 |
| 受け入れる | 記録を正規の branch に入れること。**受け入れた ⇔ remote の正規の branch から到達できる** |
| finding | `dx check` の指摘 1 件 |
| verdict | `dx review` の結果 1 件。記録の sha256 と rubric の sha256 に結びつく |
| rubric | Jev に問う問いの集まり（`.dx/rubrics/*.toml`） |
| view | `.dx/` の type が定義する、読み取り専用の計算結果（索引、status など） |

## 2. 責務の分け方

| 持ち主 | 持つもの | 持たないもの |
|---|---|---|
| **dx** | 記録を読み出すこと（`ls`）、構造の検査（`check`）、Jev を呼んで verdict を記録に結びつけること（`review`）、受け入れ（`land`）、view の計算（`view`） | 下のすべて |
| **repo の `.dx/`** | type の定義（置き場所、形式、id、schema、links、immutable、その type だけの checks、rubric と verdict の置き場、views） | 実行の手順 |
| **repo の `dx.toml`** | 配線の値（名前、remote、branch、review のコマンド、上限、読まないファイル） | 規則 |
| git / jj | 保存、履歴、原子性、同時に書いたときの調停、パスを選んだ commit（`jj commit <paths>`）、blob | 記録の意味 |
| Jev（`agx jev`） | review の推論そのもの | 何を問うか |
| agx | 書き手ごとの workspace、作業の割り振り | 受け入れ |
| harness（Claude Code / Codex の設定） | 書いている途中に止めること、正規の作業木への直接の書き込みを止めること | 受け入れ |
| push の権限を持つ人 | `dx land` を通らない push を止めること | — |
| rr / ccc | 検索 | — |
| run | 実験の実行の観測 | 受け入れ |
| 使う側（firedancer など） | 研究の比較と再現（leaderboard） | — |

**dx は hosting（GitHub など）の機能に依存しない。** 使うのは、git の remote への fetch と push だけである。

## 3. User story / Negative space / Invariant

分割の軸:

- user story は「行為者 × 記録の一生の段階」で分ける。
- negative space は「その仕事の持ち主（dx の外）」で分ける。
- invariant は「性質ごとに、確かめる場所を 1 つ」に置く。

| ID | 行為者 | 段階 | 内容 |
|---|---|---|---|
| US-01 | 書き手 | 書く | 自分の workspace で記録を書き、`dx check` で構造を確かめる |
| US-02 | 書き手 | review | 構造が通った記録について `dx review` を流し、verdict を得る |
| US-03 | 書き手 | 受け入れ | `dx land` で、構造と verdict の両方が通った変更を入れる |
| US-04 | 読み手 | 読む | `dx ls` と `dx view` で、ある revision の記録と view を読む |
| US-05 | repo の保守者 | 規則を変える | `.dx/` を変えて land する |
| US-06 | 監査する者 | 読む | `dx check --base A B` で、正規の branch の任意の範囲を後から判定する。`--policy alpha` で規則を読む revision を別に指定し、規則を持たない過去の履歴も今の規則で判定できる |

| ID | dx がしないこと | 持ち主 |
|---|---|---|
| N-01 | 保存、履歴、複製、blob の管理 | git / jj、repo の持ち主 |
| N-02 | review の推論 | Jev |
| N-03 | 書いている途中に止めること、正規の作業木への直接の書き込みを止めること | harness |
| N-04 | `dx land` を通らない push を止めること | push の権限を持つ人 |
| N-05 | 実行の観測、作業の割り振り | run / agx |
| N-06 | 検索と問い合わせの言語 | rr / jq |
| N-07 | 研究の比較と再現 | 使う側 |
| N-08 | git の外に状態を持つこと（受領記録、ジャーナル、ロック） | —（作らない） |

| ID | 性質 | 確かめる場所 |
|---|---|---|
| I-01 | 受け入れた ⇔ remote の正規の branch から到達できる | land |
| I-02 | 同じ規則 revision（既定は head、指定時は `--policy REV`）の設定・型定義・inputs で base と head の両方を数えて、新しい finding が無い。加えて、新しい記録と変わった記録は、自分に関わる finding（`id` が自分、または `ids` に自分を含むもの）を既存のものも含めて 1 つも持たない。複数記録に関わる finding は、その `ids` のどれか 1 つでも新しいか変わった記録なら new とする。さらに、head で記録を 1 つも生まないファイル（`dx.toml`、`.dx/`、inputs、読めなかった記録のファイルなど）は、bytes で判定する。`finding.path` がそのようなファイルを指し、base と head の木で bytes が違う、または片方にしか無いなら、base に同じ key があっても new とする。記録を生むファイルは、記録の sha256 で判定する（同じファイルの別の記録や、review のメタデータを変えても、触れていない記録の finding は既存のまま）。`--policy` を指定しても、比べる木は base と head であり、policy の revision ではない。記録の ID と、記録を生まないファイルの bytes の、どちらにも変更がなければ既存 finding は残してよい（2026-10-17 に強化。soks-govern の L と retrospectives の gate がどちらも「変えた記録は潔白に」を求めていたため。2026-10-18 に複数記録 finding の `ids` に適用を拡張。同日、記録を生まないファイルにも拡張。policy-rev のもとで、壊れた inputs を入れる commit が既存の finding として通る穴を塞ぐため） | check |
| I-03 | `immutable` の type の記録は、変わらず、消えない | check |
| I-04 | links は宣言された type を指し、参照先がある。acyclic（既定 true）が true の辺だけで作るグラフは循環しない | check |
| I-05 | id は重複せず、付け替えられない | check |
| I-06 | rubric を持つ type の記録で、新しいものと変わったものはすべて、今の記録の sha256 と今の rubric の sha256 に結びついた合格の verdict を持つ。verdict の `by` は、記録の `by` と違う。記録に `by` が無いときは、作り手と判定者の違いを確かめられないので、`by` が `process:` で始まる（機械の判定者の）verdict だけを認める | check |
| I-07 | `ls`、`check`、`view` は副作用が無く決定的である。判定できなければ終了コード 4 を返し、空の成功にしない | 各コマンド |
| I-08 | 正規の branch は、check を通った commit への fast-forward でだけ動く | land |
| I-09 | `.dx/`、`[files] inputs` に当たるファイル、または inputs 宣言を変える change は、ほかの記録を一緒に変えない。`check --policy` を明示した場合は検査しない | check |
| I-10 | review は、check の finding が無い記録にだけ Jev を呼ぶ。そのため、既存の finding を持つ旧い記録を変えるときは、先にその記録の finding をすべて消す必要がある（rubric を持つ type の場合。retrospectives で 2026-10-17 に実際に起きた） | review |

| Story | 関わる禁止 | 守る invariant |
|---|---|---|
| US-01 | N-03、N-08 | I-02〜I-05、I-07 |
| US-02 | N-02 | I-06、I-10 |
| US-03 | N-04、N-08 | I-01、I-08、および I-02〜I-07 |
| US-04 | N-06、N-07 | I-07 |
| US-05 | — | I-09、I-02、I-06（rubric を変えても、すでにある verdict は無効にしない。今の rubric を求めるのは、新しいものと変わったものだけ） |
| US-06 | N-04 | I-02〜I-07 |

反例による点検:

- **規則を緩める change と、その緩みを使った記録を同時に入れる。** → I-09 で拒否する。
- **verdict を取った後に本文を直す。** → sha256 が変わるので I-06 で拒否する。I-10 によって構造は先に通っているので、review を取り直すのは意味の変更のときに限られる。
- **Jev が止まっている。** → rubric を持つ type の記録は入れられない（fail-closed）。review は終了コード 3 を返す。review なしで入れる抜け道は作らない。
- **`review.place = "frontmatter"` を宣言する。** → policy error で拒否する。`review.place` は `"file:<glob>"` だけを受け付ける。
- **immutable な記録の id を書き換える。** → I-03 と I-05 の両方の finding が出る。1 つの変更が 2 つの性質を破っているだけで、責務は重なっていない（finding の key は性質ごとに別）。

## 4. 3 システムのニーズと、その持ち主（移行で失わないことの検査）

| # | ニーズ | 持ち主 | 移行で変わること |
|---|---|---|---|
| 1 | 記録を 1 か所に置き、後から読める | git + 各 repo | なし |
| 2 | 構造の検査（ファイル名、frontmatter、schema、タイムゾーン、リンク、略語の定義、3 文書の組、引用先、孤児の evi、読解の深さ、leakcheck、大きさの上限） | `dx check` + `.dx/` の checks | なし |
| 3 | review（retro の blameless と多層の要因、polysearch の review、Jev の一括判定） | `dx review` + `.dx/rubrics/` | なし。soks では新たに満たされる |
| 4 | verdict が、その時点の本文に結びついている | I-06 | なし |
| 5 | 自分で自分を review しない | I-06 | なし |
| 6 | 一度入れたら変えない。訂正は後継の記録で行う | I-03、I-04 | なし。soks で強制していなかった「後継の参照先の実在」を強制する |
| 7 | links の型、参照先、循環、id | I-04、I-05 | なし |
| 8 | 予測の事前登録（試験される prediction は base の木にある） | research_record の `.dx/` の checks | なし |
| 9 | 既存の違反を残したまま、新しい違反を止める | I-02 | なし |
| 10 | 選んだパスだけを commit する | `jj commit <paths>` → `dx land @-` | なし |
| 11 | 受け入れた記録が失われない | I-01、I-08 | なし。「受け入れたが push していない」状態が無くなる |
| 12 | 正しい repo の正しい branch に入れる | `dx.toml` の remote と branch | なし |
| 13 | view（soks の index と keys、polysearch の status、閉包の読み出し、期限切れの予測） | `dx view` + `.dx/` の views | なし。commit する index は「view の出力と一致すること」を checks で検査する |
| 14 | 作業中の変更を壊さない | 書き手ごとの workspace（D1） | なし。dx は正規の作業木に先に書かない |
| 15 | エージェントが正規の作業木に直接書くのを止める | harness | dx からは消える。harness に規則を置き直すまで、soks の hook を外さない |
| 16 | 人の git による push の検査 | push の権限を持つ人 | dx からは消える（D2） |
| 17 | 実際の著者 | git の author、agx の session | 一部が失われる（今も強い保証は無い） |
| 18 | 実行の観測 | run | なし（D3） |
| 19 | arena、candidate、rows の登録と contract の検査 | research_record の `.dx/` | なし |
| 20 | leaderboard、研究の比較と再現 | 使う側 | dx からは消える（D4）。使う側の移行を確かめてから旧い機能を消す |
| 21 | 検索 | rr / ccc | なし |
| 22 | 旧形式からの移行 | 完了済み。archive に置く | なし |

## 5. コマンド

| コマンド | 一つの仕事 | 出力（stdout） | 状態の変更 |
|---|---|---|---|
| `dx ls [REV]` | REV の木から記録を読み出す | 記録の JSONL | なし |
| `dx check [--all] [--base REV] [REV]` | 構造を検査し、verdict の結びつき（I-06）を確かめる | 新しい finding の JSONL（--all なら既存も含む） | なし |
| `dx review [REV]` | rubric を持つ type の記録のうち、新しいものと変わったもので finding が無いものについて、Jev に問い、verdict を書く | verdict の JSONL | 作業コピーに verdict を書く。Jev への問い合わせ |
| `dx land [REV]` | check を通った REV で、remote の正規の branch を fast-forward する | 受領の JSON 1 値 | remote の正規の branch と、手元の bookmark |
| `dx view <name> [REV]`、`dx view --list` | `.dx/` の views が定義する計算結果を出す | view の JSONL | なし |

書き手の普段の流れ:

```
jj commit records/20261017_foo.md -m "..."
dx check @-
dx review @-
dx land @-
```

`REV` の既定は `@`、`--base` の既定は `<branch>@<remote>`（例: `alpha@origin`）。
既定の remote branch が無ければ、空の木 `root()` を使い、stderr に `base: remote branch absent; using root()` を 1 行出す。
明示した `--base` の REV が存在しない場合は、従来どおり exit 4 とする。他の解決失敗では fallback しない。

作らないもの: 検索や問い合わせの言語、ingest・admit・commit・push を別々に行うコマンド、`--force`、hook、lock、journal、recover、clean、status、leaderboard、run。

### CLI CONTRACT

## C0 CONSUMERS

- Consumer regimes: agent, shell-pipeline, ci, human-interactive

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| agent（agx の worker） | 自分の workspace で書き、check、review、land を流す | すべてのコマンドが非対話（確認のプロンプトは無い） | stdout の JSONL / JSON と、終了コード |
| shell-pipeline | `dx ls \| jq …`、`dx view status \| jq …` | 同じ | JSONL |
| ci | `dx check --base A B` で、正規の branch の範囲を監査する | 同じ | 終了コードと finding の JSONL |
| human-interactive | 人が手で check、review、land を流す | 同じ。人向けの装飾はせず、stderr に要約を出す | 同じ |

## C1 INVOCATION

- Parser profile: サブコマンド方式（cleye）。長いオプションだけを使い、短いオプションは `-h`（help）と `-V`（`--version`。stdout に `dx <version>` を 1 行出して exit 0）だけ。
- Ambiguous / invalid cases: 位置引数が多すぎる（`view` は 1〜2 個、ほかは 0〜1 個）、同じオプションの重複、未知のオプションは、使い方の誤りとして終了コード 2 で拒否する。`--` より後ろは位置引数として読む。存在しない REV は判定不能として終了コード 4 で返す。

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| `dx ls [REV]` | REV は 1 個まで | 読まない | 例: `dx ls alpha \| jq -c 'select(.type=="evi")'` |
| `dx check [--all] [--policy REV] [--base REV] [REV]` | 各 1 個まで | 読まない | 例: `dx check`（作業コピー対 `alpha@origin`）、`dx check --all --policy alpha --base A B` |
| `dx review [REV]` | REV は 1 個まで | 読まない | 例: `dx review @-` |
| `dx land [REV]` | REV は 1 個まで | 読まない | 例: `dx land @-` |
| `dx view <name> [REV]`、`dx view --list` | name は必須。`--list` は単独で使う | 読まない | 例: `dx view status \| jq 'select(.empirical_status=="falsified")'` |

`check` は `dx.toml`、`.dx/`、`[files] inputs` の内容を、1 つの規則 revision から一度読み、
base と head の両方の評価に使う（I-02）。既定は head、`--policy REV` を明示したときはその REV とする。
判定する木は変えない。`--base` の既定は、規則 revision の設定の branch と remote から決める。
head と同じ REV を指定した場合も、`--policy` を明示したときは I-09 を検査せず、
stderr に `dx: --policy: I-09 の検査を省略します` を 1 行出す。

## C2 EFFECTS

- Effects / recovery: 状態を変えるのは `review`（作業コピーに verdict を書く）と `land`（remote の正規の branch を動かす）だけ。`land` は、(1) fetch して remote の正規の branch を base とし、(2) REV が base の子孫であることを確かめ、(3) `check(base, REV)` を流し、(4) 通れば base を期待値にした lease つきで push し、(5) 手元の bookmark を合わせる。preview は `dx check` で、land と同じ判定関数を使う。判定を飛ばす `--force` は作らない。

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| remote の正規の branch の更新（push） | preview は `dx check`。force は無い | 無い。1 つの ref の原子的な更新で、通るか通らないかのどちらかしかない | lease が外れたら終了コード 3。rebase してから流し直す。中断しても remote は変わらない |
| 手元の bookmark の移動 | — | push が通った後で移動に失敗したら、終了コード 0 で返し、stderr に警告を出す（正本は remote） | 次の fetch で直る |
| review が作業コピーに verdict を書くこと | 構造に finding がある記録には Jev を呼ばない（I-10） | 記録ごとに verdict を 1 つ書く。途中で止まったら、それまでの記録の verdict だけが書かれている | 流し直すと、今の sha256 に結びついた合格の verdict がある記録は飛ばす。Jev に届かなければ終了コード 3 |
| 読むだけのコマンド | — | — | いつでも中断してよい |

## C3 CHANNELS

- Machine mode: 常に machine mode（stdout にはデータだけを出す）。
- Machine framing: `ls`、`check`、`review`、`view` は JSONL（UTF-8、1 行に 1 つの JSON object）、`land` は JSON 1 値で、各 object に `"v":1` を付ける。

記録: `{"v":1,"id","type","path","sha256","by"?,"links":[{"rel","to"}],"fields":{…}}`
finding: `{"v":1,"key","check","id"?,"path","field"?,"new":bool,"message"}`（`key` は「check の名前 + 記録の id + フィールド」から決まり、版をまたいで変えない）
`check` の stdout は `new:true` の finding だけとし、stderr に「新しい finding N 件 / 既存 M 件」を出す。
`--all` を付けると既存の finding も stdout に出す。終了コードと新規・既存の分類、stderr の要約は変えない。
`--base 'root()'` は空の木との比較であり、全件を新規に分類する指定ではない。
規則と inputs を base にも適用するため、空の木でも inputs に対する木全体の検査が finding を出すことがある。
verdict: `{"v":1,"id","sha256","rubric","rubric_sha256","by","at","bits","p":[…],"pass":bool}`
受領: `{"v":1,"commit","base","branch","remote"}`

- Machine compatibility: `v` が同じ間は、フィールドを足すだけにする。消したり意味を変えたりするときは `v` を上げる。
- Waits / liveness: 外への待ちは、land の fetch と push（それぞれ 60 秒で打ち切り）と、review の Jev への問い合わせ（1 件 120 秒で打ち切り）。どれも打ち切ったら終了コード 3。2 秒を超えたら、stderr に `dx: waiting for <origin|jev>…` を 1 行出す。

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| TTY か非 TTY か | 同じ JSONL / JSON | 人向けの要約（例: 「新しい finding 3 件 / 既存 244 件」）、待ちの表示、警告 | 色や表は付けない。人は jq で整形する |
| 失敗したとき | check は新しい finding のみ（--all なら既存も含む）、review は判定まで終わった finding と verdict を全件出す | 理由を 1 行。拒否コードを先頭に付ける | 同じ |

`.dx/` の bundle・import 失敗は `UNDETERMINED:policy: <path>: <原因の 1 行>` とする。
review が I-10 で記録を飛ばす場合は `REVIEW_BLOCKED: <id>: I-10: 既存の finding N 件を先に消す` を出す。
N はその記録に該当する verdict 以外の finding の件数。id のない format finding には path を使う。

## C4 OUTCOMES

- Fallbacks / handoffs: 判定できないことを空の成功にしない。push の結果が分からないときは、対象 branch を remote から fetch する。試した REV が `<branch>@<remote>` の祖先なら、受領を出して exit 0。祖先でなければ exit 3 `RACE`。fetch・remote の REV の解決・祖先の照合ができない場合だけ exit 3 `RESULT_UNKNOWN` を残す。Jev の結果が分からないときも exit 3。rebase と再試行は呼び出し側が行い、dx は行わない。

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| 新しい finding が無い。review ならすべて合格。land なら push まで済んだ | 0 | check は stdout 空（--all なら既存 finding）。review は verdict、land は受領 | なし |
| 新しい finding がある。review で不合格がある。fast-forward でない | 1 | check は新しい finding のみ（--all なら既存も含む）、review は finding と verdict を全件。fast-forward でなければ `NOT_FAST_FORWARD` | 記録を直すか、rebase してから流し直す |
| push が pre-push / pre-receive hook に拒否された | 1 | stderr に `PUSH_REJECTED` と Git が出した拒否理由の最初の行 | hook や入力を直してから流し直す |
| 使い方の誤り | 2 | stderr に使い方 | 引数を直す |
| 一時的な失敗（lease の外れ・remote の ref のロック競合、remote や Jev の不達、時間切れ、照合後も結果が分からない） | 3 | stderr に `RACE`、`REMOTE_UNAVAILABLE`、`REVIEW_UNAVAILABLE`、`RESULT_UNKNOWN` | `RACE` は必要なら fetch と rebase をしてから流し直す。`RESULT_UNKNOWN` は受け入れを確認する |
| 判定できない（REV が無い、`.dx/` が読めない・型が合わない、上限を超えた、I/O の失敗） | 4 | stderr に `UNDETERMINED:<理由>`。stdout は空 | 原因を直す |

## C5 EVOLUTION

`treeChecks` と共有索引を使う追加コマンドは作らない。`dx check --base A B` が従来の checks と
treeChecks の両方を実行する。`.dx/` の読み込み・実行・戻り値の検証の失敗は終了コード 4 とする。
dx は静的な型検査コマンドを持たない。必要な repo は `.dx/` 側の設定で `bun check` を実行する。

- Positive receipt: 未取得（試作 1 で、`dx check` が exit 0 で出力する finding を取る）
- Negative receipt: 未取得（試作 1 で、immutable な記録を変えた差分に対して exit 1 になる出力を取る）

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| サブコマンド名と位置引数 | 安定 | 消すときは、1 つの版の間、警告を出してから消す | 試作の後に取る |
| `dx.toml` の `limits.check_seconds` と `review.pass` | 廃止済み。未知の項目として exit 4 で拒否する | 0.1.0 の 1 つの版の間、警告を出してから削除した | 設定の互換性試験、soks の影運用 |
| JSONL のフィールド（`v`=1） | 足すだけ | 意味を変えるときは `v` を上げる | 試作の後に取る |
| 終了コード 0〜4 | 安定 | 変えない | 試作の後に取る |
| finding の `key` の形 | 安定（I-02 がこれに頼る） | 変えるときは、旧い key との対応表を `.dx/` に置く | 試作の後に取る |
| `.dx/` の type 定義の API | 3 つの repo が載るまでは不安定 | 3 つが載ったら安定にする | 3 つの repo の影運用 |

## 6. dx.toml

```toml
[repo]
name   = "retrospectives"   # 別の repo から引くときの名前（dx:<name>/<id>）。必須
remote = "origin"           # land の push 先
branch = "alpha"            # 正規の branch

[review]
command = ["agx", "jev"]    # stdin に JSON の要求を 1 つ受け、stdout に JSON の答えを返すコマンド

[limits]                    # 超えたら判定できない（終了コード 4）。黙って打ち切らない
record_bytes     = 4194304
records          = 200000
links_per_record = 10000

[files]
ignore = ["records/raw/**", "tools/**", "README.md", "**/node_modules/**"]   # dx が読まないパス
inputs = []                 # 規則が読む入力の glob。ignore より優先し、記録化せず strict からも除く
strict = false              # true なら、どの type にも当たらないファイルを finding にする
```

- `name` 以外の値は、すべて上の値が既定になる。
- `files.ignore` を指定すると既定全体を置き換える（足し合わせない）。`ignore = []` も指定できる。
- 廃止済みの `limits.check_seconds` と `review.pass` は未知の項目として exit 4 にする。
- review は、すべての問いの確率が 0.5 以上なら合格とする。
- 判定全体の時間の上限は呼び出し側が持つ（`timeout 120 dx check`、agx の `timeout_s`、CI）。
- `dx.toml` に規則は書かない。規則は `.dx/` に書く。
- inputs に当たるファイルは snapshot に残り、`tree.files` と `tree.read` で読める。
  base の評価でも、規則 revision（既定は head）の内容とファイル集合を返す。
  inputs のパターンを足しただけでは、既存の記録の当たりを新しい finding にしない。
  type の match にも当たる場合は inputs を優先し、記録にはしない。
- inputs の内容は判定する規則を左右するため、その追加・変更・削除を `.dx/` と同じ規則の変更として I-09 に含める。
  `inputs` 宣言自体の変更も同じ扱いとする。規則を緩める変更と、その緩みを使う記録の変更を分けるためである。
  各 change の前後両方の inputs と type の match で確かめ、宣言の削除で記録の変更を隠せないようにする。

## 7. .dx/ の type 定義

```
<repo>/
  dx.toml
  .dx/
    <type>.ts        # 1 つの type に 1 ファイル
    rubrics/*.toml   # review の問い
```

```ts
// .dx/retro.ts（retrospectives の例。中身は今の schema.ts と check.ts）
import { defineType } from "dx";

export default defineType({
  name: "retro",
  match: "records/*.md",               // どのファイルがこの type か
  format: "markdown-frontmatter",      // dx が持つ読み方から選ぶ（markdown-frontmatter、toml など）
  id: (file) => file.name,             // id をどこから取るか
  filename: CONCEPT_NAME,              // ファイル名の規則（任意）
  schema: Frontmatter,                 // frontmatter の型（zod）
  links: { superseded_by: { to: "retro" } },          // link の名前と、指してよい type
  immutable: false,                    // 一度入れたら変えてはいけないか
  checks: [undefinedCodes, timelineProblems, checkLink], // この type だけの検査（記録 → finding の関数）
  treeChecks: [checkLayout],             // 木全体の検査（木 → finding の関数、任意）
  review: { rubric: "rubrics/retro-review-v4.toml", place: "file:verdicts/*.json" },
  views: {},                           // dx view で出す計算（木 → JSONL の関数）
});
```

- `review.place` は `"file:<glob>"` だけを受け付け、verdict を別のファイルに置く。`"frontmatter"` は使えない。
- すべての type に dx が必ずかける検査は、I-02〜I-06 と I-09。`.dx/` に書く必要はない。

`links` の各宣言は `{ to, match?, values?, acyclic? }` とする。
`to` は宣言済みの型名の文字列、または宣言済みの型名の空でない配列。
参照先はそのいずれかの型でなければならない。
`acyclic` は boolean で、既定は `true` とする。
すべての内部 link に参照先の実在・一意性・型を検査する。
循環検査のグラフには `acyclic: true` の宣言から得た辺だけを入れる。
`acyclic: false` の辺は循環検査から除くが、記録の `links` には残す。
引用のように相互参照が正しい関係には `acyclic: false` を指定する。
フィールドが存在しなければ link はなく、`values` も呼ばない。
フィールドが存在する場合は、次の順序で処理する。

1. `values` を指定した場合、純粋な同期関数 `(fieldValue: unknown) => string[]` で候補を取り出す。
   例外または文字列配列以外の返り値は、理由を出して exit 4 にする。
   省略時は従来どおり、空でない文字列またはその配列を候補とし、異なる形は `I-04.links` の finding にする。
2. `match` を指定した場合、候補ごとに正規表現を適用し、最初の一致の capture group 1 を id とする。
   一致しない候補は link にしない。省略時は候補全体を id とする。
   正規表現は JavaScript の Unicode モードで flags 指定なしとする。
   構文エラーと capture group 1 のない宣言は、記録がなくても型定義の読み込みで exit 4 にする。
   一致した候補の group 1 が未定義または空文字の場合も exit 4 にする。抽出する id は空にできない。
3. id が `dx:<name>/<id>`（name、id ともに空でなく、name は `/` を含まない）の形なら、
   name を `[repo] name` と比較する。異なる repo の参照は形だけを認識して link から除き、
   I-04 の実在・型・循環の検査をしない。同じ repo の参照は `<id>` を内部 id として検査する。
   この形に当たらない値は通常の内部 id として扱う。

例: `sources: { to: ["evi", "sok"], match: "^urn:uuid:(.+)$", acyclic: false }` は、
URL や引用を無視して裸の UUID を id とする。参照先の id が接頭辞を含むなら
`match: "^(urn:uuid:.+)$"` を使う。オブジェクトの配列からの抽出は `values` が担う。
`match` と `values` のない既存宣言は従来の候補と id の扱いを保ち、`dx:` の repo 判定は上記に従う。
記録の `links` には抽出・正規化後の内部参照だけを入れ、元の値は `fields` に残す。
`limits.links_per_record` は、この処理後の link 件数を数える（同じ参照の複数回の出現も数える）。
head の同じ宣言で base も評価し、参照先のない既存の supersedes も I-02 に従って既存扱いにする。

`markdown-frontmatter` は、単一の YAML mapping を frontmatter として受け付ける。
キーはすべての深さで文字列に限り、同じ mapping 内の重複を拒否する（flow mapping と
引用方法だけが違うキーも含む）。anchor、alias、merge の `<<` キー、明示的な tag、
`?` による複合キー、文字列でないキーは受け付けない。
文字列の値に U+0085 または U+FEFF が含まれる場合も拒否する。escape を復号した値、
sequence 内、入れ子、block scalar にも適用する。コメントや引用文字列内の `&`、`*`、`!`、`?` は
構文として扱わない。文書先頭の BOM と LF/CRLF は従来どおり受け付ける。

これらは設定で緩和せず、`check: "format"`、`field: path` の finding にする。
head の parser を base にも適用するため、同じバイト列の記録の format finding は I-02 の既存扱いになる。
parse できず id を持たないファイルでも、バイト列が変われば format finding を既存扱いにしない。
構文の検査には版を固定した `yaml` の AST と `strict` / `uniqueKeys` を使い、通った値は
Bun で復号して従来の値とハッシュを保つ。[parser の API](https://eemeli.org/yaml/) を参照。

`Check` は `(record, tree) => readonly FindingInput[]`、`TreeCheck` は
`(tree) => readonly FindingInput[]` とし、どちらも Promise を返せる。旧い checks は残す。
head の定義で、base と head のそれぞれについて、各 treeChecks の関数を 1 回ずつ呼ぶ。
記録が 0 件でも呼ぶ。複数 type に同じ関数を登録した場合は、登録ごとに呼ぶ。

`TreeContext` は `records`、`base`、`files`、`read(path)`、`index` を持つ。
base 側の評価では records/base はともに base、head 側では records が head、base が base である。
`TreeIndex` は `byId: ReadonlyMap<string, readonly RecordModel[]>` と
`byType: ReadonlyMap<string, readonly RecordModel[]>` を持ち、records を記録順にまとめる。
該当なしは undefined、重複 id は複数要素とし、上書きして隠さない。
評価ごとに 1 度だけ作り、すべての checks と treeChecks に同じ索引を渡す。view の tree もこの索引を持つ。
base の記録は `tree.base` で読めるが、この索引の対象は `tree.records` だけである。

`FindingInput` は、1 件に関わる記録を `id?: string` または `ids?: string[]` のどちらかで表す。
両方を同時に持つことはできず、`ids` は空でない配列とする。複数記録にまたがる規則の指摘には、
その全記録の ID を `ids` に入れる。`treeChecks` は `id` / `ids` を自動で補わない。
記録に属さない finding は `field` に安定した識別子を入れる。finding の key は
`[check, id-or-null-or-sorted-ids, field-or-empty-string]` の JSON tuple とし、`ids` は重複を除いて
辞書順に正規化してから含める。従来の `id` の key は維持するため、`ids` の入力順に依存しない。
I-02 では `id` が新規・変更記録ならその finding を new とし、`ids` の場合は含まれる ID のいずれかが
新規・変更記録なら new とする。加えて、`path` が head で記録を生まないファイルを指し、
そのファイルの bytes が base/head 間で変わっていれば new とする。
すべての関連記録とそのようなファイルが未変更で、key が base にあれば既存として残せる。
旧い checks は、id を省略した finding に対象の record.id を補う動作を保つ。
両方とも信頼する純粋な policy とし、tree や索引を書き換えない。例外や不正な戻り値は終了コード 4 で、stdout は空にする。

## 8. 移行

**移行の不変条件:**

- 移行で、今動いている機能を減らさない。置き換え先が動いて受け入れられるまで、旧い機能は消さない。
- retrospectives の `candidate.ts` は、その repo の書き手がすべて自分の workspace で書くようになるまで残す。
- soks の hook は、harness に規則を置き直すまで残す。

**順序:**

1. 試作 1: dx と retrospectives の `.dx/`。合格の条件は次の 3 つ。
   - records/ の全件で、今の gate（`lint:records`）と同じ判定になる。
   - immutable、links、id、verdict の結びつきについて、違反を 1 つずつ入れた差分がすべて拒否される。
   - `dx review` が、今の `review.ts` と同じ verdict（bits）を返す。
2. 試作 2: soks の影運用。admission 91 件と、正規の branch の履歴を再生して、判定を比べる。
3. 試作 3: research_record の影運用。3,132 fragment を再生し、`dx view status` を今の `read` の出力と比べる。
4. 判定が一致し、使う側の移行も確かめた順に、旧い実装を消す。

**消してよい実装（4 の後）:**

| repo | 消すもの | 置き換え先 |
|---|---|---|
| soks | `hooks.rs`、`shell_syntax.rs`、`jj_policy.rs`、`paths.rs` | harness（ニーズ 15） |
| soks | `commit.rs`、`jj.rs`、`workspace.rs`、`store.rs` の journal・recovery・受領記録・lock、`publish.rs`、`git_hooks.rs`、`custody.rs` の大部分 | jj、land（ニーズ 10、11、14、16、17） |
| soks | `scripts/migrate*.ts`、`evi-from-*.ts`、`discard-inventory.ts` | archive（ニーズ 22） |
| polysearch-v1 | store crate の lock・一時置き場・registry・trust・cache、`store-admit.sh`、ingest・verify・doctor の store 全体の検査 | git、`dx check`、`dx land`、`dx view` |
| polysearch-v1 | compare crate | 使う側（ニーズ 20） |
| retrospectives | `candidate.ts`、`lint-records.ts`、`lint-oxlint.ts`、`review.ts` | `jj commit <paths>`、`dx check`、dotfiles の preset、`dx review` |

**残すもの:** 各 repo の `.dx/`（今の規則と rubric を移したもの）と、polysearch の run。

## 9. 決定の記録

| # | 決定 | 根拠 |
|---|---|---|
| D1 | 書き手はそれぞれ自分の workspace で書くことを、前提にする | owner、2026-10-17 |
| D2 | dx は hosting の機能に依存しない。`dx land` を通らない push を止めるのは dx の外 | owner「github の機能に依存する CLI って全くその役割を放棄しています」 |
| D3 | run は dx の外に置く | owner、2026-10-17 |
| D4 | leaderboard、研究の比較と再現は dx の外に置く | owner「研究再現性は別の問題で dx の責務分界の外」 |
| D5 | blob の管理は dx の外に置く | owner「blob は管理しなくていいだろ」 |
| D6 | review（Jev）は dx の中心に置く | owner「dx は jev を利用しないの？？そこが肝なんじゃないの？？」 |
| D7 | status の導出（証明依存グラフ）は、dx 本体ではなく research_record の `.dx/` の view に置く | 記録のグラフだけから決まる研究の意味なので、repo が持つ（2026-10-17、coordinator の提案。反対があれば改める） |
| D9 | review は 3 つの filter の合成で行う: `rubric request <rubric.toml> <artifact>…`（要求の組み立て。抜粋、上限、UTF-8 を壊さない切り詰め）→ `agx jev`（Jev への運搬だけ。`[review] command`）→ `rubric bits`（応答を `{bits:[{id,p,reason}], refuted?}` に検証して出す）。`rubric` は dotfiles の小さな道具（tools/rubric）で、rubric の schema を持ち、Jev を呼ばず、記録も書かない。dx review が持つのは、判定する記録の選択（I-10）、verdict の結びつけと置き場、合否（各問いの確率が 0.5 以上）だけ。`rubric` が land したら、`src/review-request.ts` をこの合成に置き換えて消す。それまでは今の実装を使い続ける | owner が `agx jev judge` / `agx assess` を agx の越権として退けた後の分け方（2026-10-17、dotfiles-agt_g67e 経由） |
| D8 | 名前: `ls`、`check`、`review`、`land`、`view`、`.dx/`、type、`checks`、`immutable`、`links`、`[repo]`、`branch`、`[review]`、`[files]`、`sha256`、`by` | 既存の 3 つの repo と OKF の語にそろえる（Unix の副原則 3）。`.dx/` は、道具が持つ設定を dot ディレクトリに置く慣習（`.claude/`、`.githooks/`、`.cocoindex_code/`）に合わせ、repo の中身（records/、knowledge/）と分ける（owner、2026-10-17） |
| D10 | 時間の上限は呼び出し側が持つ。schema と pass の設定は、使う人がいないので消した。旧設定の 2 項目は C5 に従って 0.1.x の間は警告して無視する | owner の簡素化依頼、coordinator の削除・移行決定（2026-10-17） |

## 10. 残差

| # | 残差 | 扱い |
|---|---|---|
| R-1 | firedancer に、削除済みの leaderboard を呼ぶ箇所が残っている（`launcher/repository.test.ts:146-149`、`v1_record.test.ts:307-335`、`ModelRegistry.jl/scripts/generate_editions_catalog.ts:249-269`、`lineage_gate.ts:133-148`） | 使う側の課題として firedancer に渡す（D4） |
| R-2 | 時刻と `by` は自己申告で、偽造できる | 今と同じ水準。必要になったら、署名つきの commit を land の条件に加える |
| R-3 | finding の key が版をまたいで同じでないと、I-02 が誤る | key の形を契約にする（§5 C5） |
| R-4 | run の、親プロセスを失ったときの復旧 | dx の外（D3） |
| R-5 | repo をまたぐ参照 | §7 の抽出・match 後の `dx:<name>/<id>` を扱う。name が `[repo] name` と異なれば形だけを認識し I-04 から除く。同じなら id を内部参照として実在・型と、acyclic の宣言に従う循環を検査する。repo 外の参照先は解決しない |
| R-6 | 移行が正しいか | §8 の影運用で確かめる |
| R-7 | 全記録を毎回検査する費用（soks 6,748 文書、research_record 3,132 fragment） | 試作 2、3 で測る。遅ければ base 側の読み出し結果を cache する |
| R-8 | soks: review の要求の上限（30,000 バイト）を超える文書が 266 件（全 6,789 件の 3.9%）、100 KB を超えるものが 5 件ある（2026-10-17 に `wc -c knowledge/*.md` で計測） | 上限を超えた記録の review は、終了コード 4（判定できない）で止める。黙って切り詰めない。分割して review するか、その type には別の rubric を当てるかは、soks の `.dx/` で決める（未決） |
| R-9 | soks: rubric がまだ無い。今の soks は `semantic_review: not_performed` で、review を求めると、新しい evi ごとに Jev の費用と、待ち時間が加わる | soks の rubric を書くまで、soks の type には `review` を宣言しない（今と同じ水準）。宣言した時点から、新しいものと変わったものに review を求める |
| R-10 | soks: 生成した `knowledge/index.md`（2.7 MB）を commit している。land のたびに同じ 1 ファイルが変わるので、並行して land すると、毎回 RACE → rebase → index の作り直しになる | 読んでいるのは soks-govern の push の認証（custody.rs:134-143）だけで、外の使う側は見つからなかった（2026-10-17、soks のセッションの範囲を限った検索）。soks-govern の push を退役させたら、commit をやめて `dx view index` で読む |
| R-11 | soks: 書き手の流れが変わる。今は、worker が scratchpad に bundle を作り、soks-govern が alpha に書く唯一の書き手である。dx では、worker が soks の自分の workspace に直接書く | 書き手の手順書（AGENTS.md）を書き換える。新しい evi の UUIDv7 は書き手が作る（今の `soks-govern ids` に当たるものは dx に無い） |
| R-12 | soks: firedancer と QOED の harness 設定が、soks-govern の hook を指している | soks-govern を消す前に、それらの設定を harness の規則に置き換える。外すだけにすると、hook のコマンドが無くなって設定が壊れる |
| R-14 | soks: soks-govern は、byte の同じ書き直しでも、既存の違反を持つ文書への書き込みを拒否する（cli.rs:931）。dx は木が変わらなければ何も受け入れないので、その書き込みは存在しない | 差は残らない。変わった記録の潔白は I-02 の強化で守る |
| R-15 | soks: soks-govern の base なしの `check` は、既存の違反があれば落ちる（cli.rs:642）。dx の `check` は既定で base（`alpha@origin`）と比べるので、既存の違反を残す | 全件の監査には `dx check --all REV` を使う。空の木と比較するときは `--base 'root()'` も指定する。head の木にある inputs の path を指す finding も、空の木からの追加として new になる。--all は出力だけを変え、判定は変えない |
| R-13 | soks: 誤った著者の事故（`ce4daad`、`dd4f23c`）と、replica からの直接 push（`231817a`）が過去にあった。dx は著者を検査せず、land を通らない push も止めない | 著者の設定は git と agx が持つ。push を止めるのは権限を持つ人（D2）。dx が提供するのは、`dx check --base A B` による後からの検出だけ |
