# soks の肥大化の系譜

調査日: 2026-10-17（JST）。対象: `/home/fuyu/Workspace/soks`。参照した HEAD は `2f016ccf6b332de7944c73237951e0b2227e6895`。記述・分類の責任: この調査の筆者。

**所見（推測・史料に基づく解釈）:** 増加の主因は、知識の構造検証だけではない。移設時に証拠を失った事故、消費側から正本を変更・公開した事故、共有 checkout の著者・変更の取り違え、それらを防ぐ hook 自身の誤拒否が、別々の補償を必要にした。特に「配給先でも書く」「canonical を symlink で共有する」「人間の Git 経路も残す」「jj へ移行する」という選択が、同じ admission の保証を複数の操作面で再実装する費用を生んだ。根拠は下の系譜表と事故の連鎖に示す。

一方、「全部が不要な防御だった」「Rust への置換がすべてを肥大化させた」とは言えない。領域固有の引用・証拠・同一性の要件と、実際の消費者がある。Rust 初出の commit は削除 6,510 行・追加 4,812 行で、旧管理 CLI の機能を退役させてもいる（`bc5ea17` の stat、`soks-govern/README.md:299–315`）。

## 調べ方と範囲

目的は、dx の持ち主が「どのニーズを引き継ぎ、どの機構を既存の道具へ戻すか」を判断できるようにすること。文献の網羅的レビューではなく、ローカル史料を用いた限定的な説明的調査である。

- 現行の Rust 全 14 module、Bun の主要 script と補助・archive・test 群を棚卸しした。知識本文・生成 JSON・Cargo.lock・target はコード行数から除く。
- `git log`、`git log --all -- sok-mgr`、`git log --follow`、`git show` で導入と変更理由を確認した。Git の状態を変える操作および jj コマンドは実行していない。
- 検索は `rr files` / `rr text` / `rr regex` を使用した。retrospectives は `soks|custody`、`sok-mgr`、`Rust`、`hook` などで検索し、該当する記録を直接読んだ。`rr about` は使っていない。履歴も記録も読めたため、指定の refuted_by には該当しない。
- 事実の主たる史料は現行コードと commit 本文。retrospectives は独立した日付の運用報告として突き合わせた。既存 hearing A/B は案内として読み、主要な判断は原史料で確認した。
- 8～9月の経緯は主に soks の commit 本文に残る。今回の retrospectives 検索では `sok-mgr` / `custody` の直接一致を得なかった。これは記録の不存在を意味しない。commit 本文の事故報告は当事者の記録であり、元会話や事故時の全 trace まで独立再現したわけではない。
- 行数は調査時ファイルの `wc -l`（空行・コメント・同一ファイル内の unit test を含む物理行）。表の時期は原則「最初に追跡された時期」であり、初めて書かれた時刻とは限らない。範囲引用は両端を含む。以下、`src/` は `soks-govern/src/`、`R/` は `/home/fuyu/Workspace/retrospectives/records/`、他の相対 path は対象 soks root を指す。

分類はニーズ／機構の置き場に関する**筆者の判断（推測）**で、史料自身のラベルではない。D = 領域に固有、T = 既存の道具の責務、S = 前の設計判断が招いた補償、X = 完了・退役済み、または消費者未確認。同じ module に複数ある場合は混在を明示する。X は「コードが存在するだけで無価値」という判定ではない。

## 系譜表

### 現行 Rust: 6,721 行、14 module

