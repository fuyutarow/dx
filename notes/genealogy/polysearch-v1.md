# polysearch-v1 の肥大化の系譜

## 範囲と読み方

これは「なぜ増えたか」を、2026-10-17 時点の polysearch-v1 の履歴、仕様、実装、および retrospectives の記録から再構成したもの。行数は現時点の主要な実装ファイルを `wc -l` で数えた物理行数で、空行・コメント・テストを含む。複数ファイルをまとめた行は、その表に書いたファイルだけの合計であり、リポジトリ全体の総行数ではない。履歴の理由はコミットメッセージと記録に明記されたものを「事実」、実装上の動機をつないだ説明を「推測」と区別する。

分類は D=領域固有で保持すべき、T=既存の道具へ委譲または合成すべき、S=前の設計が招いた、X=消費者が確認できないか不要になったもの。ひとまとまりに複数分類が付く場合は、内訳も示す。

## 系譜表

| まとまり | 行数 | 足された時期 | きっかけ（事故・指示・ニーズ） | 根拠 | 分類 |
|---|---:|---|---|---|---|
| v0 から v1 への論理モデル再設計（statement/evidence、明示 edge、read 時の status 導出、admission gate） | v0→v1 初期実装は少なくとも `src/{derive,gates,model,store}.rs` 1,629 行、core の後継モデル群は約 2,805 行（テスト除く） | 10/09 の firedancer postmortemを受け、10/10 に別 repo として開始 | v0 は研究段階で `hypothesis` と `finding` に同一命題を二重表現し、証明済み定理の置き場がなく、予測が仮説に埋没（2,402 件）、概念と cleanup entry point が重複。読み取りが store を変更する問題もあった。v1 は「何であるか」で切った immutable な statement/evidence にまとめ、read が graph から状態を導く方針を採った。 | `polysearch-v1/HANDOFF.md:10-23,25-52`; 初期 snapshot `3e89e4a` (2026-10-10); v1 §1 `spec/sections/01-purpose.md:1-9`; 導出 §4 `spec/sections/04-derivation.md:1-15` | D: 研究記録の命題・証拠・推論関係を表すモデル。T: Git は code/history、OS は隔離、外部 checker/reviewer は証明・妥当性。S: v0 の段階別 record と複数 cleanup 経路の置換。 |
| Core の schema decode、validation、admission gates、graph logic/projection（`model`, `fragment_decode`, `validation`, `admission`, `gates`, `logic`, `projection`） | 約 2,805 行（実装ファイル合計） | 10/10 初期 snapshot から 10/11 以降に v1 schema/rev7 へ精緻化 | statement/evidence の ID と graph edge を壊さず、必要な証拠を伴わない記録や、循環・dangling edge、誤った status を拒否する必要。特に予測を事前登録し、後発 run evidence のみでテストするという research workflow の契約。 | `3e89e4a`; v1 §4 `spec/sections/04-derivation.md:1-15`; §1 `spec/sections/01-purpose.md:5-9`; current `wc -l crates/polysearch-v1-core/src/{admission, catalogue, fragment_decode, gates, logic, model, projection, validation}.rs`（各ファイルの物理行数。ファイル一覧・合計は本文冒頭の計数規則） | D: graph semantics、admission の妥当性、status 導出。S: v0 の段階別状態の重複を一元化したことで schema/gate の規則が厚くなった。 |
| CLI、output/refusal、support、fragment authoring・review・read surfaces | 844 行（`cli.rs`, `main.rs`, `output.rs`, `support.rs`） | 10/10 初期 snapshot、10/11 に利用者向け DevX 改訂 | worker が durable な fragment を返し、CLI が明示的に admission/read/refusal を行う。選択、整列、JSONL 変換や編集 UI まで CLI に抱えないという境界も後から明文化。 | `3e89e4a`; `0e58170` (2026-10-11, cite/fragment cat/bulk review/read filters); v1 §1 `spec/sections/01-purpose.md:5-21`; current `wc -l crates/polysearch-v1/src/{cli,main,output,support}.rs` | D: domain command grammar と refusal。T: JSONL の一般選択・射影は jq、検索は rg、editor は人/他ツール。S: command surface は何度か拡張した後、所有者境界を明記。 |
| Read graph と §4 の status 導出（empirical/proof/review/abduction 別 status、bounded closure、index/cache） | `logic.rs` 505 + `projection.rs` 282 + `store/read.rs` 442 + `store/rows.rs` 362 + `store/selection.rs` 231 = 1,822 行（代表実装のみ） | 10/10 の graph-first model。10/11–14 に read/status/graph selection を拡張 | status を書き込まず、admitted evidence と edges から再現可能に導く。prediction の事前登録、後発 run の時刻、proof と review の別軸は研究上の真正な要件。17k graph の closure 性能や READ_LIMIT_REACHED に対処し bounded read と index も追加。 | `HANDOFF.md:27-43,45-52`; `36f8277` (2026-10-13, complete graph or named refusal; index closure); §4 `spec/sections/04-derivation.md:1-15`; `wc -l` 各ファイル | D: 導出規則と query ごとの読み取り。T: 汎用 selection/projection は jq 等へ渡す。S: graph 全体を読む操作と domain status 導出を同じ read 面に集め、性能・範囲制限の修正を招いた。 |
| Run journal/recovery/process identity（intent, child, spool, lease, terminal receipt, recovery, safety） | 2,187 行（`run/{intent,journal,lifecycle,receipt,recovery,safety,git}.rs`） | run filter は 10/11 初実装、recovery/journal は初期 alpha 後に段階追加。完全な履歴上の日付・事故への一対一対応は commit message だけでは確定できない | 実験実行を一度観測し、command/input/output digest と stdout/stderr/artifacts を記録する。parent interruption、child 残存、PID reuse、二重 finalize、容量不足で偽の成功を返さず recovery 可能にする。これは実際の run を証拠として残す要件に沿う一方、scope も大きくなった。 | `crates/polysearch-v1-run/src/lib.rs:1-16,102-112`; §6 `spec/sections/06-run.md:3,13-27,70-89`; `HANDOFF.md:29-41`; `wc -l crates/polysearch-v1-run/src/run/*.rs` | D: run から正しい receipt を作る観測機能。T: scheduler/queue/resource reservation は agx/systemd/caller、process isolation は OS、source history は Git。S: parent crash と ambiguous process state を polysearch 内で解決しようとしたため、journal と lease の複雑さが累積。該当 recovery が利用者に必要だった範囲は記録のみでは定量できない。 |
| Store: content-addressed objects/fragments、canonical registry/trust、lock、transaction/staging、index/cache、inspection/import | 4,603 行（`store/*.rs` の現行実装ファイル合計、tests_* 除外） | 10/10 初期 store から順次追加。canonical authority は 10/13-14 前後、large-object/locking/admission 対応は 10/15-16 | immutable bytes の hash、atomic admission、同時 read/write の整合、trusted path、canonical store の選択、derived index の再構築が必要。実事故として 937 fragments/99,491 files が 27 時間未 push、99,506-file commit が GitHub 106.6 MB blob で拒否、read lock 競合を missing と誤報、31.6 MB object を 1 MiB 上限で STORE_FAULT と誤報した。 | `20261015_polysearch-issue-structure-retro.md:19-23,34-54,70-90`; `b364045` (2026-10-15); `07c86c3` (2026-10-16); §5 `spec/sections/05-store.md:5-9,26-36`; `wc -l crates/polysearch-v1-store/src/store/{bounds,cache,cache_io,cache_rebuild,canonical,commit,import,index,inspection,layout,lock,mod,payload,read,registry,reverse,rows,selection,stream,subset,transaction,trust}.rs` | D: immutable admission、digest、lock、正しい read-back、store trust。T: commit/push/history は Git、large blobs は Git LFS、file/process permission は OS。S: polysearch が canonical registry、projection cache の運用や全体 health を広く担い、store implementation が複数層へ膨張。履歴管理を自前実装する必要はない。 |
| Git-backed durability: `store-admit.sh`（ingest → 自分の introduced paths だけ commit/push → verify IDs） | 137 行 | 10/14 に verify/doctor/store-admit の合成を追加 (`d9e6a4f`)、10/15–16 に事故対応を改訂 (`07c86c3`) | `ingest` だけ成功して commit/push されない 937 件が残り、`git add -A` が他人の path を巻き込み巨大 commit を作った。境界は ingest の責務ではなく、caller-side の一入口 script で Git と合成することにした。 | `d9e6a4f`; `20261015_polysearch-issue-structure-retro.md:19-21,34-47,76-90`; `07c86c3`; §5 `spec/sections/05-store.md:49` | D: ingest の introduced ID を read-back する結合点。T: commit/push/LFS は Git と LFS が持つ。S: 直接 ingest も成功する二つの入口を残したため durability gap が27時間見えず、後から NOT_DURABLE/guard を重ねて purge対象になった。 |
| Arena、candidate、compare crate、leaderboard、reproduce（`polysearch-v1-compare`） | 209 行（現存 `lib.rs`; crate と関連 CLI/tests の総数ではない） | 10/11 (`a36c4c5`) に arena/candidate/leaderboard/reproduce として追加 | firedancer の arena 単位の比較、candidate の評価、履歴行からの再現・比較というニーズを想定。10/16 の purge 判定は「N1–N6 に利用者需要なし」だったが、現行 firedancer には v1 leaderboard を直接読む tests と、`polysearch leaderboard` を呼ぶ catalog generator が残る。したがって需要ゼロの根拠は現状コードと一致しない。独立 compare crate と polysearch 内 leaderboard のどこまで必要かは未決。 | `a36c4c5` (2026-10-11); `20261016_polysearch-v1-responsibility-split.md:39-45,67-70`; purge decision `20261016_polysearch-v1-purge-decision.md:31-43`; `f8329a8` (2026-10-16); `firedancer/launcher/repository.test.ts:146-149`; `firedancer/launcher/v1_record.test.ts:307-335,340`; `firedancer/packages/ModelRegistry.jl/scripts/generate_editions_catalog.ts:249-269`; `firedancer/launcher/lineage_gate.ts:133-148` | D: arena に紐づく比較・lineage の意味は実利用があり、consumer 側に残す所有者が必要。X: 209行の独立 compare crate / reproduce がそのまま必要とは言えず、purge は実行済み。T: 既存 rows/evidence の抽出・整列は JSONL + jq で合成できる余地。S: 研究記録 store の product に leaderboard と比較管理を同居させ、consumer API と product boundary を混同した。 |
| gc、`store which`、index reset compatibility/sentinel、`verify --rev` | 削除対象を含むため現行 LOC 0（削除前の正確な個別 LOC は今回再集計せず） | gc stub/leaderboard/store which/reproduce/reset-compat を 10/16 purge。`verify --rev` は 10/16 に別 commit で削除 | gc は未実装 stub のまま N1–N6 の consumer need がなく、read leaderboard 等も不要と利用者確認。履歴の健全性は `git fsck`、作業 store の健全性は doctor。`verify --rev` は実 store 換算 774 秒で consumer need なし。 | `f8329a8` (2026-10-16; net −4,152 lines); `e27ed31` (2026-10-16); purge decision `20261016_polysearch-v1-purge-decision.md:20-43`; `20261016_polysearch-v1-frustration-review.md` の §1 F6（purge の需要判断） | gc/reproduce/reset compatibility/verify-rev は X。履歴検査は T (git fsck)、store health は D の doctor。§4 の意味的 status 導出は gc や revision verify と別機能であり削除対象ではない。 |
| Build/release/spec gates、CHANGELOG fragment、SPEC section loader | `scripts/release.ts` 244 + spec lint/conformance/ledger/source 約 500 + changelog fragments 85 + `store-admit.sh` は別掲 | gate は 10/11。変更記録 fragment は 10/15 (`changefrag`)、spec 分割は 10/17 (`89e21a7`) | contributor の並列変更が共有 CHANGELOG/SPEC で衝突し、worktree sparse から成果が漏れ、作者が「全 gate 通過」と言っても agx verify は exit 137 のことがあった。変更断片、機械 conformance、一本の spec loader へ移行。 | `20261015_polysearch-issue-structure-retro.md:25-30,56-68,88-90`; `89e21a7` (2026-10-17); current `scripts/spec-source.ts`, `spec-conformance.ts`, `spec-lint.ts`, `changelog-fragments.ts` | T: jj/worktree、agx と repository CI を使う。D: domain contract と conformance cases。S: SPEC/CHANGELOG を共有の直列点にして修理を重ねた。 |

