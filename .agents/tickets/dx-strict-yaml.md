+++
schema = 2
name = "dx-strict-yaml"
outcome = "markdown-frontmatter のアダプタが、frontmatter の YAML を、意味が 1 つに決まる形だけ受け付ける。次のものは format の finding として拒否する（既定でそうする。設定の項目は足さない）: どの深さでも重複するキー（flow の {\"a\":1,\"a\":2} を含む）、anchor と alias、merge の <<、tag、? の複合キー、文字列でないキー、文字列の値の中の U+0085 と U+FEFF。retrospectives と soks の影運用で、新しく拒否される記録が理由とともに一覧になり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md", "package.json", "bun.lock"]
verify = ["mise run check"]
timeout_s = 3000
premises = ["file:docs/spec.md", "file:src/formats.ts", "file:/home/fuyu/Workspace/soks.ws/ws_dx-shadow/.dx/helpers/yaml-policy.ts"]

[proposition]
id = "DX-STRICT-YAML"
claim = "frontmatter の曖昧な YAML を format の finding にしても、今の retrospectives と soks の受け入れた記録の判定は、変えた記録の潔白（I-02）の範囲でしか変わらない"
refuted_by = "既に受け入れた、変わっていない記録で、新しく拒否されるものが出る（その記録と理由を返す）"
+++

**soks から報告された、dx の側の正しさの欠陥です。**

## 事実（soks のセッションの報告）

- 今のアダプタ（Bun の YAML）は、重複するキーに対して、黙って最後の値を採る。merge の `<<` も展開する。そのため `fields` に、何も言わずにデータが失われたり、意味が曖昧になったりすることが起きる。これはどの repo にも関わる正しさの問題。
- soks は、これを `.dx/helpers/yaml-policy.ts`（156 行）で自前で塞いでいる。手本としてそれを読んでよい。コピーではなく、dx のアダプタに一般化して入れる。

## やること

1. frontmatter の YAML を、上の構文を検出できる方法で読む。重複キーなどを報告できる YAML の parser（たとえば npm の `yaml` を uniqueKeys や strict の指定で使う）、または前処理で検出する。依存を足すなら、版を固定し、プリセットの依存の方針に合わせる。
2. 拒否するものは format の finding にする（check の名前は安定させる）。既存の記録は I-02 によって、変わっていなければ残る。
3. 試験: それぞれの構文について、拒否される例と、通る素直な YAML の例を置く。
4. 影運用: retrospectives の写しと soks の写し（読むだけ）で、`dx check --base 'root()'` の前と後を比べ、新しく出る format の finding を一覧にする。受け入れた履歴の標本で、新しく拒否される land が出ないことを確かめる。
5. spec §7 に、frontmatter が受け付ける YAML の範囲を書く。

この issue は、dx-land-sync を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 方法と依存
- 試験
- 影運用で新しく出る finding の一覧
- `mise run check` の結果