| まとまり | 行数 | 足された時期 | きっかけ（史料上の事故・指示・ニーズ） | 根拠 | 分類 D/T/S/X と元の判断 |
|---|---:|---|---|---|---|
| `hooks.rs` | 1,102 | 9/17 `bc5ea17`、同日 `1a4841a` で範囲修正。その後縮約・再修正 | 直接 Write/Edit、patch、shell、未知 tool から admission を迂回する変更を防ぐ。旧 Bun gate を Claude/Codex 共通の入口へ。allowlist が cargo/which/cp/diff 等まで拒み、自己修理と検索が不能になったため denylist へ変更 | `src/hooks.rs:1–32,85–150,414–481`。`d972ee3` 本文は必須の cargo test/clippy も拒否、246 unit の重複検出が8本の通読へ落ちた実害を記録 | **D/T/S**。D は schema を通したい要件。書込境界は harness/OS の責務 T。任意の tool から共有正本へ触れられる配置を parser で補う部分が S |
| `shell_syntax.rs` | 521 | 9/17 `1a4841a`（初出150行）、`d35b3f6` で walker へ。10/16 `f50bcef` | quoted data と実 shell の区別、pipeline/loop/置換/redirection の書込先抽出。解析不能なら保護 path の言及を拒む方式が正規の `--root ROOT` まで拒否。後に heredoc・fd redirection を修正 | `src/shell_syntax.rs:1–16,32–40`、`d35b3f6` 本文、`f50bcef` diff と `tests/heredoc_hook.rs:1–64`。運用側にも同型の拒否記録: `R/20261013_firedancer-theory-salvage-retro.md:74–77`、`R/20261013_firedancer-devx-design-space-retro.md:61–68` | **T/S**。元の判断は任意 shell を事前に読んで書込境界を守る方式。AST は既存 tree-sitter を利用するが、判定用 walker と回帰試験は自前 |
| `jj_policy.rs` | 816 | 10/1 `125ee38` | jj は Git hook を走らせない。裸の commit、squash/rebase/new/undo、bookmark move、push、alias・mise 経由で schema/公開検査を飛ばせるため拒否層を新設 | `125ee38` 本文、`src/hooks.rs:77–81`、`src/jj_policy.rs:1–39`、`AGENTS.md:20–30` | **T/S**。jj 自体への移行と、共有 checkout で自由な履歴操作も可能にした選択の補償。領域の判定規則自体ではない |
| `paths.rs` | 96 | 9/17 `1a4841a`、同日 `d972ee3` | symlink、相対 path、`..` を同じ保護対象へ解決する。祖先の削除も止める必要がある一方、同じ述語を生 shell text に使うと `/` 一語で無関係 repo まで止まった | `src/hooks.rs:14–27`、`src/paths.rs:1–96`、`23faf05` 本文 | **T/S**。共有・symlink 配置の補償。OS の実ファイルへの権限境界なら別の層で所有できる |
| `custody.rs` | 321 | 旧機能は9/4～7、Rust `git_policy.rs` は9/17。現 module は10/1 `125ee38` | replica の直接 push、共有 git config の誤著者、symlink 越しの canonical 操作、公開 index の不一致を防ぐ。jj と人間 Git の規則が分岐しないよう VCS 中立に分離 | `src/custody.rs:1–7,35–90,120–151`。`dd4f23c` は `fc08f16` の実人間著者と session committer の食違い、`ec79e36` は symlink 導入が非 custody からの canonical push を可能にしたことを記録 | **D/T/S**。D は採録・公開の責任主体。著者設定は T。replica/論理 PWD の判定、session 身元の代用は S。元の判断は消費側書込み＋canonical 共有。9/21 に自己 export 可能な human-author bypass は退役 |
| `commit.rs` | 442 | 9/17 `1a4841a`（355行）、10/1 `125ee38` で Git temporary index から jj へ置換 | admission 済みの選択文書だけ commit し、他 session の未 commit を巻き込まない。jj 移行で detached Git HEAD の commit では alpha が進まないため、親・path・byte の事後検査と bookmark CAS を追加 | `src/commit.rs:141–276,298–318,379–442`、`125ee38` 本文、`AGENTS.md:20–26`。共有 checkout の clean 判定問題は `R/20261015_dispatch-hearing.md:141–142` | **D/T/S**。D は「検証した byte だけ公開候補になる」。選択 commit/履歴管理は T。共有作業木に複数の変更を同居させ、receipt と現在 byte を照合し続ける実装は S |
| `jj.rs` | 382 | 10/1 `125ee38` | jj の root、identity、fileset、snapshot、revision 展開を一か所に束ねる。上記 commit/publish の基盤 | `src/jj.rs:21–57,104–186,304–382`、`125ee38` 本文 | **T/S**。既存 jj の薄い adapter にすべき責務。ただし現契約の選択 commit・CAS・snapshot の順序を外すだけでは同じ保証にならない |
| `publish.rs` | 223 | 10/1 `125ee38`、同日 `bfdbbe6` / `6b408a2` | pre-push がなくなった jj で、送出集合の custody・conflict・author・構造・evi 不変性・index 鮮度を認証してから1 bookmark を push。初回 push の全履歴 ID 列挙が argv 上限を超えるため revset に変更。Git 時代に hook がしていた OKF 検査も移設 | `src/publish.rs:37–112,130–223`、3 commit 本文。`bfdbbe6` は5,138文書の scratch clone での実測を記録 | **D/T/S**。D は公開する tree の適格性。運搬・送出集合・FF は jj/git の T。hook を持たない経路への移行で検査呼出しを再配置する部分が S |
| `git_hooks.rs` | 305 | 9/17 `git_policy.rs` の系統、現 module は10/1 `125ee38` | agent は jj に移る一方、人間の `git commit` / `git push` を残す。その Git index と pre-push stdin を実際に検査する別 adapter が要る | `src/git_hooks.rs:1–13,83–140`、`soks-govern/README.md:306–307`、`125ee38` 本文 | **T/S**。元の判断は人間 Git と agent jj の二経路併存。人間経路の実使用回数までは今回確認していないので、X と断定しない |
| `store.rs`（import/prepare/admit、journal/recovery、receipt、index） | 967 | 9/17 `bc5ea17`（647行）。9/23 `ac395df`、10/1 `125ee38` で増修 | 型付き bundle と既存 corpus を合わせて検証し、hash 前提条件つきで書く。協調 writer の直列化、途中失敗からの復旧、検証 byte の受領証。後に古い bundle の無言巻戻し、recovery が receipt を残す不整合、admission log 失敗の誤報を修正 | `src/store.rs:280–390,406–476,618–708,716–760,859–950`、`ac395df` 本文。journal は before 内容と after hash。`README.md:275–282` は file 単位 atomicity のみを明記 | **D/T/S**。D は証拠不変性と検証対象の一貫性。lock/atomic replace は OS の T。共有の mutable corpus へ複数 file を先に書き、commit を別段にするため journal/receipt の同期が必要になった部分は S。初出時の特定のクラッシュ事故までは史料未確認 |
| `validation.rs` | 931 | floor の系統は8/9 `dedcd24`。Rust は9/17 `bc5ea17`（729行）、以後診断改善 | role、UUID、authority 重複、triad、引用先、led→evi、孤児、read depth/locator、汚染を検査。以前の文字列一致が実命題を検証せず、偽陽性や情報の見落しを出したため修正を重ねた | `src/validation.rs:247–352,431–593,644–678`、`scripts/check.ts:20–35`、`012291c`（verbatim locator 不備36件の露出）、`e1e0ec8`（heading のない引用に偽 heading を強いていた） | **D** が中心。OKF の封筒構文は T と分離。claim 本文の科学的妥当性までは検査しない（`README.md:157–159`） |
| `model.rs` | 111 | 9/17 `bc5ea17` | Rust request 型から schema を生成し、未知 field・重複 field・書込 request の解釈のずれを防ぐ | `src/model.rs:1–111`、`soks-govern/SELECTION.md:8–16`、`AGENTS.md:3–6` | **D/T**。D は request の内容、serialization/schema 生成は既存 crate の T |
| `workspace.rs` | 82 | 9/17 `1a4841a`、10/1 `125ee38` | request の export と回収可能な scratch clean。jj は新規 file も追跡するため「untracked」ではなく @- に未存在の file に限定 | `src/workspace.rs:1–82`、`AGENTS.md:43–47`、`125ee38` 本文 | **T/S**。一時成果物の所在・保存は OS/agx/呼出側。現在の corpus 内 scratch を扱う特別な clean は配置由来 |
| `main.rs`（CLI 合成・land・診断） | 422 | 9/17 `bc5ea17`。9/21 `ba5281a` の land、9/23 `ac395df` の途中失敗表示 | 10次315文書の実務で段の間の判断がほぼなく、JSON/hash を人が運ぶ7段を land に合成。合成後は admit 成功・commit 失敗等が bare error に見える事故があり、request を先に保存し段別の状態を返す | `src/main.rs:213–247,271–350`、`ba5281a` / `ac395df` 本文。個別 verb を残す実在の理由も前者に記録 | **D/T/S**。非対話の薄い合成は T と親和的。検証・採録・公開の意味は D。先に分けた段を利用者が毎回運ぶ儀式と、その失敗状態の隠蔽は S |