### purge の計数について

履歴 commit `f8329a8` のメッセージは net −4,152 lines と記す。一方、2026-10-16 の frustration review は −4,152、後の別な会話・指示では約 −4,600 と丸めている。ここでは commit 自身が示す −4,152 を再現可能な基準値として採用する。`e27ed31` の `verify --rev` 削除と `98b4ff5` の unguard（−489 行）は別 commit なので、purge の数字に足し込まない。

## 繰り返したパターン

1. **「正しい一段」を作ったが、composition の入口を一つにしなかった。** ingest は記録を受理したが push しない、直接 ingest も成功する、caller は store-admit を通らない。その帰結が 937 件の未 push と「durable でない」状態の不可視化だった。後に store-admit が自分の introduced paths だけを commit/push/read-back する。根拠: `20261015_polysearch-issue-structure-retro.md:19-20,34-47,80-90`。
2. **確かめられない状態を「無い」または一般故障へ潰した。** lock が取れない／object が大きすぎて読めないのを missing / STORE_FAULT にした。正しい修正は memory を固定 buffer に制限し、object size ではなく resource を制限し、LOCK_CONFLICT/unread を別名で返すこと。根拠: 同 `:22-23,49-54`; `b364045`。
3. **小さな fixture だけで検証し、実際の規模・pipe・配布で初めて境界を見つけた。** 10万 path の doctor/admission deadlock、pipe backpressure、106.6 MB push 拒否、旧 binary と新 script の互換性が ship 時に出た。根拠: `20261016_polysearch-issue-structure-retro.md:32-40,45-57`。
4. **一つの仕事を二箇所へ持たせた。** ingest と doctor/store-admit の両方に durability/whole-store check を持たせ、10万 path で deadlock と OOM を再発。重複した安全策自体が新しい障害面となった。根拠: purge decision `:35-48`; `98b4ff5` (net −489 lines) と `a459f73`。
5. **需要が凍結されないまま「有用そうな機能」と最適化を積んだ。** T-20 fast projection/C dependency は明示 consumer need がなく、統合作業の主要な衝突源にもなった。leaderboard/gc/reproduce 等も N1–N6 の needs に紐付かず purge。根拠: responsibility split `:39-45,67-70`; purge decision `:31-48`; `f8329a8`。
6. **共有文書と段階的な仕様コピーを並列の書き手にさせた。** CHANGELOG と1124行 SPEC が直列点になり、衝突を招いた。最初は changes fragments、後に SPEC 19節と単一 loader へ分離。根拠: `20261015_polysearch-issue-structure-retro.md:25-27,60`; `89e21a7`。

