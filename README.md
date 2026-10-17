# dx

Bun TypeScript で実装した、jj の revision から記録を読む CLI です。仕様の正本は
[docs/spec.md](docs/spec.md) 版 1 です。この 0.1.0 は `ls`、`check`、`review`、`land`、`view` を実装します。
既存 3 repo の型定義と移行は別 issue です。

```sh
mise run setup
bun src/main.ts --version
bun src/main.ts -V
bun src/main.ts --help
bun src/main.ts ls @
bun src/main.ts check --base alpha@origin @
bun src/main.ts review @
bun src/main.ts land @-
bun src/main.ts view --list
bun src/main.ts view index @
mise run check
```

呼び出す cwd は対象 jj repo 内です。`dx` package の `bin` は `src/main.ts`、公開 API は
`src/index.ts` にあります。ソース版には Bun 1.4.3 以上と jj と Git が PATH に必要です。
mise は Bun 1.4.3 に固定し、package.json の engines にも最低版を宣言しています。
型検査は既存の tsconfig.json を使う `bun check`（`mise run typecheck`）で行います。
tsgo（`@typescript/native-preview`）は不要です。依存の固定版は package.json と bun.lock にあります。
oxlint・oxfmt・oxlint-tsgolint は lint・整形用の開発依存として保持します。

## 単体バイナリと mise

公開済みの release は、利用する repo の `mise.toml` で版を固定して入れられます。
以下は version 0.1.0 を公開した後の例です。

```toml
[tools]
"github:fuyutarow/dx" = { version = "0.1.0", bin_path = "bin" }
```

```sh
mise install
mise exec -- dx -V
```

単体版は Bun のインストールが不要です。jj と Git は引き続き PATH に必要です。
revision 内の `.dx/*.ts` と helper は、単体版に含まれる Bun でメモリ内に bundle し、
動的 import します。`dx`・`zod`・`neverthrow` は単体版に含まれる固定版を共有します。

配布物を作る場合は、依存をインストールしたこの repo で実行します。

```sh
mise run setup
mise run release:build
```

`bun build --compile` で Linux x64 と macOS arm64 をビルドし、package.json の version から
`dist/dx-<version>-linux-x64.tar.gz` と `dist/dx-<version>-darwin-arm64.tar.gz` を作ります。
各アーカイブは実行可能な `bin/dx` だけを含みます。作成には tar と、cross compile 用の
Bun runtime を取得するネットワーク接続が必要です。tag と GitHub release は作りません。
version の実装上の正本は package.json で、CLI と asset 名の両方が参照します。

