# CLI CONTRACT — dx

状態: 草案（2026-10-17）。設計の根拠は [design.md](design.md)。まだ実装していないので、受領記録（receipt）は試作の後に取る。

## サブコマンドの一覧

| コマンド | 一つの仕事 | 入力 | 出力（stdout） | 状態の変更 |
|---|---|---|---|---|
| `dx records [REV]` | 木を正規化した記録の列にする | REV の木と、その木にある `dx.toml`、`kinds/` | 記録の JSONL | なし |
| `dx check [--base REV] [REV]` | 差分が規則を満たすか判定する | base と head の 2 つの木 | 指摘（finding）の JSONL | なし |
| `dx land [REV]` | 判定を通った変更で、remote の alpha を fast-forward する | REV、remote の alpha | 受領記録の JSON 1 行 | **remote の alpha と、手元の alpha bookmark だけ** |
| `dx derive <view> [REV]` | store の kinds が定義する読み取りビューを計算する | REV の木 | ビューの JSONL | なし |
| `dx schema [<kind>]` | kind の schema を書き出す | 手元の木の `kinds/` | JSON Schema | なし |

既定の値:

- `REV` の既定は `@`（jj の作業コピーの commit）。jj では作業コピーも 1 つの revision なので、commit する前でも `dx check` を流せる。
- `--base` の既定は `alpha@origin`。

作らないもの（negative space。理由は design.md §3）:

- 検索や問い合わせの言語。選択、整形、集計は jq / rg / sort に任せる。
- ingest、admit、commit、push を別々に行うコマンド（「受け入れた」は land だけで起きる）。
- hook、lock、journal、recover、clean、status。
- leaderboard と、研究の比較や再現（D4。使う側が `dx records` の JSONL から作る）。
- run（D3。dx の外の作り手）。

## C0 CONSUMERS

- Consumer regimes: agent, shell-pipeline, ci, human-interactive

| Regime | Supported work | Noninteractive path | Machine-readable result |
|---|---|---|---|
| agent（agx の worker） | 自分の workspace で記録を書き、`dx check` で確かめ、`dx land` で入れる | すべてのコマンドが非対話（確認のプロンプトはない） | stdout の JSONL / JSON と、終了コード |
| shell-pipeline | `dx records \| jq …`、`dx derive status \| jq …` | 同じ | JSONL（1 行に 1 値） |
| ci | `dx check --base <push 前の alpha> <push 後の alpha>` で alpha の履歴を監査する | 同じ | 終了コードと finding の JSONL |
| human-interactive | 人が手で確かめて land する | 同じ。人向けの装飾はしない。stderr に要約を出す | 同じ |

## C1 INVOCATION

- Parser profile: サブコマンド方式。cleye（retrospectives と同じ）。長いオプションだけで、短いオプションは `-h` だけ。
- Ambiguous / invalid cases: 位置引数が多すぎる（`derive` 以外は 0〜1 個、`derive` は 1〜2 個）、同じオプションの重複、未知のオプションは、使い方の誤りとして終了コード 2 で拒否する。`--` より後ろは位置引数として読む。存在しない REV は使い方の誤りではなく、判定不能として終了コード 4 で返す。

| Synopsis / input | Ordering and repetition | stdin | Help / example |
|---|---|---|---|
| `dx records [REV]` | REV は 1 個まで | 読まない | `dx records --help`。例: `dx records alpha \| jq -c 'select(.kind=="evi")'` |
| `dx check [--base REV] [REV]` | 各 1 個まで | 読まない | 例: `dx check`（作業コピー対 alpha@origin） |
| `dx land [REV]` | REV は 1 個まで | 読まない | 例: `jj commit -m … && dx land @-` |
| `dx derive <view> [REV]`、`dx derive --list` | view は必須。`--list` は単独で使う | 読まない | 例: `dx derive status \| jq 'select(.empirical_status=="falsified")'` |
| `dx schema [<kind>]` | kind は 1 個まで。省略すると全 kind | 読まない | 例: `dx schema evi > evi.schema.json` |

## C2 EFFECTS

- Effects / recovery: 状態を変えるのは `land` だけで、ほかは読むだけ（何度流しても同じ結果）。`land` は、(1) `jj git fetch` で remote の alpha を base として取り、(2) REV が base の子孫であることを確かめ、(3) `check(base, REV)` を流し、(4) 通れば base を期待値にした lease つきで REV を remote の alpha に push し、(5) 手元の alpha bookmark を REV に合わせる。preview は `dx check` そのもので、land と同じ判定関数を使う。判定を飛ばす `--force` は作らない。