指定の書き込み阻止層3 file は **2,439行**（1,102 + 521 + 816）。`paths.rs` 96行も足すと **2,535行**になる。約2,535行という規模感はこの4 file の合計と一致する。ただし前者にも内蔵 test が含まれる。たとえば `hooks.rs:572`、`jj_policy.rs:654`、`shell_syntax.rs:246` 以降に test があり、全行を実行時 parser の複雑さとは数えない。

### Bun、移設、補助、検証資産

| まとまり | 行数 | 足された時期 | きっかけ（事故・指示・ニーズ） | 根拠 | 分類 D/T/S/X |
|---|---:|---|---|---|---|
| `scripts/check.ts` | 610 | 8/9 `dedcd24`、8/13 `012291c` で再現可能な追跡状態へ。最終更新9/10 | rumdl/okf に見えない corpus floor。機械が落とせると言いながら落としていない、ある clone だけの未追跡 checker が green を出す問題を修正 | 冒頭 `scripts/check.ts:1–35`、`012291c` 本文 | **D/S**。D の旧実装だが、現 floor は Rust（`mise.toml:21–27`）。負の試験のため旧 checker も残る二実装は S。全面的に死んだコードではない |
| `scripts/floor-negatives.ts` | 545 | 8/13 `012291c` で追跡可能化 | 規則の名と異なる易しい命題を checker が検証していないか、各 rung 単独の負 fixture で見る | `mise.toml:25–27,83–86`、`scripts/check.ts:20–35`、`012291c` 本文 | **D/T**。領域の反例 fixture は D、test runner は T。現行 Rust への検査資産移送の余地はある |
| `scripts/migrate.ts` | 866 | 8/10 `f7cacc8`、その後8/13・15等に修正 | agent に文章を再著述させた移設が2回の監査でも12件の喪失を出した。翻訳・要約・template にない列の削除をやめ、cell を運び、判断不能を FLAGS に出す deterministic transformer へ | `1201b8b` / `f7cacc8` 本文、`scripts/migrate.ts:1–45` | **D/S**。証拠を失わず移す D。旧形式から新形式への移設と再著述 brief の誤設計が S。現在の定常採録とは別の migration filter |
| `scripts/evi-from-ledger.ts` | 402 | 8/13 `7fdc1e6`、8/22 UUID対応 | doctrine に捕獲の規則はあるが、最初の shape-C に123 capture を手書きする必要があり採録が進まなかった。named field から生成し、読解深度等を bind できなければ拒否 | `7fdc1e6` 本文（121生成＋2 flagged、深度を過大申告しない監査） | **D/S**。出所・深度の保持は D、旧台帳形式への adapter は S |
| `scripts/evi-from-md-ledger.ts` | 972 | 8/13 `012291c` で初追跡、8/22 UUID対応 | JSONL でなく自由な Markdown table の donor に同じ捕獲が必要。数式の未escape `|` が列をずらし、同じ token が unit ごとに別の深度を意味するため、行幅検査と個別の対応表を追加 | `scripts/evi-from-md-ledger.ts:1–59`（実3行の列崩れを列挙）、`git log --follow` | **D/S**。多様な旧台帳を一括で解釈しようとした費用。named-column 変換として独立可能。定常 consumer の新規利用は未確認 |
| `scripts/discard-inventory.ts` | 802 | 8/13 `273aa36`、8/15 `5728d61` | 「列挙せず削除禁止」という規則に列挙器がなく、正当に削除へ到達できなかった。claim/field/sibling を列挙し、移せた証明以外は人の判断へ。directory 全体を文字列一致で移設済み扱いした誤判定も修正 | `scripts/discard-inventory.ts:3–24,53–59`、`273aa36` 本文（11MB/162 file の誤判定、148/15の棚卸し） | **D/S**。保全の判断は D。旧構造を切るための一時的補償が S。一般の削除安全性をこの文字列検査で保証するものではない |
| `scripts/archive/migrate-id-v2.ts` + `rebind-id-v2-identities.ts` | 1,126 + 33 = 1,159 | 8/22 `931f90f`～`93e5e5c`。9/7 `6d05c89` で archive | UUIDv7/URN と同一性の移行。参照 closure、review済み ID 保持、index 分離等を修正して完了。再実行による現行変更用ではなく forensic replay と fixture のため保存 | `scripts/archive/migrate-id-v2.ts:1–16`、`6d05c89`、`migrations/id-v2.json`（12,005行、生成記録なのでコード総計には入れない） | **D/X**。同一性は D、旧→新の移行機能は完了した X。保存と定常 command の公開は別判断 |
| `scripts/lib/{identity,leakcheck,mint-uuidv7-cli}.ts` | 91 + 17 + 23 = 131 | UUID系8/22 `931f90f`、denylist一本化8/10 `2381905`、9/7 rename/bug修正 | identity grammar/UUID、LEAK の共通 regex、旧 mint との名前衝突回避。重複 denylist が drift して漏洩した | `scripts/check.ts:7–13`、`2381905` / `037f087` / `85988ea` | **D/T/S**。領域の grammar は D、mint は既存 UUID ライブラリの T、複製や入口衝突への補償は S |
| Rust 統合試験 `tests/{cli,commit,heredoc_hook,review_matrix}.rs` | 1,392 + 677 + 64 + 91 = 2,224 | 9/17以降、heredocは10/16 | 単なる helper test ではなく、実 temp repo で他 session の変更を巻き込まない、復旧の外部変更拒否、push拒否等を固定。修理のたびに回帰例が増える | `soks-govern/README.md:325–329`、`ac395df` / `f50bcef`。本調査では試験を実行していない | **D/T/S**。保証の費用として数える。test があること自体は過剰機能の証明ではない |
| Bun `tests/{id-v2-migrator,id-v2-identity,leakcheck}.test.ts` | 952 + 63 + 27 = 1,042 | 8/22以降 | ID移行の replay と現存補助の回帰。移行終了後も fixture の consumer がある | archive冒頭、`mise.toml:29–35,83–86` | **D/X**。移行 test は史料再検証の consumer。通常採録に必須とする根拠とは分ける |
| **退役した Bun `sok-mgr/`** | 現在0（削除41 tracked file、コード・文書・baseline込み） | 9/3 `e6f2fdd`、9/3配置変更 `d8f3a11`、9/17 `bc5ea17` で削除 | floor を subprocess で使い、baseline、stage/admit、battery、hook、replica status を追加。その後 consumer の dirty/push/誤帰属、再収束、symlink 移行を吸収 | `e6f2fdd` 本文、`bc5ea17^:sok-mgr/README.md:3–6,11–76,127–170`、現 `README.md:299–315` | **D/T/S/X**。旧一式の系譜は次節。baseline/battery/reconverge/relink の現行 CLI 入口は X と明示的に退役 |