[mise github backend の選択規則](https://mise.jdx.dev/dev-tools/backends/github.html#how-mise-picks-an-asset)
に従い、repo 名・OS・arch を asset 名に入れています。プラットフォーム別の asset 指定は不要です。
`bin_path` はアーカイブ内の実行ファイルの場所を明示します。
[Bun の単体実行ファイル](https://bun.com/docs/bundler/executables)を使います。

`tests/release.test.ts` はビルド元を削除し、Git と jj だけを含む PATH で `-V` と `check` を実行して、
ソース版との出力・終了コード・stdout の SHA-256 の一致を検証します。

lint は dotfiles の TypeScript 標準プリセットの写しを使います。`.oxlintrc.json` と、
`.dx-preset/` の `house-plugin.js`・`lint-oxlint.ts`・`zod.ts` をこの repo で管理し、
実行時に dotfiles は参照しません。依存の固定版と compilerOptions はプリセットに合わせています。
プリセットとの差分は、補助ファイルの配置、`node/no-sync` の有効化（試験も対象）、
型検査に `bun check` を使うことです。プリセットの tsgo は導入しません。
`mise run lint`・`lint:ts`・`lint:ts:all` はいずれも全 TypeScript ファイルを型情報付きで検査します。
プリセットの変更候補だけを検査する外部コマンドは使わず、保存前の編集も検査します。
lint runner の件数は診断数ではなく検査したファイル数で、0 ファイルや壊れた応答は失敗です。

すべての読み取りで `--ignore-working-copy --at-operation=@` を使います。`@` は jj が保存済みの
スナップショットを指します。未保存の編集を検査したいときは、書き手が先に `jj status` または
`jj commit <paths>` でスナップショットを作ってください。読み取りコマンドはスナップショット、fetch、cache、
一時 checkout を作りません。読み始めに REV を commit ID に固定します。

記録の読み込みには Git をバックエンドとする jj repo が必要です。
通常は `jj git init --colocate` で同じ作業ディレクトリに Git を置きます。
Git の保存先は `jj git root` で取得するため、jj が内部に Git を持つ non-colocated repo も読めます。
jj から指定 REV のパス・種別・blob ID を取得し、Git の object を
`git cat-file --batch` でまとめて直接読みます。ファイルごとの `jj file show` は行いません
（起動時の `dx.toml` 取得を除く）。Git の置換 object と不足 object の自動 fetch は使いません。
symlink、未解決の conflict、欠落した object、読み込み失敗は exit 4 にします。

blob の内容は1コマンド内のメモリで共有します。base と head でパス・形式・blob ID が
同じ記録は1回だけ parse します。パスを使う独自アダプタのため、異なるパスの parse 結果は共有しません。
repo に永続 cache は書きません。

## repo と type

対象 repo に `dx.toml` と `.dx/<type>.ts` を置きます。`dx.toml` は `[repo].name` が必須で、
それ以外の既定値は spec §6 と同じです。未知の設定、型の不一致、負の上限は exit 4 になります。

```toml
[repo]
name = "example"
```

```ts
// .dx/note.ts
import { defineType } from "dx";
import { z } from "zod";

export default defineType({
  name: "note",
  match: "records/*.md",
  format: "markdown-frontmatter",
  id: file => file.name,
  schema: z.looseObject({ title: z.string(), by: z.string() }),
  links: { superseded_by: { to: "note" } },
  immutable: false,
  checks: [record => record.fields.title === "" ? [{
    check: "title.empty", id: record.id, path: record.path,
    field: "title", message: "title is empty",
  }] : []],
  views: {
    index: tree => tree.records.map(record => ({ id: record.id, path: record.path })),
  },
});
```

`match` は glob 文字列またはその配列です。1 ファイルが複数 type に当たると exit 4 です。
`filename` は任意の RegExp で、ファイルの basename に適用します。
`id(file)` が受け取る値は `path`、`name`、`text`、`body`、`fields`、`index` です。
`fields` は形式アダプタが読んだメタデータで、schema による変換や unknown key の除去は行いません。

Markdown は YAML frontmatter を 1 記録として読みます。BOM、LF/CRLF、終端の改行なしに対応します。
TOML はトップレベルの table を 1 記録として読み、`[[records]]` があれば各 table を別の記録にします。
`index` は 0 から始まる位置です。複数記録の id の付け替えは、同じ type・path・index の間で検査するため、
既存の配列の順序は保存してください。

`checks` は `(record, tree) => FindingInput[]`、`views` は `(tree) => object[]` で、どちらも
Promise を返せます。`tree` は `records`、`base`、`files`、`read(path)` を持ちます。
`check` の base 側評価では `records` と `base` の両方が base の記録です。head 側では
`records` が head、`base` が base です。view では両方とも指定 REV です。
`files` と `read` は ignore 対象以外の木の内容を返します。`.dx/`、`dx.toml`、宣言された verdict ファイルは配線のため常に読みます。
独自 finding の `check` 名は repo が安定させてください。

型定義・checks・views は信頼する純粋な repo policy です。外部 I/O、時刻、乱数、global state を使わず、
入力を書き換えないでください。revision の `.dx/` はメモリ内で bundle して動的 import します。
import は `.dx/` 内の相対パス、`dx`、同じ固定版の `zod`・`neverthrow` を許可します。
`.dx/` 直下の TS は type 定義として扱うため、helper は `.dx/helpers/` などに置いてください。
実行時間は別プロセスで制限しますが、これは不正な policy に対する OS sandbox ではありません。

## 検査と verdict

`check` は head の設定・型定義で base と head を評価します。schema・filename・独自 checks と、
id・links の指摘を安定した key で比較します。既存 finding は `new:false`、新規 finding は
`new:true` です。新規があれば exit 1、なければ exit 0 です。
新しい記録と sha256 が変わった記録は、同じ id の既存 finding も `new:true` として拒否します。変わっていない記録の既存 finding は残せます。

key は JSON 配列 `[check, id または null, field または空文字]` の文字列です。
記録を特定できない format/strict finding と、重複 id の個別発生には `field` に path/位置を含めます。
同じ key の指摘は 1 件にまとめます。既存の重複にもう 1 件足す場合も、新しい発生を拒否します。

immutable の Markdown はファイルの全内容と path を比較します。TOML の複数記録では、各 table の
メタデータと path を比較し、別の記録の追記を許可します。id の付け替えは immutable と別々に指摘します。
links は宣言したフィールドの id 文字列またはその配列から読みます。宣言先 type、実在、一意性、
循環を検査します。`dx:<repo>/<id>` は spec §10 R-5 に従い、repo 外の参照先を検証しません。

I-09 は比較範囲内の change ごとに確かめます。規則だけの change の後に記録だけの change が来る
範囲は許可します。1 つの change が `.dx/` と記録の両方を変える場合は拒否します。
規則の match の変更や type の削除で記録の変更を隠せないよう、この検査だけは各 change の前後の
type の match を参照します。構造検査には head の規則だけを使います。非祖先の REV 同士は比較差分を
1 change として扱います。

`review: { rubric: "rubrics/r.toml", place: "frontmatter" }` を宣言すると、新しい・変更した記録に
spec C3 の verdict が必要です。rubric のパスは `.dx/` 相対（または `.dx/` 始まり）です。
`place: "file:verdicts/*.jsonl"` では、JSON 1 値・JSON 配列・JSONL・TOML の verdict を読みます。
immutable な type では `file:<glob>` が必須です。verdict には次の全条件を求めます。

- `v:1`、id・記録 sha256・rubric パス・現在の rubric の全バイトの sha256 が一致する。
- `pass:true` で、すべての `p` が `[review].pass` 以上。
- 記録に `by` があるときは verdict の `by` と異なる。記録に `by` が無いときは、verdict の `by` が `process:` で始まる機械の判定者だけを認める。
- C3 の `at`・`bits`・`p` などのフィールドが正しい型である。

記録の sha256 は `review` を除くメタデータを key 順に正規化した値と本文から計算します。
verdict 自身を含めたハッシュの自己参照を避け、本文は空白を含めて保存します。
`recordSha256` と `sha256` を package から公開しているため、review と check が同じ関数を使います。
既存記録の verdict は、rubric だけの変更では無効にしません。

## review の実行

`dx review [REV]` は `<branch>@<remote>` を base とし、新しい記録と本文ハッシュが変わった
記録だけを対象にします。frontmatter の verdict だけを変えた場合も I-06 と同じ対象に含めます。I-06 の未取得 verdict を除いて check の finding がある記録には要求を出さず、
finding を stdout に出して exit 1 にします。現在のハッシュ・rubric に結びつく合格 verdict は再利用します。
指定 REV と作業コピーの内容が異なると exit 4 で拒否します。

`[review].command`（既定 `["agx", "jev"]`）に stdin JSON を渡します。
要求には `model: "jev-latest"` を必ず含めます。現在の Jev endpoint は model を省略すると HTTP 422 を返すためです。
model のフィールドも要求全体の30,000バイトに含めます。
rubric は次の TOML 形式です。criteria の順番が `p` と `bits` の順番になります。
任意の `bit` を書く場合は、順番どおり 0 から連続させます（最大53問）。

```toml
rubric = "example/v1"
[[criteria]]
id = "clear"
bit = 0
question = "Does the record explain the conditions and outcome clearly?"
```

要求全体を UTF-8 の 30,000 バイト以内に収めます。記録・問いは切らず、証拠だけを
UTF-8 の文字境界で切り詰め、省略を明記します。最小要求が上限を超えると、問い合わせ前に exit 4 です。
各 `answers[id].noul` と `[review].pass`（既定0.5）を比較して bits と pass を作ります。
verdict の `by` は `process:jev/<応答の model>` です。記録に `by` が無くても Jev を呼び、機械の判定者として verdict を保存します。記録に著者を補ったり、本文を変更したりはしません。

`format` は組込み形式名のほか、`FormatAdapter` を受け取ります。
`markdownFrontmatter` と `tomlFormat` を dx から import して拡張できます。
アダプタは `parse(path,text)`、`hash(file)`、`reviewText(file)` を持ち、
任意で `writeReview(file,verdict)` と `evidence(file,tree)` を持ちます。
`parse`・`reviewText`・`writeReview` は通常の成功値に加えて neverthrow の `Result<成功値, string>`
を返せます。組込みの Markdown アダプタは失敗を Result で返し、CLI の境界で終了コードに変換します。
`evidence` は `{locator,status,content?}` の配列を返し、リンクの解釈・解決・除外は
repo の type が決めます。組込み形式は証拠を自動収集しません。たとえば以下のように、
type が宣言する資料だけを指定 REV の木から渡せます。

```ts
format: {
  ...markdownFrontmatter,
  evidence: (file, tree) => [{
    locator: "definitions.md",
    status: "repository definition",
    content: tree.read("definitions.md"),
  }],
},
```

frontmatter の書き戻しではハッシュ不変と verdict の round trip を再検証します。
`file:<glob>` の `*` / `**` は URL エンコードした id に展開し、glob と一致するパスに書きます。
ワイルドカードなしの共有ファイルも使えます。JSON/JSONL の出力は verdict の JSON 配列、
TOML の出力は `[[verdicts]]` です。既存のほかの id の verdict は保存します。
既存の壊れた sidecar、repo 外へのパス、symlink を経由する出力は拒否します。

途中の不達でも処理済みの verdict は残ります。再実行すると合格済みを飛ばします。
2秒を超える問い合わせでは stderr に待ち表示を出します。実在の Jev は自動試験で呼びません。

## 出力と試験

`ls`・`check`・`review`・`view` は `v:1` 付き JSONL を返します。view 名は全 type 間で一意にします。
stdout は結果全体を計算してから書きます。判定不能時は空 stdout と
`UNDETERMINED:<理由>`、exit 4 を返します。使い方の誤りは exit 2 です。

`land [REV]`（既定 `@`）は `[repo].remote` を fetch し、remote の branch を base に固定します。
base の子孫だけを、`check` と同じ判定関数に通します。新しい finding は全件を出して exit 1、
非 fast-forward は `NOT_FAST_FORWARD` / exit 1 です。通れば Git の
[`--force-with-lease=<ref>:<base>`](https://git-scm.com/docs/git-push) で検査した base を期待値として
1 ref を push します。fetch 先を正本とするため、pushurl は使いません。hosting API は不要です。
成功後に手元の bookmark を合わせ、`{"v":1,"commit","base","branch","remote"}` の受領を返します。
push 後の bookmark 更新失敗は警告と exit 0 です。lease 競合は `RACE`、接続不能・60 秒の打ち切りは
`REMOTE_UNAVAILABLE`、push の成否不明は `RESULT_UNKNOWN` で、いずれも exit 3 です。
fetch / push は個別に 60 秒まで待ち、2 秒を超えると stderr に待機を 1 行表示します。
`--force` はありません。
Jev の不達・非0終了・120秒の時間切れ・応答不正も exit 3 です。

上限は base/head それぞれに適用します。`records` は展開した記録数、`links_per_record` は展開後の
link 数です。`record_bytes` はアダプタが読む 1 ファイルの UTF-8 バイト数で、複数記録を含む場合も
分割前に確かめます。判定全体の時間の上限は、呼び出し側の `timeout 120 dx check`、agx の
`timeout_s`、CI などで設けます。判定不能なら stdout は空で、終了コード 4 です。

review の合格条件は、すべての問いで確率が 0.5 以上であることです。
`limits.check_seconds` と `review.pass` は 0.1.x の間だけ受け付けて無視し、
stderr に `dx: warning: <key> is deprecated and ignored` を出します。0.2.0 からは未知の項目として拒否します。

`tests/acceptance.test.ts` に正・負の受領試験、`tests/review.test.ts` に偽コマンドによる I-06/I-10 と review の試験、
`tests/contracts.test.ts` に出力・引数・上限・
副作用の試験があります。すべての試験は `/tmp` の `jj git init --colocate` で作った repo 内で行い、
終了時に消します。実在の記録 repo には書き込みません。
`tests/land/land.test.ts` は一時 bare remote を使い、正常系・拒否・別 clone との競合・受領・待機と
タイムアウト・push 後の bookmark 失敗を検証します。colocated / non-colocated の両方を対象にします。
