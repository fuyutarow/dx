+++
schema = 2
name = "dx-tree-checks"
outcome = "dx の type 定義の API が、木全体を対象にする check（tree checks: (tree) => findings）と、check のあいだで共有できる索引（tree.index など）を持つ。spec.md と README を更新し、mise run check が通って返る"
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

## 追加の要件（soks から。2026-10-17）

- soks の規則は `.leakcheck`（漏洩の denylist）を木の入力として読むが、`.leakcheck` はどの type にも当たらない。
  - `[files] ignore` に入れると snapshot から消え、check が「missing .leakcheck」で落ちる。
  - 残しておくと、`strict = true` がそれを指摘する。
  - 証拠: `/home/fuyu/Workspace/soks.ws/ws_dx-shadow/.dx/tests/boundary/cfg-return.json`
- そこで `[files] inputs = ["<glob>", …]` を足す。当たったファイルは snapshot に残り、`tree.read` と `tree.files` で読める。記録としては読まれず、`strict` の指摘からも外れる。
- 決めること: `inputs` の中身が変わったら、その変化を I-09（`.dx/` を変える change と同じ扱い）に入れるか。`inputs` は規則の入力なので、`.dx/` と同じく「規則の変更」として扱い、ほかの記録と一緒に変えるのを禁じる。そう扱う理由を spec に書く。

## やること

1. type 定義に `treeChecks: [(tree) => FindingInput[]]` を足す（名前は spec の命名に合わせて決める）。base 側と head 側で、それぞれ 1 回ずつ呼ぶ。I-02 の数え方は今と同じにする。
2. `tree` に、type と id で引ける共有の索引を足す（1 回の評価の中で 1 度だけ作る）。
3. （`dx typecheck` は作らない。coordinator の決定: 壊れた .dx/ は読み込みや実行の時点で exit 4 になる。型検査が要る repo は .dx/ の側で bun check を流す。）
4. 旧い API（記録ごとの check）は残す。後方互換を保つ。
5. 確かめ:
   - retrospectives の写しで、判定が変わらないこと。
   - soks の影運用の `.dx/`（`/home/fuyu/Workspace/soks.ws/ws_dx-shadow`。読むだけ。写しを使う）を tree checks に書き換えた写しで、判定が変わらないことと、時間がどれだけ変わるかを測る。
6. spec.md の §5 と §7 に、新しい API とコマンドを書き足す。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 新しい API とコマンドの形
- 確かめの受領（判定の一致、時間）
- `mise run check` の結果