主要 Bun script 6本（check、floor-negatives、migrate、capture 2本、discard）は4,197行。lib131、archive1,159、Bun tests1,042を合わせると6,529行。Rust src6,721＋Rust integration tests2,224＋このBun群6,529 = **15,474行**。これは列挙したコードの合計であり、fixture JSON、hook shim、設定、template、知識本文を含む repo 全体の総行数ではない。内蔵 unit test は src 側に一度だけ数えた。

## Bun から Rust への作り直しは何を変えたか

1. **9/3: 規則の実行装置を後付けした。** `e6f2fdd` は checker を正本のまま呼ぶ zero-dep Bun CLI を導入した。既存147件のFAILを freeze してから hook を結線する順序まで明記する。順序を逆にすると無関係な commit も止まるためだった。初めから「知識の検証」と「既存負債を抱えた書込運用」の二責務があった。
2. **9/3～7: 配給・書込みの実害を管理 CLI に吸収した。** `cf9155f` は QOED の rumdl が submodule の3件を dirty にした再現を記録し、consumer config の exclude 警告を install-hooks に追加した。`231817a` と旧 README:137–140 は、submodule からの生 push が「取り込まない」と判断した commit も含め HEAD 全体を origin に送った事故を記録する。`ce4daad` は実著者 ynxy の成果が w2m7 に帰属した例を記録する。
3. **同じ期間: 事故を直す配置の変更が新たな保護を要求した。** `reconverge` は消費側履歴と作業内容を保全して正本へ寄せる操作へ成長（`f2d63cb`、`ab1f758`、`707702b`、`d647fd3`）。`relink` は owner の「全権委任。symlinkへの差し替えまで」を受けて導入（`8f62c88`、旧 README:33–76）。cherry-pick と再収束を不要にする代わりに、全 session が canonical の同じ作業木を使う。この前提変更を `ec79e36` 自身が、非 custody push を可能にした原因と説明している。
4. **9/17: 型と書込契約を切り直し、一部を捨てた。** `bc5ea17` で Rust request/schema、validation/store、共通 hook、Git policy に置換した。旧41 file を削除し、baseline の免除・検索したという自己申告の battery receipt・破壊的な配置移行 verb を退役（現 README:299–315）。`SELECTION.md:8–19` は typed CLI、生成schema、YAML parser、AST、file lock という選定理由を残す。**Rust が必須だった性能測定や、Bun では実現不能だったことは今回の史料からは確認できない。**「言語が原因で肥大化した」は推測としてもこの史料だけでは支持できない。
5. **9/17～23: 実利用が契約を削り、診断を増やした。** allowlist の誤拒否を `d972ee3`、その祖先 path 回帰を `23faf05`、未模型化構文の拒否を `d35b3f6` で修正。10次315文書の運用を根拠に land を追加（`ba5281a`）し、未使用 write と human-author bypass を削除（`e1e0ec8`）。合成しても途中失敗は残り、9/23に保存済み request と段別状態、recovery の receipt 削除を追加（`ac395df`）。
6. **10/1: jj 移行で保護の置き場が変わり、約1,977行の純増を伴った。** `125ee38` の stat は追加3,072／削除1,095行（test込み）。Git temporary index による commit を jj に替え、jj adapter・policy、custody、人間 Git adapter、publish を分離した。理由は detached HEAD と Git hook 不実行。これは新しい知識要件ではなく、同じ保証を新操作面へ移す変更だった。後続 `6b408a2` は「jj land で OKF gate が抜ける」穴を公開時に塞いだ。

