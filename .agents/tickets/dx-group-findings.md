+++
schema = 2
name = "dx-group-findings"
outcome = "finding が、複数の記録にまたがるもの（ids: [...]）を持てる。強化した I-02 は、ids のどれかが新しいか変わった記録なら、その finding を new として扱う。soks の 3 文書の組（sok/pro/led）の指摘が、仮の id ではなく ids で表せる。spec の I-02 と §7 を直し、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/findings.ts"]

[proposition]
id = "DX-GROUP-FINDINGS"
claim = "finding に ids（関わる記録の集まり）を持たせれば、複数の記録にまたがる規則の指摘も、I-02 の「変えた記録は潔白」に正しくかかる"
refuted_by = "ids を持つ finding の key が版をまたいで安定せず、I-02 の新旧の判定が揺れる（その例を返す）"
+++

**DevX ヒアリング（soks 2(g)）で見つかった、invariant の穴です。**

## 事実

- soks の 3 文書の組（sok/pro/led）の違反は、仮の id `unit/<uuid>` に付けている。この id は記録ではないので、強化した I-02 の「変わった記録の自分の finding」に当たらず、`new:false` のまま残ってしまう（soks の rv4 の F3）。
- soks は、組のすべての記録に同じ finding を付けて、回避している。複数の記録にまたがる規則があるたびに、同じことが起きる。

## やること

1. `FindingInput` に、`ids?: string[]`（関わる記録の id の集まり）を足す。`id` と `ids` の両方は持たない（どちらか 1 つ）。
2. I-02: `ids` のどれかが、新しい記録か変わった記録なら、その finding は `new:true`。
3. finding の `key` には、`ids` を並べ替えて入れる（順序に依らず安定させる）。
4. 試験: 組のうち 1 つだけを変えたときに new になること。どれも変えなければ既存として残ること。key が順序に依らないこと。
5. spec の I-02 と §7、README を直す。

この issue は、dx-devx-batch を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 型と規則の変更
- 試験
- `mise run check` の結果
