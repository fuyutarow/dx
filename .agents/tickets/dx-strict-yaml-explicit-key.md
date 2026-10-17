+++
schema = 2
name = "dx-strict-yaml-explicit-key"
outcome = "markdown-frontmatter のアダプタが、明示のキーの形（`? a` の次の行に `: x`）を、キーが scalar であっても format の finding として拒否する。soks の反例が拒否される試験があり、retrospectives と soks の写しで、ほかの判定は変わらず、mise run check が通って返る"
writes = ["src/**", "tests/**"]
verify = ["mise run check"]
timeout_s = 1200
premises = ["file:src/formats.ts", "file:/home/fuyu/Workspace/soks.ws/ws_dx-shadow/.dx-shadow-artifacts/yaml-retire-counterexample.json"]

[proposition]
id = "DX-STRICT-YAML-EXPLICIT-KEY"
claim = "明示のキーの指示子 `?` を、構文木の node ではなく source の token（またはそれに当たる印）で見れば、scalar のキーでも拒否できる"
refuted_by = "yaml@2.9.1 の構文木から、明示のキーかどうかを見分けられない（理由を返す）"
+++

**dx-strict-yaml（run 5851ad6a）の抜けの修理です。** soks の yaml-policy.ts を退役させる途中で見つかりました。

## 事実

```
? a
: x
```

この frontmatter が、format の finding を出さずに `{a: "x"}` として受け付けられる。dx-strict-yaml の範囲では「`?` のキーを拒否する」としていたので、仕様と食い違っている。soks の見立て: 拒否の判定がキーが scalar でない場合だけを見ているか、source の token ではなく、parse した後の node を見ているのではないか。

証拠: `/home/fuyu/Workspace/soks.ws/ws_dx-shadow/.dx-shadow-artifacts/yaml-retire-counterexample.json`（読むだけにする）

## 追加の要件（DevX ヒアリング、soks。2026-10-18）

文書全体で禁止する文字を、markdown-frontmatter と toml のアダプタで拒否する（format の finding）。対象は、C0 の制御文字（タブと LF は除く）、C1 の制御文字、U+FEFF（BOM を含む）、U+2028、U+2029、U+FFFE、U+FFFF、LF を伴わない CR。どの repo にも共通の衛生なので、設定の項目は足さない。soks の `.dx/helpers/document-text.ts` を手本として読んでよい。retrospectives と soks の写しで、新しく出る finding を一覧にする（既存の記録は I-02 で残る）。

## やること

1. 明示のキーの指示子 `?` を、キーが scalar でも、複合のものでも拒否する。yaml の CST（token）か、構文木の node の source の位置で確かめる。
2. 試験: 上の反例、flow の中の `?`、複合のキーを置く。
3. retrospectives と soks の写しで、`dx check --base 'root()'` の出力が、直す前と同じであることを確かめる（新しい format の finding が出るなら、一覧にする）。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 直した箇所
- 試験
- 写しでの比較
- `mise run check` の結果
