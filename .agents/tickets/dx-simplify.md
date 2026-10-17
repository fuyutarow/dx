+++
schema = 2
name = "dx-simplify"
outcome = "dx から、使う人のいない機能と、呼び出し側の道具に任せられる仕組みが消える。消すのは次の 4 つ。(1) 判定を子プロセスに出して SIGKILL で時間を区切る仕組み（src/worker.ts と、main.ts の内部の stderr のやりとり）と [limits] check_seconds、(2) dx schema、(3) [review] pass の設定、(4) それぞれの試験と文書。外から見える判定（finding の組と終了コード 0〜4）は、retrospectives と soks の影運用で変わらない。spec.md と README を直し、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 3600
premises = ["file:docs/spec.md", "file:src/main.ts", "file:src/worker.ts", "file:src/commands/schema.ts"]

[proposition]
id = "DX-SIMPLIFY"
claim = "dx は、時間の上限を呼び出し側（timeout(1) や agx の timeout_s）に任せ、使う人のいない schema と合否のしきい値の設定を消しても、記録の受け入れの判定を何も変えない"
refuted_by = "retrospectives か soks の影運用で、消す前と後の finding の組か終了コードが変わる（その差を返す）"
+++

**base:design-2610.2 の見直し（owner の依頼「不要な実装をパージして。simplify できるはずです」）で、coordinator が決めた削除です。**

## 何を消すか、なぜか

| 消すもの | 今の行数（目安） | 理由 |
|---|---|---|
| 判定を子プロセス（`src/worker.ts`）に出し、`AbortSignal` と SIGKILL で時間を区切る仕組み。親子のあいだの JSON と、stderr の内部のやりとり（`DX_INTERNAL_REVIEW_WAIT` / `READY`）。`[limits] check_seconds` | worker.ts 90、main.ts の約 70 | 実行時間の上限は、呼び出し側が持つ（`timeout 120 dx check`、agx の `timeout_s`、CI）。Unix の「既にある道具に任せる」。この仕組みがあったせいで、性能を比べるときに「変える前」が打ち切られ、比べられなかった（run 215056e1）。外への待ち（review の 1 件 120 秒、land の fetch・push の 60 秒）は I/O なので、同じプロセスの中の AbortSignal で区切れる。それは残す。 |
| `dx schema` | commands/schema.ts 16 と試験 | 使う人がいない。retrospectives、soks、research_record のどれも使っていない。spec §2 の原則（機能は使う人と check を持ったときだけ入れる）。要る人が出たら足し直す。 |
| `[review] pass`（合否のしきい値の設定） | config と review の一部 | 0.5 以外で使う人がいない。dotfiles の `agx judge` も「p ≥ 0.5」を固定にしている（rubric の分け方の合意）。設定の項目を減らす。0.5 は定数として残す。 |

**消さないもの:** `[limits]` の `record_bytes`、`records`、`links_per_record`。データの大きさの上限は、同じプロセスの中で安く確かめられ、Tiger Style の「資源の上限を明示する」に当たる。超えたら今までどおり終了コード 4。

## 前の回（run 40ac2f8b）の返却を受けての決定（coordinator。最新版）

- soks の影運用の `dx.toml` には `[limits] check_seconds = 1200` がある。設定を厳格に読む（知らない項目を拒否する）ので、項目をそのまま消すと exit 4 になる。
- **決定:** spec §5 C5（消すときは 1 つの版のあいだ警告を出してから消す）に従う。`dx.toml` の項目も、公開している面に含まれる。
  - `[limits] check_seconds` と `[review] pass` は、0.1.x のあいだは受け付けて無視し、stderr に `dx: warning: <key> is deprecated and ignored` を 1 行出す。
  - 0.2.0 で、知らない項目として拒否する。spec の C5 の表に、この 2 つの項目の予定を書く。
  - ほかの知らない項目は、今までどおり拒否する（exit 4）。
- 比べ方: soks の写しは、`check_seconds` を残したままのものと、消したものの両方で流す。どちらも、消す前の dx と finding の組・終了コードが一致すること。

## やること

1. 上の 3 つを消す。同じプロセスの中で、判定したものを全部出し終えてから stdout に書く、という性質は保つ。判定できないときは、stdout を空にして終了コード 4（C4）。今は子プロセスがこれを担っているので、消した後も同じ性質を保つこと。
2. 外への待ちの上限（review の 120 秒、land の 60 秒）は、同じプロセスの中で保つ。
3. 判定が変わらないことを確かめる。
   - 今の試験（時間の上限と schema の試験は除く）が、すべて通ること。
   - retrospectives の写しと、soks の影運用の写し（`/home/fuyu/Workspace/soks.ws/ws_dx-shadow` を写したもの。読むだけ）で、消す前と後の finding の組の SHA-256 と終了コードが一致すること。soks は時間がかかるので、上限を気にせず流してよい。
4. spec.md を直す。
   - §5 の表と C1〜C5 から schema を消す。§6 から `check_seconds` と `[review] pass` を消す。
   - §9 に D10 として「時間の上限は呼び出し側が持つ。schema と pass の設定は、使う人がいないので消した」を書く。
   - README も合わせる。
5. この issue は、dx-preset（標準プリセットを当てる作業）を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 消した行数（src と tests）
- 判定の一致の確かめ（retrospectives と soks の SHA-256 と終了コード）
- `mise run check` の結果
- spec の差分の要約
