# dx が満たすニーズと、移行で失わないことの論証

状態: 草案（2026-10-17）。[design.md](design.md) の §0、§3 と、§4 の「意味の正しさ」の行を、この文書で改める。

## 0. 改めた結論

- **dx は、記録を「構造の検査」と「意味の判定」の両方に通したものだけを、正規の線に入れる道具である。** 構造の検査は決定的で、規則は `kinds/` に書く。意味の判定は Jev が行い、問い（rubric）は `kinds/` に書く。
- 前の設計は、意味の判定を「dx の外（持ち場 8）」に置いていた。これは誤りだった。
  - 意味の判定こそが、3 つのシステムに共通する中心のニーズである。retrospectives は Jev の判定で commit を止め、polysearch は review の記録と Jev の一括判定を持つ。soks はこのニーズを満たせておらず、`semantic_review: not_performed` が残っている。
  - 外に置くと、retrospectives が今満たしているニーズ（記録の質の関門）を失う。
- 責務は次のように分ける。
  - **判定のエンジン（Jev）は外の道具を使う**（`agx jev`。レバレッジ）。
  - **何を問うか（rubric）は store が持つ**（`kinds/`）。
  - **判定を呼ぶこと、判定を本文の digest に結びつけること、判定の結果で land を止めることは dx が持つ。**

## 1. ニーズの棚卸し（3 システム → dx での持ち主）

出典は、聞き取りの回答と `notes/genealogy/*.md`。「喪失」の欄が空でない行は、移行で何かが変わる行である。

| # | ニーズ（今それを満たしているもの） | dx での持ち主 | 喪失 |
|---|---|---|---|
| 1 | 記録を 1 か所に置き、後から読める（retro の records/、soks の knowledge/、research_record の fragments/） | 持ち場 1（git）+ 各 store | なし |
| 2 | 構造の検査（ファイル名、frontmatter、schema、タイムゾーン、リンク、略語の定義、3 文書の組、引用先、孤児の evi、読解の深さ、leakcheck、大きさの上限） | `dx check` + `kinds/` | なし（規則はそのまま移す） |
| 3 | **意味の判定**（retro の blameless、多層の要因。polysearch の review と Jev の一括判定） | **`dx judge`（Jev を呼ぶ）+ `kinds/` の rubric + `dx check`（結びつきを確かめる）** | なし。soks では**新たに満たされる** |
| 4 | 判定が、判定した時点の本文に結びついている（retro の review.sha256） | `dx check`（I-06） | なし |
| 5 | 自分で自分を判定しない（polysearch 2-N18） | `dx check`（I-06） | なし |
| 6 | 一度入れたら変えない。訂正は後継の記録で行う（soks の evi と supersedes、polysearch の refines） | `dx check`（I-03、I-04） | なし。soks で強制していなかった「後継の参照先の実在」を強制するようになる |
| 7 | 辺の型、参照先の実在、循環の禁止、id の重複・付け替えの禁止 | `dx check`（I-04、I-05） | なし |
| 8 | 予測の事前登録（polysearch 4-N2） | `kinds/`（「試験される prediction が base の木にある」） | なし |
| 9 | 既存の違反を残したまま、新しい違反を止める（soks の L） | `dx check`（I-02） | なし |
| 10 | 選んだパスだけを commit する（retro の candidate.ts、soks の commit.rs、store-admit.sh） | `jj commit <paths>` で切り出し、`dx land @-` で入れる | なし（jj がもともと持つ機能を使う） |
| 11 | 受け入れた記録が失われない（polysearch の store-admit、verify --ids。soks の push の検査） | `dx land`（I-01、I-08） | なし。「受け入れたが push していない」状態が無くなる |
| 12 | 正しい store に入れる（polysearch 5-N44） | `dx.toml` が remote を宣言し、land はそこにだけ push する | なし |
| 13 | 派生ビュー（soks の index.md と keys、polysearch の status・閉包の読み出し・期限切れの予測） | `dx derive <view>` + `kinds/` | なし。soks の index.md は「`dx derive index` の出力と一致すること」として検査する |
| 14 | 書き換えた側の、作業中の変更を壊さない（soks の journal、recover、ロック） | 書き手ごとの workspace（D1） | なし。dx は正規の作業木に先に書かないので、復旧すべき途中の状態が生まれない |
| 15 | エージェントが正規の作業木に直接書くのを止める（soks の hook。firedancer と QOED にも入っている） | **harness**（Claude Code / Codex の設定。dx の外） | **dx からは消える。** 移す先の harness で規則を置き直すまで、soks の hook を外さない |
| 16 | 人の git の commit と push の検査（soks の git_hooks.rs） | `dx land` が正規の道。それ以外の push を止めるのは、権限を持つ者の責務（D2） | **dx からは消える**（D2 で決定済み） |
| 17 | 実際の著者（soks の custody。誤った著者の事故があった） | git の author と、agx の session | **一部が失われる。** dx は著者を認証しない。soks も暗号的な認証はしていなかった |
| 18 | 実行の観測（polysearch の run） | run（dx の外。D3） | なし（今の run を使い続ける） |
| 19 | arena、candidate、rows の登録と、その contract の検査 | `kinds/` | なし |
| 20 | leaderboard、研究の比較と再現 | 使う側（D4） | **dx からは消える**（D4 で決定済み）。使う側の移行を確かめてから旧い機能を消す |
| 21 | 検索 | rr / ccc | なし |
| 22 | 旧形式からの移行（soks の migrate など） | 完了済みの一回きりの道具。archive に置く | なし |

