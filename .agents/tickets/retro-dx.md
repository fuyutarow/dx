+++
schema = 2
name = "retro-dx"
outcome = "retrospectives に dx.toml と .dx/retro.ts が置かれ、今の records/ の全件について、dx check の決定的な検査の判定が、今の gate（tools/scripts の check）と一致する（一致しない記録は、理由とともに一覧になる）。規則の置き場は 1 つで、tools/scripts は .dx/ の規則を使う。mise run check が通り、比べた結果が .dx/SHADOW.md に書かれて返る"
writes = ["dx.toml", ".dx/**", "tools/scripts/**", "tools/tests/**", "mise.toml"]
verify = ["mise run check", "test -s .dx/SHADOW.md"]
timeout_s = 3600
premises = ["file:/home/fuyu/Workspace/dx/docs/spec.md", "file:/home/fuyu/Workspace/dx/README.md", "file:tools/scripts/schema.ts", "file:tools/scripts/check.ts"]

[proposition]
id = "RETRO-DX"
claim = "retrospectives の今の記録の規則は、dx の type 定義（.dx/retro.ts）に移しても、全記録で同じ判定になる"
refuted_by = "dx の type 定義の制約（.dx/ の中の import だけ、純粋な関数だけ）では、今の規則のどれかを表せない（その規則と理由を返す）"
+++

**dx の試作 1 の合格判定に使う、影運用です。** dx の仕様は `/home/fuyu/Workspace/dx/docs/spec.md`（版 1）、type 定義の書き方は `/home/fuyu/Workspace/dx/README.md` の「repo と type」の節にあります。最初に読んでください。dx 本体のファイルは変えないでください。dx 側の欠陥は、返却の `for_coordinator` に書いてください。

## やること

1. `dx.toml`（`[repo] name = "retrospectives"`。ほかは既定値でよい。`[files] ignore` に、records 以外のものを入れる）を置く。
2. `.dx/retro.ts` を書く。
   - `match: "records/*.md"`、`format: "markdown-frontmatter"`。
   - id、ファイル名の規則、frontmatter の schema、`superseded_by` の link を書く。
   - `checks` には、今の `tools/scripts/check.ts` の決定的な検査を入れる（略語の定義、タイムゾーン、相対リンクの解決など）。
3. **規則の置き場を 1 つにする。**
   - dx は、`.dx/` の中の相対 import と、`dx`、`zod`、`neverthrow` しか許さない（README）。そのため、規則の関数（schema と検査）の本体を `.dx/` の中に移す。
   - `tools/scripts/schema.ts` と `check.ts` は、`.dx/` の関数を import して使う形に変える。同じ規則を 2 か所に書かない。
   - 今の gate（`mise run lint:records`、`review.ts`、`candidate.ts`）の振る舞いは変えない（spec §8 の移行の不変条件）。
4. 影運用。今の alpha の全記録について、次の 2 つの判定を記録ごとに比べる。
   - dx 側: dx の CLI（`bun /home/fuyu/Workspace/dx/src/main.ts check ...`）
   - 今の gate 側: `tools/scripts` の check
   - 比べるのは決定的な検査だけ。review の verdict の結びつき（I-06）は、この issue では比べない（`dx review` はまだ統合されていない）。
   - 結果を `.dx/SHADOW.md` に書く: 記録の数、一致の数、一致しない記録と理由、比べ方（コマンド）。
5. 一致しないものは、原因が retro の規則の移し方にあれば直す。dx 本体にあれば、直さずに `for_coordinator` に書く。

## 分かっている食い違い（必ず扱う）

- 今の retro の frontmatter の `review:` は `{rubric, by, at, sha256, bits, p}` の形（`tools/scripts/schema.ts` の `Review`）。dx の verdict は `{v, id, sha256, rubric, rubric_sha256, by, at, bits, p, pass}`（spec §5 C3）で、形が違う。
- 移行している間、2 つの gate が同じ `review:` を読む。このときに起きる問題（dx が書いた verdict を今の gate が拒否する、など）を、具体的に `for_coordinator` に書く。直し方の案があれば書く（spec は変えない）。

## 作業場所の事実

- この workspace は、retrospectives の alpha から作った jj workspace。**ほかのセッションも retrospectives に書いている。共有の作業コピー（`/home/fuyu/Workspace/retrospectives`）には触らない。**
- dx 本体は `/home/fuyu/Workspace/dx`（alpha `40f6cfa6`。`ls`、`check`、`view`、`schema`、`land` が動く）。依存は、そこで `mise run setup` 済み。

## jj について

- この workspace で commit してよい（1 つにまとめてよい）。bookmark `alpha` は動かさない。push しない。

## 返却

- 変えたファイル
- `.dx/SHADOW.md` の要約（数と、一致しないもの）
- `mise run check` の結果
- review の形の食い違いの具体例と、直し方の案
- 未検証のこと