## firing consumer との不一致

purge commit は「firedancer confirmed 2026-10-16」として leaderboard 等を消したが、firedancer の現行 `launcher/repository.test.ts:146-149` と `launcher/v1_record.test.ts:307-335` は `polysearch-v1 read leaderboard --arena ...` を実行して rows を期待している。さらに `packages/ModelRegistry.jl/scripts/generate_editions_catalog.ts:249-269` は `polysearch leaderboard --coverage/--all` を呼ぶ。`launcher/lineage_gate.ts:133-148` は launcher output の `data.versions[].rows` を parse する。これは実装・テスト・catalog generation の実際の呼び出しであり、少なくとも stale test と決めつけられない。10/16 の needs interview と矛盾する現状証拠で、purge が consumer migration/acceptance まで閉じたかは未解決。もっとも `launcher/v1_record.ts:585-622` は v1 の記録を「global leaderboard may exceed read limits」として run の row payload から直接読む独立経路も実装している。row capture の旧コメントは v0 `polysearch read rows` を指し、v1 leaderboard の需要根拠とは数えない: `launcher/row_capture.ts:1-8`。

## Unix 哲学に沿って分ける場合

### 小さな filter の組み合わせ

- **`note`/producer → `ingest --check` → `ingest`**: producer/editor が fragment bytes を作り、ingest は schema/gate と immutable admission だけを担当。欠けた evidence や status を producer の代わりに発明しない。read-only check と実 admission を分離する。
- **`run` → sidecar fragment → `ingest`**: run は child を一度観測し、receipt と artifact descriptors を出す。admission・queue・retry・scheduler は持たない。firedancer の launcher / agx が child invocation と resource envelope を合成する。
- **`read graph/rows` → `jq`, `rg`, `sort`**: polysearch は有効な domain view を JSONL で出す。選択、表整形、一般比較は jq/rg/sort に渡す。特定 domain query が頻出し契約が安定した場合だけ小さい named query filter を残す。
- **durability**: `ingest` の後を `git add -- <introduced paths>` → `git commit` → `git push` → `verify --ids` で接続する `store-admit` の薄い script とする。履歴・remote・large object は Git/LFS/GitHub、健康確認は `git fsck` と doctor。polysearch は履歴や blob transport を複製しない。
- **spec/release**: immutable schema/contract files を一次資料とし、lint/conformance/release は読み取って一つの verdict を出す filter にする。Git/jj workspaces と changes fragments で並列 write を隔離し、release gate で合成する。
- **比較**: arena/candidate definition と pass/fail の意味は firedancer の実験計画/consumer 側に置く。polysearch は run/evidence/rows を保存・読み出す。履歴行の選択・best-row 集計は jq で始め、実測で安定した需要が出たときのみ domain-owned filter を足す。leaderboard crate を先行させない。

