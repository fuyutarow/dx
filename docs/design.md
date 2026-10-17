# dx のシステム設計とその論証

状態: 草案（2026-10-17）。根拠は `notes/genealogy/*.md`（系譜の調査）と、polysearch-v1・soks・retrospectives への聞き取り。soks の系譜は未着で、届いたら §7 で照合する。

## 0. 結論

dx は **「型付きの不変な記録のグラフを、git の上で、1 点の関門だけで守る道具」** である。

- 記録は平文のファイルとする。保存、履歴、原子性、複製は git / jj / LFS に任せる。
- dx が持つのは 3 つだけである。
  1. 記録を正規化する（`dx records`）
  2. 差分を判定する（`dx check`）
  3. 正規の線を進める（`dx land`）
- 加えて、読み取り専用の派生ビュー（`dx derive`）を持つ。
- 領域ごとの意味（記録の種類、辺、凍結、導出の規則）は、各 store に置く `kinds/` に書く。dx の本体には書かない。
- 実行の観測（run）、作業の割り振り、検索、意味の審査は dx の外に置く。dx はそれらが書いた記録を受け入れるだけである。

## 1. 観察: なぜ 3 つとも肥大化したか

ニーズは本物だった。系譜の調査で D（その領域に固有のニーズ）に分類されたものは、どれも dx に残す（§4）。肥大化の主な原因はニーズそのものではなく、次の 5 つの形である。

| # | 形 | 実例 | 根拠 |
|---|---|---|---|
| P1 | **入口が 2 つある。** 「受け入れた」と「失われない」が別の状態になっていた。 | polysearch: ingest は成功したが push されず、937 件が 27 時間残った。後から NOT_DURABLE、admitguard、store-admit を重ねた。 | genealogy/polysearch-v1.md:19,30 |
| P2 | **1 つの仕事を 2 か所以上が持つ。** | ingest と doctor と store-admit が、store 全体の検査を重ねて持ち、10 万パスで deadlock と OOM が起きた。retro の candidate.ts と、dotfiles の jjCandidate が重複している。 | polysearch-v1.md:33、retrospectives.md:17 |
| P3 | **境界を後付けの検査で守る循環。** 違反 → 迂回 → 迂回の定着 → 検査の追加 → 検査の誤拒否や迂回 → さらに修正。 | soks の書き込みを止める層（hooks + shell の解析 + jj policy、2,535 行）。retro の review → gate。 | retrospectives.md:36,42 |
| P4 | **共有の作業コピーや共有の文書に、並列の書き手がいる。** | `git add -A` が他人のパスを巻き込んだ。CHANGELOG と SPEC が直列点になった。soks は他人の変更を巻き込まない選択 commit、ジャーナル、復旧を持った。 | polysearch-v1.md:19,35 |
| P5 | **消費者を確かめずに機能を足す（あるいは削る）。** | T-20 projection、gc、reproduce、lessons 台帳（2,340 行が同じ日に削除）。逆に leaderboard は消費者が残ったまま削除された。 | polysearch-v1.md:20,34,39、retrospectives.md:23 |

さらに、**3 つのシステムが同じ仕組み（凍結、参照の解決、選択 commit、評価の hash 結びつけ）を、2 つの言語で 3 回別々に実装し、それぞれが同じ事故を踏んだ。** 3 つ合わせて本体は約 27k 行ある。

## 2. 設計の原則（Unix 哲学をこの問題に当てはめたもの）

| 原則 | dx での決定 | P1〜P5 のどれに効くか |
|---|---|---|
| データは平文に置く | 記録は md+YAML か TOML のファイルにする。dx の状態ファイル（ジャーナル、受領記録、レジストリ）は持たない。 | P1, P4 |
| 他人のソフトウェアをレバレッジにする | 原子性、履歴、内容から決まる id、復旧、並行制御、複製は git / jj / LFS に任せる。workspace の分離は agx に、検索は rr に任せる。 | P2 |
| 1 つのことをうまくやる | 正規化、判定、land、派生を別々のコマンドにする。land 以外は副作用を持たない。 | P2 |
| すべてのプログラムを filter にする | `check` は `(base の木, head の木) → findings の JSONL` を返す純粋な関数にする。`derive` は `木 → ビューの JSONL`。 | P3 |
| 捕らわれない interface | どの書き手も、どこで書いてもよい。書いている途中に止める仕組みは置かない。いつでも手元で `dx check` を流せる。 | P3 |
| 90% 解 | 機能は「使う人の名前」と「それを確かめる check」を持ったときだけ入れる。削るときも、使う人の移行を確かめてから削る。 | P5 |

