+++
schema = 2
name = "dx-core"
outcome = "/home/fuyu/Workspace/dx に、docs/spec.md 版 1 に従う bun ts の CLI『dx』の本体があり、dx ls・dx check・dx view・dx schema が動き（review と land は別 issue）、spec §3 の I-02〜I-07 と I-09 を、一時の jj repo を使った試験で確かめ、mise run check が通って返る"
writes = ["src/**", "tests/**", "package.json", "bun.lock", "tsconfig.json", "mise.toml", ".oxlintrc.json", ".oxfmtrc.json", ".gitignore", "README.md", "node_modules/**"]
verify = ["mise run check", "bun src/main.ts --help"]
timeout_s = 3600
premises = ["file:docs/spec.md", "file:/home/fuyu/Workspace/retrospectives/mise.toml", "file:/home/fuyu/Workspace/retrospectives/tools/package.json", "file:/home/fuyu/Workspace/retrospectives/tools/tsconfig.json"]

[proposition]
id = "DX-CORE"
claim = "spec.md 版 1 の dx ls・check・view・schema と、型定義の API（defineType）と dx.toml の読み込みは、bun ts で、spec の invariant を試験で確かめられる形に実装できる"
refuted_by = "spec.md が自己矛盾していて、同時に満たせない条件がある（その箇所と理由を返す）"
+++

**仕様は `docs/spec.md`（版 1）が唯一の正本です。** 最初に全文を読んでください。spec.md は書き換えないでください。食い違いや抜けを見つけたら、自分の判断で目的に沿って解き、返却の `for_coordinator` に「spec の §・どう解いたか」を書いてください。

## この issue の範囲

作るもの（spec §5、§6、§7）:

- `dx ls [REV]`
- `dx check [--base REV] [REV]`
- `dx view <name> [REV]`、`dx view --list`
- `dx schema [<type>]`

ほかに、次のものも作ります。

- 記録のモデル（`{"v":1,"id","type","path","sha256","by"?,"links","fields"}`）
- 形式のアダプタ: `markdown-frontmatter` と `toml`
- `dx.toml` の読み込み（`[repo]`、`[review]`、`[limits]`、`[files]`。既定値は spec §6 のとおり）
- `.dx/<type>.ts` を読み込む `defineType` の API

check がすべての type に必ずかける検査は、次のとおりです。

- I-02: head の規則で base と head の両方を数え、新しい finding が無い
- I-03: immutable
- I-04: links の型、参照先、循環
- I-05: id の重複と付け替え
- I-06: verdict の結びつき。verdict を**読んで確かめる**ところまで。`review.place` が `"frontmatter"` のときと `"file:<glob>"` のときの両方を扱う
- I-09: `.dx/` を変える change は、ほかの記録を一緒に変えない

出力と終了コードは、spec §5 の C1〜C4 のとおりにします（JSONL、`"v":1`、finding の安定した `key`、終了コード 0〜4。判定できないときは 4 で返し、空の成功にしない。指摘は 1 回で全件出す）。

**作らないもの:**

- `dx review` と `dx land`（別の issue で作る）。ただし、`src/commands/<name>.ts` のように、後からコマンドを足せる構成にしておく。
- retrospectives・soks・research_record の `.dx/` の中身（別の issue）。

## 作り方の決まり

- 言語は bun ts。依存は、retrospectives と同じ版の `cleye`、`zod`、`neverthrow` を使う（`/home/fuyu/Workspace/retrospectives/tools/package.json`）。
- lint と型検査の道具（oxlint、oxfmt、tsgo）と、その版も、そのファイルにそろえる。
- mise のタスクは、house の契約に従う（skill `wiring-mise-tasks` を読む）。`setup`、`fmt`、`fmt:check`、`lint`、`test`、`typecheck`、`check`（すべての関門をまとめたもの）を置く。retrospectives の `mise.toml` が雛形になる。
- REV の木は jj から読む（`jj file show -r REV`、`jj file list -r REV` など）。作業コピーや外部の状態に書かない（I-07）。
- `.dx/<type>.ts` は bun で動的に import する。型定義の API は、dx の package から export する（`import { defineType } from "dx"` で使える形）。
- 規則の実例として、`/home/fuyu/Workspace/retrospectives/tools/scripts/schema.ts` と `check.ts` を読んでよい（コピーはしない。それは別の issue）。

## 試験

- 試験は、一時ディレクトリに `jj git init` で作った repo の中だけで行う。**実在の repo（retrospectives、soks、research_record）には書かない。**
- 次の 2 つを、それぞれ受領の試験として残す。
  - 正の例: 通る差分で exit 0
  - 負の例: immutable な記録を変えた差分で exit 1。finding の `new:true` が出る
- I-02〜I-07、I-09 のそれぞれに、通る例と拒否される例を 1 つ以上置く。
- 既存の finding がある base に、別の新しい finding を足した head では、新しいものだけが `new:true` になること。
- 上限（`[limits]`）を超えたら exit 4 になること。

## 作業場所の事実（coordinator が確かめたもの）

- この repo は jj（git と colocated）。正規の bookmark は `alpha`（`9f7c9ef1`）。
- 今あるのは、`docs/`（spec.md、design.md）、`notes/genealogy/`、`.agents/tickets/` だけ。コードはまだ無い。
- `jj-commit`、`lint-ts-candidate`、`mise-contract`、`fmt-staged` は PATH にある（`~/.bun/bin`）。

## jj について

- commit は 1 つにまとめてよい。bookmark `alpha` は動かさない（統合は coordinator が行う）。push しない。

## 止まる方針

小さな食い違いは目的に沿って解き、返却に書いてください。止まるのは、spec が同時に満たせない条件を課しているときだけです。

## 返却

- 作ったファイルの一覧
- コマンドごとの受領の試験（コマンド、出力、終了コード）
- `mise run check` の結果
- spec との食い違いと、どう解いたか
- 未検証のこと