**喪失の判定:** 15、16、17、20 の 4 行が「dx からは消える」。どれも dx の外の持ち主に移る。15 と 20 は、移す先が動くまで旧い機能を消さない（design.md §7 の移行の不変条件）。16 と 20 は owner が決めた。17 は、今も強い保証はない。

## 2. User story / Negative space / Invariant

分割の軸:

- user story は「行為者 × 記録の一生の段階（書く・判定する・入れる・読む・規則を変える）」で分ける。
- negative space は「その仕事の持ち主（dx の外の誰か）」で分ける。
- invariant は「性質ごとに、確かめる場所を 1 つ」に置く。

### User story

| ID | 行為者 | 段階 | 内容 |
|---|---|---|---|
| US-01 | 書き手 | 書く | 自分の workspace で記録を書き、`dx check` で構造を確かめる |
| US-02 | 書き手 | 判定する | 構造が通った記録について `dx judge` を流し、Jev の判定を得る |
| US-03 | 書き手 | 入れる | `dx land` で、構造と判定の両方を通った変更を alpha に入れる |
| US-04 | 読み手 | 読む | `dx records` と `dx derive` で、ある revision の記録とビューを読む |
| US-05 | store の保守者 | 規則を変える | `kinds/` の規則や rubric を変えて land する |
| US-06 | 監査する者 | 読む | `dx check --base A B` で、alpha の任意の範囲を後から判定する |

### Negative space

| ID | dx がしないこと | 持ち主 |
|---|---|---|
| N-01 | 保存、履歴、複製、blob の管理 | git / jj（blob は store の持ち主） |
| N-02 | 判定のエンジン（モデルの推論） | Jev（`agx jev`） |
| N-03 | 書いている途中に止めること。正規の作業木への直接の書き込みを止めること | harness |
| N-04 | `dx land` を通らない push を止めること | push の権限を持つ者 |
| N-05 | 実行の観測、作業の割り振り | run / agx |
| N-06 | 検索と問い合わせの言語 | rr / jq |
| N-07 | 研究の比較と再現 | 使う側 |
| N-08 | git の外に状態を持つこと（受領記録、ジャーナル、ロック） | —（作らない） |

### Invariant

| ID | 性質 | 確かめる場所 |
|---|---|---|
| I-01 | 受け入れた ⇔ remote の alpha から到達できる | land |
| I-02 | head の規則で数えて、新しい違反が無い | check |
| I-03 | 凍結された記録は、変わらず、消えない | check |
| I-04 | 辺は型が合い、参照先があり、循環しない | check |
| I-05 | id は重複せず、付け替えられない | check |
| I-06 | rubric を持つ kind の記録で、新しいものと変わったものはすべて、今の本文の digest と今の rubric の digest に結びついた合格の判定を持つ。判定者は作り手と違う | check |
| I-07 | check は副作用が無く決定的である。判定できなければ終了コード 4 を返す | check |
| I-08 | alpha は、check を通った commit への fast-forward でだけ動く | land |
| I-09 | `kinds/` を変える change は、ほかの記録を一緒に変えない | check |
| I-10 | judge は、構造の検査が通った記録にだけ Jev を呼ぶ | judge |

