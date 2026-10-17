+++
schema = 2
name = "dx-devx-batch"
outcome = "DevX ヒアリング（2026-10-18、3 repo）で挙がった、dx の側の摩擦が直る。(1) dx check の stdout は新しい finding だけを出し、既存の件数は stderr の要約に出す。(2) remote に branch がまだ無いときの既定の base は空の木（root()）とする。(3) 廃止した設定の項目（[limits] check_seconds、[review] pass）は、知らない項目として exit 4 にする。(4) .dx/ の読み込みに失敗したとき、失敗したモジュールのパスと原因の 1 行を stderr に出す。(5) review が I-10 で断るとき、「I-10: 既存の finding N 件を先に消す」と 1 行で出す。(6) [files] ignore の既定に **/node_modules/** を入れる。spec と README を直し、retrospectives と soks の写しで判定（終了コード、新しい finding の組）が変わらないことを確かめ、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 3000
premises = ["file:docs/spec.md"]

[proposition]
id = "DX-DEVX-BATCH"
claim = "この 6 つの変更は、判定（終了コードと新しい finding の組）を変えずに、出力と診断と既定値だけを直す"
refuted_by = "retrospectives か soks の写しで、終了コードか新しい finding の組が変わる（その差を返す）"
+++

**DevX ヒアリングの結果（coordinator がまとめ、base:design に照らして決めたもの）です。**

## 根拠（各 repo の回答）

| # | 摩擦 | 出所 |
|---|---|---|
| 1 | stdout に既存の finding が毎回約 1,100 行出る。新しい finding だけを見るには grep が要る | retrospectives 2(b) |
| 2 | 新しい repo と試験の repo では alpha@origin が無いので、既定の base で exit 4 になる | retrospectives 2(c)、research-record-v2 2(d) |
| 3 | 効かない設定の項目が、警告を出して受け付けられるのは迷う | retrospectives 3。0.1.0 の 1 つの版の間、警告を出したので、spec C5 に従って消してよい |
| 4 | .dx/ の読み込みに失敗すると `UNDETERMINED:Bundle failed` だけが出て、原因が分からない | soks 2(e)（run 61a3443a） |
| 5 | review が断ったとき、それが I-10 だと書いていない | retrospectives 2(e) |
| 6 | [files] ignore は依存のため以外に使う場面が無く、誤用の元になった | research-record-v2 6 |

## やること

1. stdout に出す finding を、新しいもの（`new:true`）だけにする。stderr の要約（「新しい finding N 件 / 既存 M 件」）は残す。全体を監査したいときは、今までどおり `--base 'root()'` を使う（すべてが新しい finding になる）。spec の C3 を直す。
2. `<branch>@<remote>` が無いとき（remote にまだ branch が無いとき）の既定の base を、jj の root（空の木）にする。stderr に 1 行「base: remote branch absent; using root()」と出す。明示した `--base` が無いときは、今までどおり exit 4。
3. `[limits] check_seconds` と `[review] pass` を、知らない項目として exit 4 にする（警告を出して無視するのをやめる）。spec の C5 と §6 を直す。
4. .dx/ の bundle や import に失敗したとき、stderr に `UNDETERMINED:policy: <path>: <原因の 1 行>` を出す。
5. review が I-10 で記録を飛ばすとき、stderr に `REVIEW_BLOCKED: <id>: I-10: 既存の finding N 件を先に消す` を出す。
6. `[files] ignore` の既定に `**/node_modules/**` を入れる（書いた値には足すのではなく、既定を置き換える形で書けるようにする。spec §6 に書く）。
7. 判定が変わらないことを確かめる: retrospectives と soks の写しで、終了コードと、新しい finding の組（stdout）を、変える前の `new:true` の行だけを取り出したものと比べる。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- 判定の比較
- `mise run check` の結果
