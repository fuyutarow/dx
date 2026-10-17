# dx.toml と kinds

状態: 草案（2026-10-17）。コマンドは [cli.md](cli.md)、責務は [needs.md](needs.md)。

## 置き分け

| 置き場 | 書くもの | 形 |
|---|---|---|
| `dx.toml` | store 全体の配線の値（名前、push 先、判定エンジン、上限、読まないパス） | データ（TOML） |
| `kinds/` | 記録の種類ごとの規則（置き場所、形式、id、schema、辺、凍結、rubric、追加の検査、ビュー） | コード（TypeScript）。3 文書の組や予測の順序のように、論理が要る規則があるため |

`dx.toml` に規則は書かない。`kinds/` に配線の値は書かない。

## dx.toml

```toml
[store]
name     = "retrospectives"   # 別の store から引くときの名前（dx:<name>/<id>）
remote   = "origin"           # land が push する remote
bookmark = "alpha"            # 正規の線
kinds    = "kinds/index.ts"   # kinds の入口

[judge]
command = ["agx", "jev"]      # stdin に JSON の要求を 1 つ受け、stdout に JSON の答えを返すコマンド
pass    = 0.5                 # 判定の確率がこれ以上なら、その問いに合格

[limits]                      # 超えたら判定できない（終了コード 4）。黙って打ち切らない
record_bytes     = 4194304    # 1 記録の大きさ（4 MiB）
records          = 200000     # store の記録の数
edges_per_record = 10000
check_seconds    = 120

[scan]
ignore = ["records/raw/**", "tools/**", "README.md"]   # dx が読まないパス
strict = false                # true なら、どの kind にも当たらないファイルを指摘する
```

既定値:

- `remote = "origin"`
- `bookmark = "alpha"`
- `judge.command = ["agx", "jev"]`
- `judge.pass = 0.5`
- `strict = false`

既定値で足りる store の `dx.toml` は、`[store] name` の 1 行だけで済む。

## kinds

kind は「記録の種類」のこと。kind ごとに 1 つずつ定義を書く。retrospectives なら記録の種類は 1 つ（振り返りの記録）、soks なら evi・sok・pro・led の 4 つ、research_record なら statement・evidence・arena などになる。

```ts
// kinds/retro.ts（retrospectives の例。中身は今の schema.ts と check.ts）
import { defineKind } from "dx";
import { Frontmatter, CONCEPT_NAME } from "./schema.ts";
import { undefinedCodes, timelineProblems, checkLink } from "./check.ts";

export default defineKind({
  name: "retro",
  match: "records/*.md",                 // どのファイルがこの種類か
  format: "markdown-frontmatter",        // 読み方（md+YAML、TOML など。dx が持つアダプタから選ぶ）
  id: (file) => file.name,               // id をどこから取るか（ファイル名、frontmatter のフィールド、digest）
  name: CONCEPT_NAME,                    // ファイル名の規則
  schema: Frontmatter,                   // frontmatter の型（zod）
  edges: { superseded_by: { to: "retro" } },        // 辺の名前と、指してよい種類
  frozen: false,                         // 一度入れたら変えてはいけないか
  rubric: {                              // Jev に何を問うか
    file: "rubrics/retro-review-v4.toml",
    verdict: "embedded:review",          // 判定の置き場: 本文に埋め込む / "sidecar:<glob>" で別の記録にする
  },
  rules: [undefinedCodes, timelineProblems, checkLink],   // この種類に固有の検査
  views: {},                             // dx derive で出せるビュー
});
```

soks の evi なら、次のように書く。

- `frozen: true`
- 判定は別の記録として置く（`verdict: "sidecar:…"`）。凍結した本文には書き込めないため。
- 3 文書の組と引用の検査は `rules` に書く。
- 索引は `views: { index, keys }` に書く。

research_record の prediction なら、「試験される prediction は base の木にある」を `rules` に、status の導出を `views` に書く。

dx がすべての kind に必ずかける検査は、次の 5 つである。kind に書く必要はない。

1. 凍結
2. 参照先の実在と循環
3. id の重複と付け替え
4. 判定の結びつき
5. 新しい違反を増やさないこと