## 消費者の観察

**現在確認できる呼出し:** firedancer の `/home/fuyu/Workspace/firedancer/.claude/settings.json:13–21` と `.codex/hooks.json:3–12` は canonical soks の hook を指す。QOED の `/home/fuyu/Workspace/QOED/.claude/settings.json:20–27` も同じ root を指すが binary は `.local/bin`（firedancer の Codex は `.cargo/bin`）である。登録の存在を確認したのであり、この調査で binary 同一性・起動成功・Desktop 経路の強制力までは試していない。

この2 repo の現 root には `.gitmodules` / `soks/` がなかった。現在も submodule で読むと推定してはいけない。Workspace を対象とした `rr text 'soks' --glob '**/.gitmodules' --hidden` も一致しなかったが、ignore・checkout・path の範囲があるので全消費者不在の証明にはしない。polysearch root については今回読んだ settings に soks hook がなかった。未読の別経路までは否定しない。

**過去の消費者:** QOED の formatter事故（`cf9155f`）、firedancer の誤帰属（`ce4daad` / `dd4f23c`）、旧 README:83–170 の submodule 導入・pin・hook契約は具体的な consumer の記録である。`DOCTRINE.md:102–114` は消費依存を消費側の宣言とし、corpus に永続 consumer 一覧を持たない。したがって corpus 内に consumer registry がないことを理由に X とはしない。

