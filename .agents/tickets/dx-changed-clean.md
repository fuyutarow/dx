+++
schema = 2
name = "dx-changed-clean"
outcome = "dx check が spec.md の強化した I-02 を守る。新しい記録と変わった記録は、自分の finding を（既存のものも含めて）1 つでも持てば拒否される。変わっていない記録の既存の finding は残してよい。retrospectives と soks の影運用で、判定の変わる記録が理由とともに一覧になり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/findings.ts", "file:src/checks.ts"]

[proposition]
id = "DX-CHANGED-CLEAN"
claim = "「変わった記録は潔白」を足しても、今の正しい land（retrospectives の履歴、soks の受け入れた履歴の標本）は拒否されない"
refuted_by = "retrospectives か soks で、すでに受け入れた履歴の commit が、新しい規則で拒否される（その commit と finding を返す）"
+++

**soks の移行の phase 2a で見つかった、dx の方針の差の修理です（spec の I-02 を強化した）。**

## 事実

- soks-govern の L（変更した文書は必ず潔白にする）と、retrospectives の旧い gate（追加・変更した記録だけに決定的な検査をかける）は、どちらも「変えた記録は潔白に」を求めていた。
- dx の I-02 は「新しい finding の key が無い」だけを見ていた。そのため、既存の違反を持つ記録を、違反を残したまま変えても通っていた（soks の cli.rs:931 の fixture）。

## やること

1. check に、次の規則を足す。head で新しい記録、または変わった記録（記録の sha256 が base と違う）は、自分に結びついた finding（`id` が一致するもの）を 1 つでも持てば、`new:true` として扱う。変わっていない記録の既存の finding は、今までどおり `new:false`。
2. 試験を足す。
   - 既存の違反を持つ記録を、違反を残したまま変える → 拒否
   - 同じ記録の違反を消してから変える → 通る
   - 変わっていない記録の既存の違反 → 残る
3. 影運用で確かめる。
   - retrospectives: origin の alpha の履歴の各 land について、新しい規則で拒否される commit があるかを調べる（2026-10-17 の 1478ce50 で、記録の finding を消してから変えているので、無いはず）。
   - soks: 受け入れた履歴の標本（`/home/fuyu/.cache/soks-coord/dx-snap-1` の設定。読むだけ）で、同じことを調べる。
   - 拒否される commit があれば、止めずに一覧にして返す。それは移行の残差として coordinator が扱う。
4. README に、新しい規則の 1 行を足す。

この issue は、dx-simplify を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- 試験
- 影運用で、判定が変わる commit の一覧
- `mise run check` の結果