### 何が残るか

**D として残す中核**: content-addressed immutable statement/evidence graph、fragment/schema/admission gates、graph-derived status と prediction-order rule、run が truthful receipt を作る最小観測機能、lock を含む atomic store admission/read、specific ID の正しい read-back。ここは Git や jq では代替できない領域固有の意味・不変条件。

**既存 tool へ渡す T**: history/commit/push/freshness/replication→Git/jj/LFS; queue/scheduling/resource envelope/lifecycle→agx/systemd; selection/projection/sort/aggregation→jq/rg/sort; OS process/filesystem isolation→OS; code edits/spec collaboration→Git/jj worktree + harness.

**S を作らない境界**: ingest に全 store health を持たせない、run に scheduler/retry を持たせない、CLI に汎用 query language を作らない、admission と durability を二重所有させない。caller が正規経路を通らなかった場合は、polysearch 内に再度 durability 全体を実装するのでなく entrypoint と拒否/診断を一つにし、実規模 smoke で測る。

**残差**: 個別 consumer の現行呼び出しと purge 判断のズレを解消するには、firedancer 側で `repository.test.ts:146-149` と `lineage_gate.ts:133-148` の現行用途を確認し、削除済み leaderboard API を使うなら `read rows | jq` などへの置換を行う必要がある。この調査では指定範囲に従い他 repo は変更していない。