## 3. 責務の分け方（MECE）

「誰が何を決めるか」で、9 つの持ち場に分ける。

| # | 持ち場 | 担うもの | 実体 | 担わないもの |
|---|---|---|---|---|
| 1 | 保存と輸送 | バイト、履歴、原子的な更新、blob の id、複製、大きなファイル | git / jj / LFS / GitHub | 記録の意味 |
| 2 | 書き手の分離 | 書き手ごとの作業場所 | agx が作る jj workspace（`<repo>.ws/ws_<slug>`。1 workspace に 1 run） | 正規の線 |
| 3 | **関門（1 点）** | 正規の bookmark `alpha` を進めてよいか | `dx land` + remote 側の保護 | 書いている途中の検査 |
| 4 | **判定** | 差分が規則を満たすか | `dx check`（共通の検査部品） | 規則の中身 |
| 5 | **規則** | 記録の種類、schema、辺、凍結、領域に固有の判定、ビュー | 各 store の `kinds/*.ts` | 判定の実行と land |
| 6 | **派生ビュー** | status、index、board、keys | `dx derive <view>`（実体は store の kinds が定義する） | 保存（作った結果を正本にしない） |
| 7 | 作り手 | 記録を書く。run の観測結果を記録にする | 人、エージェント、`run`（dx の外の別のツール） | 受け入れ |
| 8 | 意味の審査 | 正しいか、出典が主張を支えているか | reviewer / agx assess。判定は review の記録として書き、dx はその記録を受け入れる | 構造の検査 |
| 9 | 割り振りと検索 | dispatch、資源、検索 | agx / rr / ccc | 記録の妥当性 |

**排他性（どの仕事も 1 か所だけが持つこと）**は、§4 で守るべき条件を 1 つずつ置き場に割り当てて示す。**網羅性（漏れがないこと）**は、3 システムで挙がった条件と機能を、§4 と §6 のどちらかに必ず置いて示す。

### 「受け入れた」の定義（P1 への答え）

> **記録が admit された ⇔ その記録が remote の `alpha` から到達できる。**

store ごとの「admitted 状態」は持たない。`dx land` は判定と fast-forward での push を 1 つの操作として行い、push に失敗すれば admit されていない。これで「ingest は成功したが失われうる」状態が定義の上で無くなり、P1 で挙げた NOT_DURABLE、admitguard、store-admit、受領記録の層はまとめて要らなくなる。

### 関門を 1 点に置く理由（P3 への答え）

迂回できる場所に検査を置くと、P3 の循環が起きる。迂回できない 1 点（remote の bookmark の更新）にだけ置けば、ほかの場所で何が書かれても正規の記録は汚れない。書いている途中の検査は、あってもよいが助言にとどめ、強制はしない（`dx check` を誰でも流せる）。

### 共有の作業コピーをやめる（P4 への答え）

agx はすでに、1 つの workspace で同時に 1 本しか run を走らせない（今回の実行で確かめた。2 本目は `already has running run` で止められた）。したがって、soks の選択 commit（他人の変更を巻き込まない commit）、ジャーナル、復旧、書き込みを止める層が前提にしていた「同じ作業コピーに複数の書き手がいる」状態は、運用の決まりとして既に禁じられている。dx はこれを前提にし、作り直さない。

## 4. 守るべき条件を、どこが持つか

