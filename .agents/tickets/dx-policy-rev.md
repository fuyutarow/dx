+++
schema = 2
name = "dx-policy-rev"
outcome = "dx check に `--policy REV` があり、dx.toml、.dx/、[files] inputs を、head ではなく指定した revision から読む。過去の履歴を今の規則で判定する（US-06 の監査、移行の再生）ときに、規則を足した写しの revision を作らずに済む。既定は今までどおり head。spec と README を直し、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/policy.ts", "file:src/config.ts"]

[proposition]
id = "DX-POLICY-REV"
claim = "規則を読む revision を、判定する木と切り離して指定できるようにしても、既定（head の規則で base と head を数える）の判定は変わらない"
refuted_by = "`--policy` を省いたときの判定が、変える前と違う（その差を返す）"
+++

**DevX ヒアリング（soks 2(a)）で挙がった摩擦です。**

## 事実

- 設定と規則は、head の revision からしか読めない。そのため、過去の履歴を今の規則で流し直すたびに、「base + 規則」と「head + 規則」の写しの revision を作り、それが元と同じであることを確かめる必要があった。
- 1 回は、その準備を誤って `UNDETERMINED:jj: Error: No such path: dx.toml` になった（p2b-c3 の初回）。
- 再生や影運用のたびに起きる。US-06（監査する者が、正規の branch の範囲を後から判定する）の、ふつうの使い方でもある。

## やること

1. `dx check --policy REV [--base REV] [REV]` を足す。dx.toml、.dx/、[files] inputs を REV から読む。判定する木（base と head）はそのまま。
2. I-09（.dx/ を変える change は、ほかの記録を一緒に変えない）は、`--policy` を指定したときには検査しない（規則を判定の対象から切り離しているため）。そのことを stderr に 1 行出す。
3. `--policy` を省いたときは、今までどおりにする（head の規則）。
4. 試験: 規則を持たない過去の commit を、`--policy alpha` で判定できること。省いたときの判定が変わらないこと。
5. spec の §5（C1 の表）と US-06 に書き足す。

この issue は、dx-group-findings を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- 試験
- `mise run check` の結果
