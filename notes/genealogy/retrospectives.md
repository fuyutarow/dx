# retrospectives のコード系譜と肥大化

## 範囲と数え方

対象 repo `/home/fuyu/Workspace/retrospectives` を 2026-10-17 時点で読み取り調査した。行数は現在の作業木で `wc -l` した実ファイル行数。系譜の commit は Git の短縮 hash。削除済みの行数は削除直前の版の `git show --numstat` による。行数は空行・コメントを含むため、実装量の比較値であり機能数ではない。

記録の探索は `rr files` / `rr text` / `rr regex` を使った。`rr about` は repo が ccc 未登録として失敗したため、意味検索の成功を装わず lexical 検索に切り替えた。`rr files 'records/**/*.md'` は 111 ファイルを返した。背景の「112 件」とは 1 件ずれる。以下の横断件数は `rr regex` の語群に一致した**記録ファイル数**で、事故や独立した原因の件数ではない。記録外の `.txt` raw evidence はこの分母に含まない。

## 系譜表

分類は D=この領域固有の需要、T=既存道具で満たせる、S=前の設計判断が招いた需要、X=消費者が確認できない推測的需要。複数の性質がある場合は主因を記し、表の後に限定を説明する。

| まとまり | 行数 | 足された時期 / 消された時期 | きっかけ | 根拠 | 分類 |
|---|---:|---|---|---|---|
| `schema.ts` | 248 | 2026-10-16 `4135ba5` に OKF v0.2 と同時に追加。10-16 に v3/v4 の規則を統合 | ファイル名、frontmatter、本文構造などの規則がない記録群を、同じ repo で後から読める形に揃える。10-16 移行では分類をファイル名から frontmatter に移した | `4135ba5`; `914dce7`; `85b56c8`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:46-50`; `README.md:5-6` | D（記録形式の検証）+ S（規則をコードに集中させる判断が変更コストを生む） |
| `check.ts` | 399 | 10-16 `4135ba5` の 122 行版から始まり、10-16 `21315aa`, `914dce7`, `85b56c8` で増加 | schema の規則を実ファイルへ適用。形式検査に加え日時、相対リンク、用語定義などを決定論的に検査し、Jev に任せない項目を分離 | `4135ba5`; `21315aa`; `914dce7`; `85b56c8`; `tools/scripts/check.ts:1-2`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:46-47` | D（record の壊れた参照・構造の検出）; 個々の形式規則は一部 T（既存 lint/parser の再利用余地） |
| `candidate.ts` | 137 | 10-16 `50848bc` | commit 対象だけを隔離した候補木にして gate を検査する。ticket の場所に依存した gate を解消し、選択されていない作業中ファイルを混ぜない | `50848bc`; `tools/scripts/candidate.ts:1`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:95-107` | D（commit の対象木を検査する必要）+ S（先行 gate の ticket path 依存を解く） |
| `review.ts` + rubric v4 | 465 + 11 | review v1 `a04614b` → v2 `1a34d6b` → v3 `914dce7` → v4 `be1a404`、すべて 10-16 | 「当日不在の人が後から読めるか」「blameless か」など機械的規則で判定しにくい品質を Jev に判定させ、判定値を記録 hash に束縛する | `a04614b`; `1a34d6b`; `914dce7`; `be1a404`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:39-43,56-64`; `README.md:9-18` | D（読み手の理解可能性という固有需要）; S（事前の規範調査なしに rubric v1 を作り、後から soks の知見に合わせて改訂） |
| gate / `lint-records.ts` | 現行 23。10-16 `21315aa` で +48 / −10、`50848bc` で −197 | 10-16 に作られ、同日責務を縮小 | 変更された記録だけを選び、決定論的 check と hash 束縛 review の成立を commit 前に確認。初版は TypeScript lint と policy 検査も背負ったが切り離された | `21315aa`; `50848bc`; `39e1f39`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:137-147` | D（commit 対象への gate）+ S（初版の責務過積載は重複を作った） |
| TypeScript / policy 補助 (`lint-ts-all.ts`, `lint-oxlint.ts`, `zod.ts`) | 12 + 65 + 37 | 10-16 `50848bc` で独立した tool として整理 | TS lint は oxlint の既存方針へ委譲。policy の写しを除去し、repo 固有 gate と house lint を切り分けた | `50848bc`; `39e1f39`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:44,140-147` | T（oxlint / dotfiles の既存道具）; 責務を分けた修正自体は S の解消 |
| 現行テスト 4 本 | 1,023 | gate / check / review と一緒に 10-16 に追加、改訂 | positive/negative control、schema、CLI の結果と gate の対象選択を確認。review は合格例と定義 1 個だけを欠く不合格例を対にする | `21315aa`; `914dce7`; `be1a404`; `tools/tests/deterministic-record-checks.test.ts`; `tools/tests/review-cli.test.ts`; `tools/tests/review-schema.test.ts`; `tools/tests/rg-gate.test.ts`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:85-88` | D（この gate の誤拒否・見逃しを区別する）; test harness の形式は T（Bun test） |
| `index.ts` / `records/index.md` / register | 旧 `index.ts` 28 行、追跡 `records/index.md` 122 行、register 587 行 | index tool は `50848bc` で削除。`c6a3563` で index/register を `records/` に移し、index は untracked view 化。後の README では rr が検索入口 | index は commit されない生成 view となり、読者がいないと判断。記録の検索は既存の `rr` / frontmatter に委譲 | `50848bc`; `c6a3563`; `README.md:1-3, Provenance`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:142-147` | X（tracked index の消費者なし）; T（rr が既存検索を満たす） |
| lessons 台帳 + `lessons.ts`, `recur.ts`, effectiveness test | 旧 `lessons.ts` 51 行、`recur.ts` 73 行、`lesson-effectiveness.test.ts` 131 行。削除 tree は 196 file（DEDUP.md 1 + TOML 195） | 台帳を `c6a3563` で shard 化、`99d5b75` で 244→190 に dedup、`c643779` で lessons/ 全体を purge | 各教訓を個別に引け、再発を追う狙い。だが、lesson が元記録から切り離され、重複・manual 状態の大量台帳になった。判断は「lesson はその記録に置く」へ戻す | `c6a3563`; `99d5b75`; `c643779`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:42,64,130-146` | S（別台帳を作った選択が重複と維持費を招いた）; X（独立 lesson index / recur の消費者と有効性が記録で確認できない） |
| 旧 root toolchain / 記録移設 | 初期 schema/check/index/lessons/recur などの追加は `4135ba5` で 1,168 行。`06d4a51` と `e538778` で `records/` と `tools/` に移動 | 10-16 | dotfiles / firedancer-coord / QOED の記録が複数箇所に散り、記録・コード・調整 ticket が混在していたため、一つの保管場所へ集める | `README.md:1-4, Provenance`; `06d4a51`; `e538778`; `records/20261016_retrospectives-schema-and-review-gate-frustration.md:48-52` | D（fleet の retrospective を一箇所に保存）; 配置と機械的移設は T（既存 filesystem/git） |

### 削除履歴の読み方

`c643779` は 196 lessons file と lessons/recur 実装を一度に消し、commit summary は 211 files changed, 16 insertions, 2,340 deletions。内容を元記録へ戻す判断で、記録自体は保持される。`records/index.md` は通常の意味で情報を捨てたのでなく、追跡対象から外れた生成ビューである。records/ の元記録と Git 履歴は残る。なお `records/register.toml` は 10-16 に新規発生し、その後も残存しているため、空の index と同じ扱いにはできない。

## 3 プロジェクトにまたがる肥大化の形

**計数法:** `rr regex` で指定した語群に当たる markdown 記録ファイルを重複なしで数えた。語の出現は同一ファイルで複数でも 1 件。意味検索未登録のため、これは記録上の話題の広がりであり、原因の独立エピソード数・各プロジェクトでの発生数ではない。

| 繰り返す形 | 記録数 | 観察と根拠 |
|---|---:|---|
| 境界違反・境界 enforcement | 73 / 111 (`境界|boundary`) | 制約で止まると迂回路を作り、それが定着してから検査を足す型。firedancer では agx lease が dispatch を止め、`experiments/` を作って契約外 artifacts が増殖した (`records/20261013_firedancer-experiments-layer-violation.md:16-20`)。retrospectives では record が読めない不満から review tool、さらに commit gate へ進んだが、gate の組み込み遅れが別 issue になった (`records/20261016_retrospectives-schema-and-review-gate-frustration.md:29-35,54-64`)。dispatch/hook の sandbox の適用範囲や bypass も一次資料との照合で修正対象となった (`records/20261015_dispatch-hearing.md:54-59`)。polysearch は `ingest` に doctor の全体責務を重ねて deadlock/OOM を起こし、責務分離と検査を足した (`records/20261016_polysearch-v1-responsibility-split.md:77-93`)。|
| 再発・manual discipline を仕組みに変える | 39 / 111 (`再発|recurrence`) | 一度の指示・lesson では再発を止められず、schema, hook, gate などを足す。retrospectives は 193 lessons の大半が manual で、fixed の再発を検査する規則がないと記録 (`records/20261016_retrospectives-schema-and-review-gate-frustration.md:42,64`)。polysearch の運用側では ingest 直呼びを誰も検出せず、60/937 件が push 前に残り、警告と一本化経路を追加した (`records/20261016_polysearch-v1-responsibility-split.md:84-93`)。agx/hook 側も宣言と登録の結びつきを欠いたため構造試験の追加を提案 (`records/20261016_frustration-review-6.md:74-80,88-92`)。|
| 似た責務・記録・規則が複数の置き場に増える | 49 / 111 (`重複|duplicate|写し`) | 新しい持ち主を作ると、既存の道具・台帳・規範と重なって不要な機能や移行作業を生む。polysearch の `admitguard` が doctor の全 store scan を重ねて deadlock/OOM を招き、同じ責務を一箇所へ戻した (`records/20261016_polysearch-v1-responsibility-split.md:77-82`); purge は需要が示されない T-20 projection 群や ingest guard を除外した (`records/20261016_polysearch-v1-purge-decision.md:31-48`)。retrospectives の lesson 台帳も元記録に戻して削除した (`records/20261016_retrospectives-schema-and-review-gate-frustration.md:130-146`)。 |
| 過大/未検証の要求・指示を brief や仕様に直写する | 92 / 111 (`指示|要求|要請`) | 語群が広いため、件数自体は傾向の計量に留まる。機序の例では、retrospectives の 21 起動中 8 回の再実行が tool の振る舞いを確かめない brief に起因 (`records/20261016_retrospectives-schema-and-review-gate-frustration.md:68-88`)。firedancer jj repair では owner の「整理してよい」を coordinator がバックアップ・照合必須へ上書きし、時間を失った (`records/20261012_firedancer-jj-repair.md:25-31,54`)。これは指示内容そのものが需要の証明という意味ではない。 |
| 凍結・不変性・provenance の強化 | 17 / 111 (`凍結|immutable|frozen`) | agent が履歴記録を改変したり state を失う事故の後、hash / immutable record / readback を追加する形がある。ただし語群検索は広く、3 repo 共通原因の数とは扱わない。過去 record の provenance を保ち dangling refs を歴史として許容する判断 (`records/20260703_qoed-postmortem-r2607-020-overview-authority-rot.md:67`)、retrospectives の review を本文 hash に結びつける要求 (`records/20261016_retrospectives-schema-and-review-gate-frustration.md:56-64`) が実例。 |

**横断の推測:** 3 repo (polysearch-v1, soks, retrospectives) がコードを増やした主因は「要件数が多かった」だけではない。記録・所有者・実際の消費者が分かれるたびに、その間の穴を新しい検査・台帳・adapter・gate で埋めたことが一つの増幅器だった。違反→迂回→迂回の常態化→検査追加→検査自体の bypass / 誤拒否→追加の修正、という循環は強い。ただしここでの資料は主に retrospectives repo に集約されたfleet記録であり、各 repo の commit history を直接比較した計測ではない。

## Unix 哲学で満たす場合

- **記録の検査:** `schema.ts` は規則のデータ/共通 parser、`check.ts` は `record -> findings` の純粋に近い filter、reviewer は `record + rubric -> JSONL verdict` に狭める。決定論的な日付・リンク・用語は既存 lint/parser に寄せられる範囲を先に使う。commit hook は候補 path を stdin/argv から受け取り、check と reviewer を順に合成する薄い adapter とする。現在の `candidate.ts` は候補 snapshot の必要がある場合だけ独立保持する。
- **探索と一覧:** `records/` は flat text の正本のまま。生成 index は廃止し、`rr` / frontmatter の検索・filter を利用する。検索結果は別プログラムが使える path/JSONL に出す。register の利用者は README だけからは確定しないため、消す前に実利用を一度確認する。
- **教訓と再発:** lesson 本文は該当 retrospective 内の見出し・IDで保持し、既存の `rr` で引く。集計が必要なら、記録から再生成する小さな filter にする。教訓ごとの独立 TOML、shard、再発追跡 DB は、それを読む具体的な消費者が確認できたときだけ残す。
- **通常 lint:** TypeScript lint は oxlint、repository wiring は mise/dotfiles の既存道具へ委譲する。retrospectives の責務は retrospective 固有の invariant のみ。policy の複製や独自 TS lint runner を持たない。
- **90% 解 / captive UI 回避:** 高価な rubric 自動判定は「人間 reviewer を助ける JSONL判定」に限定し、本文の真偽や cited source の妥当性を保証するようには見せない（README もその限界を明記）。別の caller が hook なしで check/review を実行できる CLI を残す。複数 repo 横断の全件分類・再発予測は、必要性と誤りコストが示されるまで延期する。

**残差:** record の意味的正しさ、出典が主張を支えるか、blameless な書き方、どの lesson が是正につながるかは静的 check だけでは判定できない。Jev は理由を返さず上限もあり、最終的な出典照合は人間に残る。commit 時の選択木の隔離や hash を使った review provenance は domain固有の境界なので、既存道具で置換できるか確認するまでは小さな adapter として残す余地がある。記録検索の taxonomy を整える需要と owner がいるかも未確定。

## 推測と確認済み事実

- **確認済み:** README は全 retrospective を一箇所に集め、OKF v0.2 schema と commit gate を使うと宣言する。toolchain は 10-16 の commits で追加・移設され、現行 tools + tests + review docs は上記集計で 2,465 行。lessons/ purge は 2,340 行減の大きな変更。
- **確認済み:** friction record は review 対象、記録規律、lessons の不全、brief 再実行を明記し、polysearch の責任分界と purge record は必要/重複/需要のない実装を分けている。
- **推測:** 横断する肥大化循環は「需要」よりも、境界の穴と責務の重複への後追い対応が増幅したもの。lexical hit counts はこの推測の背景であって因果の証明ではない。
- **未確認:** 背景指定の 112 件のうち 1 件は `records/**/*.md` の列挙に現れなかった。`rr about` の semantic index は対象 repo を未登録として拒否した。よって 112 件全体の意味検索・完全網羅を主張しない。