**10月の実際の役割:** `R/20261015_dispatch-hearing.md:50` は worker が scratchpad に bundle を作り、soks-govern が alpha の唯一の書き手であり ws は要らないと報告する。これは9月の「各 session が共有作業木で admit」と同じ運用ではない。一方同記録:55 は land 3本が harness に止められたと述べ、:141–152 は external writer の許可、bundle を commit 祖先で追えないこと、command integration の冪等性未検証を挙げる。機械化の必要自体は現在も実在するが、その持ち主が corpus CLI とは限らない。

## 繰り返した肥大化のパターン

### 1. 書込みを hook へ集める → 読取りも止める → 構文・経路を精密化する

観測された連鎖は `bc5ea17` → `1a4841a` → `d972ee3` → `23faf05` → `d35b3f6`。初期 allowlist は必要な cargo と retrieve を止め、縮約した denylist の fallback は `/` に反応し、さらに AST が読めないことを path の言及へすり替えた。10/13 の firedancer 記録にも普通の multi-statement shell の拒否が残り、10/16 に heredoc 修正が入った。**10/13の実行 binary と9/17修正済み source が同一だったかは未確認**であり、一つの不具合が直らなかったとは断言しない。

これは「抜け道を見つけるたび無限に禁止を足した」だけの史実ではない。`d972ee3` と `d35b3f6` は明確に保護範囲を縮め、静的に証明できない引数は通す選択をしている（`src/shell_syntax.rs:13–16`）。その制約の下でも alias、redirection、vendor tool の面が増え、解析・fixture が膨らんだ、という説明が史料に合う。

### 2. 配給と書込みを同じ tree に載せる → 再収束 → 共有 canonical → custody・選択 commit

