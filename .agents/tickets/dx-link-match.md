+++
schema = 2
name = "dx-link-match"
outcome = "type の links の宣言に match（正規表現。capture group の 1 番を id とする）を書ける。値が match に当たるものだけが link として I-04 の対象になり、当たらない値（URL や引用）は無視される。match を書かない宣言は今と同じに振る舞う。spec §7 と README を更新し、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/checks.ts", "file:src/model.ts"]

[proposition]
id = "DX-LINK-MATCH"
claim = "links に match を足せば、外部の参照と内部の id が混ざったフィールドでも、内部の id だけに I-04（参照先の実在、型、循環）を dx 本体でかけられる"
refuted_by = "soks の sources / sok_supersedes で、match を使った宣言が、soks の自前の検査（citations.ts、supersedes.ts）と違う判定を出す（その差を返す）"
+++

**soks から報告された、dx の API の抜けです。**

## 事実（soks のセッションの報告）

- soks の `sources` と `sok_supersedes` の配列には、外部の資料（URL、引用）と、内部の `urn:uuid:<id>` が混ざっている。
- dx の `links` はフィールドの文字列をすべて id として読むので、soks は引用の解決、重複の検査、supersedes の参照先の検査を自前で書いている（citations.ts、supersedes.ts、identity.ts の一部）。

## 追加の要件（research-record-v2 から。2026-10-17）

- v2 の記録は、v1 の object を `dx:research-record-v1/<hex id>` で指す（spec R-5 の予約の形）。
- 決定: link の値が `dx:<name>/<id>` の形で、`<name>` が自分の repo の `[repo] name` と違うときは、repo をまたぐ参照として扱い、I-04 の検査をしない（spec R-5 のとおり、形だけを確かめる）。`<name>` が自分の repo と同じときは、`<id>` を内部の id として I-04 にかける。spec §7 と R-5 に、この扱いを書く。
- 試験: repo をまたぐ値が I-04 で指摘されないこと。自分の repo を指す `dx:` の値が、内部の id として検査されること。

## やること

1. links の宣言に `match: "<正規表現>"` を足す。例: `links: { sources: { to: ["evi","sok"], match: "^urn:uuid:(.+)$" } }`。当たった値の capture group の 1 番を id とする。当たらない値は link ではない。
2. 正規表現が壊れていたり、capture group が無かったりしたら、判定できない（exit 4）。理由を出す。
3. match を書かない宣言は、今と同じに振る舞う（後方互換）。
4. 試験: 混ざったフィールドで、内部の id だけが I-04 の対象になること。当たらない値が無視されること。壊れた match で exit 4 になること。
5. 確かめ: soks の影運用の写し（読むだけ）で、`sources` と `sok_supersedes` を match つきの宣言にした写しを作り、soks の自前の検査と同じ finding になることを確かめる。差があれば返す。
6. spec §7 と README に書き足す。

この issue は、dx-strict-yaml を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 宣言の形
- 試験
- soks との照合
- `mise run check` の結果
