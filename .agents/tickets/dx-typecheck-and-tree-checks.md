+++
schema = 2
name = "dx-typecheck-and-tree-checks"
outcome = "dx の type 定義の API が、木全体を対象にする check（tree checks: (tree) => findings）と、check のあいだで共有できる索引（tree.index など）を持つ。さらに `dx typecheck` が、repo の .dx/ を、dx が export する型と同じ版の zod・neverthrow に対して型検査する（repo の側に TS の道具は要らない）。spec.md と README を更新し、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 3600
premises = ["file:docs/spec.md", "file:src/index.ts", "file:src/policy.ts"]

[proposition]
id = "DX-TREE-CHECKS"
claim = "dx の API に木全体の check と共有の索引を足し、.dx/ の型検査を dx 自身で行えば、各 repo は回避策（最初の記録のときだけ全体を検査する）も、自前の TS の道具も要らなくなる"
refuted_by = "既存の 2 つの repo（retrospectives、soks の影運用の .dx/）の判定が、新しい API に移すと変わる（その差を返す）"
+++

**2 つの repo の移行で見つかった、dx の API の抜けです。**

## 事実

- soks の `.dx/helpers/check.ts` は、木全体の検査を、`record === tree.records[0]` のときだけ行う回避策で書いている。dx の check が記録ごと（`(record, tree) => findings`）にしか書けないため。helper ごとに、同じ id の索引を作り直している。
- retrospectives は tools/ を消す予定で、そうすると `.dx/*.ts` の型検査と lint が無くなる。

## やること

1. type 定義に `treeChecks: [(tree) => FindingInput[]]` を足す（名前は spec の命名に合わせて決める）。base 側と head 側で、それぞれ 1 回ずつ呼ぶ。I-02 の数え方は今と同じにする。
2. `tree` に、type と id で引ける共有の索引を足す（1 回の評価の中で 1 度だけ作る）。
3. `dx typecheck [REV]` を足す。REV の `.dx/` を一時の場所に取り出し、dx の型の宣言と、固定した版の zod と neverthrow を置いた tsconfig で、`bun check` を流す。`bun check` の誤りは finding の形で出す。終了コードは spec に合わせる（型の誤りは 1、判定できないときは 4）。bun 1.4.3 以上が PATH に要ることを README に書く。
4. 旧い API（記録ごとの check）は残す。後方互換を保つ。
5. 確かめ:
   - retrospectives の写しで、判定が変わらないこと。
   - soks の影運用の `.dx/`（`/home/fuyu/Workspace/soks.ws/ws_dx-shadow`。読むだけ。写しを使う）を tree checks に書き換えた写しで、判定が変わらないことと、時間がどれだけ変わるかを測る。
   - `dx typecheck` が、型の誤りを入れた `.dx/` で落ち、正しい `.dx/` で通ること。
6. spec.md の §5 と §7 に、新しい API とコマンドを書き足す。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 新しい API とコマンドの形
- 確かめの受領（判定の一致、時間）
- `mise run check` の結果