### 追跡表

| Story | 関わる禁止 | 守る invariant |
|---|---|---|
| US-01 | N-03、N-08 | I-02〜I-05、I-07 |
| US-02 | N-02 | I-06、I-10 |
| US-03 | N-04、N-08 | I-01、I-08、および I-02〜I-07 |
| US-04 | N-06、N-07 | I-07 |
| US-05 | — | I-09、I-02、I-06（rubric を変えても、既にある判定は無効にしない。新しく変わった記録だけに今の rubric を求める） |
| US-06 | N-04 | I-02〜I-07 |

### 反例による点検

- **漏れ（1）:** 規則を緩める change と、その緩みを使った記録を同時に入れる。→ I-09 で閉じる。
- **漏れ（2）:** 判定を取った後に本文を 1 文字直す。→ digest が変わるので I-06 で拒否され、判定を取り直す必要がある。I-10 で構造の検査を先に通すので、取り直しは意味の変更に限られる（10-17 に retro で 4 回取り直した原因は、この順序が逆だったこと）。
- **漏れ（3）:** Jev が止まっていると、rubric を持つ kind の記録は入れられない。→ 意図どおり（失敗したら閉じる。fail-closed）。judge は終了コード 3 を返し、取り直せばよい。判定なしで入れる抜け道は作らない。
- **漏れ（4）:** soks の凍結された evi の frontmatter に判定を書き込むと、I-03 に反する。→ 判定の置き場は kind ごとに選べるようにする。本文に埋め込む方式（retro の今の形）と、別の判定の記録として置く方式（soks の evi）。どちらを使うかは `kinds/` が決める。
- **重なり:** I-03 と I-05（凍結された記録の id を書き換えると、両方の指摘が出る）。1 つの変更が 2 つの性質を破っているだけで、責務の重なりではない。
- **重なり:** N-02（判定のエンジン）と I-06（判定の結びつき）。dx が見るのは、digest、rubric の digest、判定者、合否だけ。判定の中身はエンジンが決める。重ならない。

## 3. パージしてよい実装（dx に移った後）

条件は、置き換え先が動き、影運用で判定が一致したこと（design.md §7）。

| システム | パージ | 理由（置き換え先） |
|---|---|---|
| soks | `hooks.rs`、`shell_syntax.rs`、`jj_policy.rs`、`paths.rs`（2,535 行） | 書き込みを止めることは harness に移す（ニーズ 15）。正規の線は land だけが動かす |
| soks | `commit.rs`、`jj.rs`、`workspace.rs` | `jj commit <paths>` と land（ニーズ 10） |
| soks | `store.rs` のジャーナル、復旧、受領記録、ロック | 正規の作業木に先に書かない（ニーズ 14） |
| soks | `publish.rs`、`git_hooks.rs`、`custody.rs` の大部分 | land（ニーズ 11、16、17） |
| soks | `scripts/migrate*.ts`、`evi-from-*.ts`、`discard-inventory.ts`、archive | 一回きりの移行は完了済み（ニーズ 22）。史料として archive に残す |
| polysearch-v1 | store crate のロック、一時置き場、レジストリ、trust、cache、`store-admit.sh` | git と land（ニーズ 11、12） |
| polysearch-v1 | CLI の ingest、verify、doctor の store 全体の検査 | `dx check`、`dx land`、`dx derive` |
| polysearch-v1 | compare crate | 使う側へ（ニーズ 20）。使う側の移行を確かめてから |
| retrospectives | `candidate.ts`、`lint-records.ts`、`lint-oxlint.ts`（dotfiles の写し） | `jj commit <paths>`、`dx check`、dotfiles の preset |
| retrospectives | `review.ts` の Jev 呼び出しと根拠の収集 | `dx judge`（ニーズ 3）。rubric の toml は `kinds/` に移す |

残すもの:

- 各 store の規則と rubric（`kinds/`）。
- polysearch の run。
- polysearch の status の導出（`kinds/` のビュー。置き場は owner の確認待ち）。