submodule の pin は凍結引用として有用（`DOCTRINE.md:106–109`）だが、そこで書くと正本への取込みと誤 push が問題になる。再収束を作り、symlink で再収束を消すと canonical が全員の作業木になり、書き手・著者・公開者の分離が必要になる（旧 README:68–76、`ec79e36`）。10/1 の `commit.rs` はその同居した変更から admitted paths だけを選ぶ。**推測:** ここは dx が継承する前に最も大きく前提を減らせる S の束である。

### 3. 規則が作業を不可能にする → 例外・baseline・後継で到達可能性を戻す

既存負債を hook に直結すると全員止まるため freeze を先に入れた（`e6f2fdd`）。証拠不変性の下で不備ある古い証拠を残すため、clean な後継を認識する SUPERSEDED を入れた（`012291c`）。未解決 supersedes を fatal にすると古い証拠を永久に詰ませるため advisory を維持した（`0247556`、`ac395df`）。read-depth の軸を置換できず partial を追加した（`e1e0ec8`）。**推測:** 不変性 D は残すべきだが、schema 変更と correction の進路を設計せずに規則だけ増やすと補償が累積する。

### 4. 機械化が意味を推測する → 実データで偽る → 判断不能を人へ返す

移設の再著述が引用・列・読解状態を失い（`1201b8b`）、deterministic transformer にした後も表の列位置、quote記号、read-depth語彙の推測が外れた（`scripts/migrate.ts:16–45`）。Markdown capture では数式の `|` と unit 別の凡例がさらに増分を生んだ。discard inventory も文字列一致で11MBの tree を移設済みと誤判定した（`273aa36`）。**推測:** 意味上の未知を FLAGS に明示して止める、小さな変換器の成功例と、その限界を示す。

### 5. 段を増やす → 毎回同じ儀式を合成する → 中間状態の復旧が増える

land は315文書の実測に基づく有用な縮約だった（`ba5281a`）。ただし filesystem の admit と VCS commit と index commit と push は別の効果であり、1 command にしても transaction にはならない。`ac395df` は「何も起きなかった」と読める error と、存在しない request による続行案内を修正した。10/15には land の実行中断も記録されている（`R/20261015_dispatch-hearing.md:55,152`）。**推測:** command 数の少なさと状態数の少なさを混同すると、使い勝手を改善した後に recovery が増える。

## Unix 哲学で分けるなら

以下は**推測・設計所見**であり、置換を実装・検証した結果ではない。行数を先に約束せず、実証済みニーズから入出力と責任を分ける。現在の module 単位をそのまま別 executable にするだけでは、共有状態と二重経路の費用は減らない。

| ニーズ | 小さな filter / 効果の境界 | 利用する既存の道具 | dx に残る領域固有の責任・残差 |
|---|---|---|---|
| 証拠・triad・参照の適格性 | corpus snapshot + proposed bundle → findings（path/ID/原因、非zeroを明示）。検証自体は書かない | OKF は base format、YAML/JSON parser は library。rr は入力を発見する手段 | **D:** role graph、authority key、evi不変性、correction、read scope。意味レビューは人/指定 reviewer。okf や git にこの意味はない |
| ID・索引・検索 | frontmatter → inventory、snapshot → index。検索 query → 位置つきの hit | UUID library、okf index、rr/ccc。検索実行の自己申告 receipt は作らない | **D:** stable ID と同一 authority の定義。意味的重複は別の判断。rr BUSY/NO_INDEX の伝達を成功扱いしない |
| 採録する byte の確定 | bundle + base revision → validated proposal（manifestとhash）。その proposal を一人の integrator が適用 | agx の dispatch/成果物/review、git/jj の immutable revision と diff、OS lock | **D:** 判定と実際に入る byte の一致。**S削減案:** worker は canonical に書かず外に bundle を作る。現在の10/15報告にも近い。ただし snapshot の世代ずれと同じ文書への複数提案は依然裁定が要る |
| commit・公開 | accepted proposal → revision → publication receipt。効果を持つ小さな入口を検証器から分離 | jj/git に選択・祖先・bookmark・pushを任せ、agxに統合段の順序と途中状態を返す | **D:** 公開前の領域gate。CAS、parent/path/byte一致の保証を誰が持つかは明示。既存の agx がすでに全保証を満たすとは今回確認していない |
| 書込み権限 | worker に read-only corpus と書ける bundle 領域。integrator だけ canonical 書込み可 | OS権限・sandbox、Claude/Codex harness、agxの実行境界 | **D:** 許す入口と対象の宣言。任意shell全文から効果を推定する soks固有parserは縮小候補。**残差:** tool/MCP/hookはBash sandbox外、symlinkとTOCTOU。harnessごとの実測が必要（R/dispatch-hearing:58–59,155） |
| 中断・復旧 | effect stage + durable receipt → 次の安全な操作。書込み済みと未書込みを分ける | filesystem atomic replace/lock、git/jj の revision、agx のrun記録 | **D:** 検証済みbyteとの一致。**S削減案:** staged proposalをcanonical外に置き、唯一のwriterが適用する。ただし複数fileをfilesystemに適用する以上、journal不要とは言えない。VCS履歴は未commitのbefore byteを自動保存しない |
| 著者とsessionの出所 | author identityとadmission/run provenanceを別 field で持つ | git/jj のauthor、agx run/session ID | **D:** 誰が何を採録したかの来歴。自己exportできるenvを認可としない。現 `custody.rs:35–41` と同じ教訓。暗号的認証が実装済みとは言えない |
| 人間 Git 経路 | 維持するなら同じ snapshot validator を adapter から呼ぶ。やめるなら経路そのものを閉じる | Git hook / jj wrapper / harness は各 tool の面で所有 | **未確定:** 人間Gitの現利用は未計測。使用を確認せず305行をXと決めない。二経路を残すこと自体が S の費用 |
| 過去 corpus の移設 | source table → bound records + FLAGS、旧新manifest → 差分と未解決項目 | テキストdiff、既存parser、専用の一度きりadapter | **D:** 情報を落とさない。source固有凡例は自動推測しない。完了したID移行と再収束verbは通常の採録CLIから外して史料に置く |