| 守るべき条件 | 元のシステム | dx での置き場 | 扱い |
|---|---|---|---|
| 一度入れた記録を変えない・消さない | soks A、polysearch 5-N11, 1-N4 | 判定: `frozen`（kinds が凍結する glob や種類を宣言する） | 移す |
| 訂正は新しい記録が古い記録を指して行う | soks supersedes、polysearch refines | 規則: 辺の宣言 + 判定: 参照の解決 | 移す。soks で強制していなかった「参照先の実在」も、ここで強制されるようになる |
| 参照先が実在する、辺の型が正しい、循環しない | soks D、polysearch 3-N1 | 判定: `refs`、`acyclic`（辺の種類の表は kinds が持つ） | 移す |
| id の重複・付け替えの禁止 | soks E | 判定: `identity` | 移す |
| 内容から決まる id、digest | polysearch | 保存（git の blob）+ 判定: パス名と digest の一致 | 大部分を git に任せる |
| schema、未知のフィールドの拒否 | soks K、retro schema.ts、polysearch schema | 規則（zod。JSON Schema を書き出す） | 移す（領域の本体） |
| 3 文書の組、引かれない evi の拒否、leakcheck、状態とその根拠 | soks C, D, N | 規則 | 移す |
| ファイル名、タイムゾーン、リンク、略語の定義 | retro check.ts | 規則 | 移す（ほぼ今のコードのまま） |
| 評価が、評価した時点の本文に結びついている | retro review.sha256 | 判定: `attest`（review の記録が対象の digest を持つ） | 共通化する |
| 同じ producer による review の拒否 | polysearch 2-N18 | 判定: `attest`（producer ≠ reviewer） | 共通化する |
| 予測の事前登録（4-N2） | polysearch §4.4 | 規則: 試験される prediction が **base の木に既にある**こと。run の `started_at` が、prediction を入れた commit の時刻より後であること | 移す。「前の fragment」を「alpha 上の先祖」と読み替える |
| 大きさの上限（4 MiB、参照 10,000 個） | polysearch 5-N19 | 規則（数値の上限） | 移す |
| 既存の違反は残し、新しい違反を増やさない | soks L | 判定: `violations(head) − violations(base) = ∅` | 1 行に置き換える |
| status の導出（verification / review / empirical / abduction、前提の伝播） | polysearch §4 | 派生ビュー: `dx derive status`（kinds が定義） | 移す（読む側の計算） |
| leaderboard（同一性、tolerance、系譜の最良値） | polysearch §17（削除済み） | **dx の外**（研究の再現性と比較は、使う側の責務。owner の決定 D4） | dx は `dx records` で rows と arena の記録を JSONL で渡すだけ。比較の意味は firedancer 側が持つ（§6 の R-A） |
| 選んだパスだけを commit する | soks F、retro candidate.ts、store-admit.sh | 書き手の分離（持ち場 2） | **不要になる** |
| 前提条件の hash、ロック、一時置き場、ジャーナル、復旧 | soks B, M、polysearch store | 保存（fast-forward で失敗したら rebase して判定し直す） | **不要になる** |
| push の前の検査、正規の store 以外に書かせない | soks G、polysearch 5-N44 | 関門（push 先が正規であることも含む） | 移す |
| 書き込みを途中で止める、人の git 用の検査 | soks I, J | 関門 | **消す** |
| admission の受領記録 | soks H | commit そのもの。規則（`kinds/`）は store の木の中にあるので、規則の版も commit から一意に決まる | 置き換える（trailer は要らない） |
| 意味の正しさ | 3 システムとも自動化していない | 持ち場 8 | 変えない |

## 5. コマンドの形

```
dx records [REV]                  # 木 → 正規化した記録の JSONL {id, kind, path, digest, producer, edges[], fields}
dx check   [--base REV] [REV]     # → findings の JSONL。exit: 0 = 新しい違反なし、1 = 違反あり、2 = 判定できない
dx land    [REV]                  # check → alpha を fast-forward で push（唯一、状態を変えるコマンド）
dx derive  <view> [REV]           # → ビューの JSONL（status, board, index, keys … は kinds が定義する）
dx schema  <kind>                 # → JSON Schema
```

- 選択、整形、集計は jq / rg / sort に任せる。dx は問い合わせ言語を作らない。
- `records` が他のすべてのコマンドの土台になる。他のツールも、この JSONL を読めば dx を使える。

**配置**
- dx の repo: 本体（正規化、判定、land、ビューを動かす仕組み）と、形式ごとのアダプタ（md+YAML、TOML fragment）。言語は bun ts。
- 3 つの store: soks、retrospectives、research_record-v1 は、別々の repo のままにする。大きさ（49 MB / 小 / 1.2 GB の LFS）も、読み手も違うからである。各 store は `dx.toml` と `kinds/` を持つ。規則はデータと一緒に版を進めるので、規則の置き場は 1 つに定まる。