## 根拠として読んだ主な記録

- `retrospectives/records/20261012_polysearch-v1-coordinator.md` — 初期 coordinator のユーザー要望、v0/v1 移行の運用文脈。
- `retrospectives/records/20261015_polysearch-issue-structure-retro.md` — 937件未永続化、blob上限、誤った missing、並列統合事故。
- `retrospectives/records/20261016_polysearch-issue-structure-retro.md` — 10万 path のdeadlock/OOM、実 store smoke、配布と回復。
- `retrospectives/records/20261016_polysearch-v1-frustration-review.md` — owner feedback、ship/統合遅延、T-20/purge の判断。
- `retrospectives/records/20261016_polysearch-v1-responsibility-split.md` — 6 needs と各責任者。
- `retrospectives/records/20261016_polysearch-v1-purge-decision.md` — 残す/外すの判定、purge 根拠。

**確かめた事実**: 対象 polysearch-v1 と retrospectives の repo/history/files は読み取りできた。`rr about` は retrospectives が未登録と返して exit 2 だったため、`rr files`/`rr text` の lexical route と明示された記録の読み取り、read-only `git log/show` を併用した。対象 repo は git/jj の状態を変えていない。

**推測**: 初期 v1 の詳細機能それぞれが、どの一つの owner request から生えたかは、初期 snapshot の一部 commit に空のsubjectがあり、後続設計記録も retrospective に残らないため、完全な一対一因果を示せない。表では一次資料で根拠づけられる需要と、後から明示された設計判断を分け、推測を断定していない。