合成する通常経路の案は「worker の bundle → snapshot に対する validator → review で受理した manifest → 唯一の integrator → jj/git revision → 同じ validator で公開 tree を検査 → push receipt」。各段の file/JSON は inspect・保存・再投入でき、land はこの合成を便利に呼ぶ front end とする。失敗した段と既に起きた効果は別の出力欄にする。科学的な review を構造検査成功の欄へ混ぜない。

90%解として削れる候補は、汎用 shell の全効果推定、消費側配置を自動で作り替える relink/reconverge、検索したという自己申告の入場券、完了済み移行を通常動詞として残すこと。逆に、検証したbyteの一致・外部編集を上書きしない recovery・証拠訂正の系譜は、低頻度でも現在の約束に含まれるため「10%」として無言に落とせない。

## 反例、限界、次に確かめること

- **反例への照合:** 「推測だけで増えた」に対し、formatter dirty、誤著者、誤push、移設の喪失、通常shellの誤拒否、rollback receipt不整合、初回push argv上限という具体例がある。「全部を維持すべき」に対しては、baseline/battery/write/human-author bypass/relink/reconvergeを既に実務判断で退役した反例がある。両方を残して判定した。
- **区別:** 原史料が述べる事故・commit日・現行関数・登録は確かめた事実。D/T/S/X、Unix分解、前提を減らす効果の予測は推測。module が大きいというだけで削除可能とはしない。逆にtest consumerがあるだけで通常の製品機能を残す必要とも判定しない。
- **未確認:** Rustを選んだ元会話の全指示、9/17最初のjournal追加に直接対応する過去クラッシュ、現人間Git経路の利用頻度、移設scriptの現在の新規利用、全consumerの一覧、10/13実行binaryの版、agxが現行のcommit/publish保証を代替できるか。これらを「事故がなかった」「consumerがいない」とは置換しない。
- **分解案の受入試験（未実行）:** 他者の変更があるsnapshotで受理manifest以外のpathがcommitされない、同一文書の古いproposalが競合する、中断した各段の再開が二重適用しない、evi更新/削除を拒否し後継訂正を許す、workerのtool・shell・MCPからcanonicalへ書けない、公開対象treeそのものを検証する。既存testの単なる通過ではなく、新境界でもこれを確かめる必要がある。
- **変更範囲:** このノートのみ。読み取り調査なのでversion、CHANGELOG、changesetは追加しない。コード試験・install・hook修理・ccc登録・履歴操作は行わない。

指定検査: `test -s notes/genealogy/soks.md` を作成後にforegroundで実行し、exit 0。対象コードの試験は実行していない。