**規模の見込み**（推定）
- dx 本体: 約 0.8〜1.2k 行
- kinds: retro 約 650 行（既存）、soks 約 800 行、polysearch 約 1.5k 行（status と board を含む）
- 合計: 約 27k 行 → 約 4k 行。run は別に数える。

**なぜ bun ts か**
- dotfiles と retro がすでに bun / zod / neverthrow を使っている。
- 試作の周期を短くできる。
- 性能は先に測る。polysearch は 17k グラフの閉包を Rust で 0.07 秒で求めている。ts で足りなければ、`derive` だけを置き換える狭いアダプタにする。

## 6. 残差

| # | 残差 | 扱い |
|---|---|---|
| R-A | **leaderboard を使う箇所が firedancer に残っている**（`launcher/repository.test.ts:146-149`、`v1_record.test.ts:307-335`、`ModelRegistry.jl/scripts/generate_editions_catalog.ts:249-269`、`lineage_gate.ts:133-148`） | dx の外（D4）。firedancer 側の課題として渡す。dx が約束するのは、rows と arena の記録を `dx records` で読めることだけ。**消費者の移行を確かめずに削った（P5）ことは、firedancer 側で直す** |
| R-B | 関門を remote で強制できるか（GitHub のプランと ruleset）［未確認］ | 強制できなければ「検出と revert」に下げる。CI か定期実行で、alpha の履歴を `dx check` でたどる |
| R-C | 書き手ごとの workspace は agx が守るが、人や agx を通さない書き手は守られない | 破られたときの被害は、自分の作業コピーが汚れる程度で、alpha は汚れない（関門があるため） |
| R-D | 書いている途中に止めてもらえなくなる | 受け入れる。`dx check` を手元で流せる |
| R-E | 時刻と producer は自己申告で、偽造できる | 今も同じ水準（4-N6, 6-N32）。必要になったら、署名つき commit を関門の条件に加える |
| R-F | 規則の版が変わると、違反の数え方が変わる | 違反の id（規則 + 記録の id + フィールド）の形を契約にし、`Dx-Rules` の trailer に規則の digest を残す |
| R-G | run（実行の観測、2.2k 行）。ニーズは D だが、ジャーナルとプロセス同一性の復旧は S | dx の外に置く。最小の形は「子プロセスを 1 回走らせて receipt を書く」まで。親プロセスが失われた run は unresolved とし、走らせ直す（90% 解）。agx との境界は別の課題にする |
| R-H | store をまたぐ参照（soks の evi を polysearch の記録が引く、など） | URN `dx:<store>/<id>` を予約する。検査は store の中だけにする |
| R-I | blob 1 個（109 MB）が手元にしかない（`research_record-v1/EXTERNAL-BLOBS.md`） | 移行の前に LFS などに置く（owner が決める） |
| R-J | 移行の正しさ（polysearch の §13、soks の tests/cli.rs、retro の tests が仕様の実体になっている） | 影運用で過去の admission をすべて再生し、判定が一致するかを見る。テストの名前は fixture として移す |
| R-K | 既存の消費者（firedancer の launcher、skill の driving-polysearch-v1、soks の install-hooks） | 移行が済んだことを、使う側のテストで確かめてから旧 CLI を退役させる |

## 7. 検証計画と進め方

1. **R-A を確かめる**（firedancer のテストを読むだけで流す）。
2. **試作 1（retro）**: dx 本体と、retro の kinds（今の check.ts と schema.ts を移す）を作る。合格の条件は次の 2 つ。
   - records/ の全件を再生して、今の gate と判定が一致する。
   - 守るべき条件ごとに、違反する差分を 1 つずつ作り、すべて拒否される。
3. **試作 2（soks）**: 影運用。admission 91 件と alpha の履歴を再生して、判定の一致率を見る。
4. **試作 3（polysearch）**: 3,132 fragment を再生する。`derive status` を、今の `read` の出力と bytes 単位で比べる。
5. 判定が一致して、消費者の移行も確かめられた順に、旧実装を退役させる（Strangler Fig）。

## 8. owner の決定（2026-10-17）

- D1: 書き手ごとに workspace を分けることを、dx の前提にする。**決定済み**
- D2: 関門を remote で強制するか（R-B）。**未決**
- D3: run は dx の外に置く。**決定済み**
- D4: leaderboard と研究の再現性は、dx の責務の外に置く。**決定済み**
- D5: 109 MB の blob の保存先（R-I）。**未決**