| Effect boundary | Preview / force | Partial state | Retry / cancellation |
|---|---|---|---|
| remote の alpha の更新（push） | preview は `dx check`。force は無い | 無い。push は 1 つの ref の原子的な更新で、通るか通らないかのどちらかしかない | lease が外れた（ほかの誰かが先に land した）ら終了コード 3。`jj rebase -d alpha@origin` してから land をやり直す。中断しても remote は変わらないので、そのまま流し直してよい |
| 手元の alpha bookmark の移動 | — | push が通った後で bookmark の移動に失敗したら、終了コード 0 で返し、stderr に警告を出す。正本は remote なので、次の `jj git fetch` で直る | 何もしなくてよい |
| 読むだけのコマンド | — | — | いつでも中断してよい |

## C3 CHANNELS

- Machine mode: 常に machine mode。stdout は常にデータだけを出す。
- Machine framing: `records`、`check`、`derive` は JSONL（UTF-8、1 行に 1 つの JSON object）、`land` と `schema` は JSON 1 値で、各 object に `"v":1` を付ける。

記録の形は `{"v":1,"id","kind","path","digest","producer"?,"edges":[{"type","target"}],"fields":{…}}`。finding の形は `{"v":1,"key","rule","id"?,"path","field"?,"new":bool,"message"}` で、`key` は「規則 + 記録の id + フィールド」から決まり、版をまたいで変えない。

- Machine compatibility: `v` が同じ間は、フィールドを足すだけにする。消したり意味を変えたりするときは `v` を上げる。
- Waits / liveness: 外に待つのは `land` の fetch と push だけ。それぞれ 60 秒で打ち切り、終了コード 3 で返す。2 秒を超えたら、stderr に `dx: waiting for origin (fetch|push)…` を 1 行出す。

| Mode / TTY | stdout | stderr | Decoration / framing |
|---|---|---|---|
| TTY か非 TTY か | 同じ JSONL / JSON | 人向けの要約（例: 「新しい違反 3 件 / 既存 244 件」）、待ちの表示、警告 | 色や表は付けない。人は jq で整形する |
| 失敗したとき | 判定まで終わった finding だけを出す | 理由を 1 行。拒否コードを先頭に付ける | 同じ |

## C4 OUTCOMES

- Fallbacks / handoffs: なし。判定できないことを、空の成功として返すことはない。push が通ったか分からない場合（応答の前に接続が切れた場合など）は終了コード 3 とし、`jj git fetch` で確かめるよう案内する。成功とは返さない。

| Outcome class | Exit / status | Output | Retry / next action |
|---|---|---|---|
| 新しい違反なし（land なら push まで済んだ） | 0 | stdout に finding（すべて `new:false`）、または land の受領記録 `{"v":1,"commit","base","rules_digest"}` | なし |
| 新しい違反がある、または fast-forward でない | 1 | stdout に finding。land なら push しない。fast-forward でなければ `NOT_FAST_FORWARD` | 記録を直すか、rebase してから流し直す |
| 使い方の誤り | 2 | stderr に使い方 | 引数を直す |
| 一時的に失敗した（lease が外れた、remote に届かない、時間切れ、push の結果が分からない） | 3 | stderr に `RACE`、`REMOTE_UNAVAILABLE`、`PUSH_UNKNOWN` | 必要なら fetch と rebase をしてから、流し直す |
| 判定できない（REV が無い、kinds が読めない・型が合わない、上限を超えた、I/O の失敗） | 4 | stderr に `UNDETERMINED:<理由>`。stdout は空 | 原因を直す。**空の成功とは扱わない** |

## C5 EVOLUTION

- Positive receipt: 未取得（試作 1 で、`dx check` の exit 0 の出力を取る）
- Negative receipt: 未取得（試作 1 で、凍結した記録を変えた差分に対する exit 1 の出力を取る）

| Surface | Promise | Change / deprecation | Verification receipt |
|---|---|---|---|
| サブコマンド名と位置引数 | 安定 | 消すときは 1 つの版の間、警告を出してから消す | 試作の後に取る |
| JSONL のフィールド（`v`=1） | 足すだけ | 意味を変えるときは `v` を上げる | 試作の後に取る |
| 終了コード 0〜4 | 安定 | 変えない | 試作の後に取る |
| finding の `key` の形 | 安定（「新しい違反を増やさない」の判定がこれに頼る） | 変えるときは、旧い key との対応表を kinds に置く | 試作の後に取る |
| `kinds/` の API（store が書く規則の型） | 試作の間は不安定 | retro、soks、polysearch の 3 つが載ったら安定にする | 3 つの store の影運用で確かめる |

## 規則（kinds）の変更をどう判定するか

`kinds/` は store の木の中にある。したがって規則の版は、commit から一意に決まる（受領記録の `rules_digest` は、木の `kinds/` の digest）。判定は次の規則で行う。

- `kinds/` を変える change では、ほかの記録を一緒に変えてはいけない（違反は 1）。規則を緩めることと、その緩みを使った記録を、同時には入れられない。
- 判定は、head の規則で base と head の両方を評価し、新しい違反が無いことを確かめる。規則を厳しくして既存の記録が違反になっても、それは「既存の違反」として残る（増えていないので通る）。
