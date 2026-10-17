+++
schema = 2
name = "dx-release"
outcome = "`mise run release:build` が、bun build --compile で linux-x64 と darwin-arm64 の単体バイナリ dx を dist/ に作る。linux-x64 のバイナリが、bun の無い PATH でも `dx -V` と、retrospectives の写しに対する `dx check` を今と同じ結果で返す（.dx/ の動的な読み込みが、compile したバイナリの中で動く）。asset の名前は、mise の github backend が自動で選べる形になっている。mise run check が通って返る"
writes = ["mise.toml", "package.json", "scripts/**", "src/**", "tests/**", "README.md", ".gitignore"]
verify = ["mise run check", "mise run release:build"]
timeout_s = 2400
premises = ["file:package.json", "file:src/policy.ts"]

[proposition]
id = "DX-RELEASE"
claim = "dx は bun build --compile で単体バイナリにでき、そのバイナリの中で repo の .dx/*.ts を読み込んで判定できる"
refuted_by = "compile したバイナリでは、.dx/*.ts の bundle か動的な import ができない（そのエラーを返す）"
+++

**owner の要望（retrospectives 経由）: dx を mise の [tools] で版を固定して入れられるようにする。**

## やること

1. `mise run release:build`（タスクの名前は house の契約に合わせる）で、`bun build --compile` を使い、`dist/dx-<version>-linux-x64.tar.gz` と `dist/dx-<version>-darwin-arm64.tar.gz` を作る（中身は `bin/dx`）。asset の名前は、mise の github backend（ubi 互換）が OS と arch から自動で選べる形にする。mise の文書を確かめて決める。
2. compile したバイナリの中で、`.dx/*.ts` の bundle と動的な import（src/policy.ts）が動くことを確かめる。動かなければ、動く形に直す（振る舞いは変えない）。
3. 確かめ: PATH から bun を外した環境で、linux-x64 のバイナリを使い、`dx -V` と、retrospectives の写し（`git clone` した一時の場所）に対する `dx check --base <rev> <rev>` を流す。今の `bun src/main.ts` の出力と SHA-256 が一致することを確かめる。
4. version は package.json の 1 か所から取る（`dx -V` と asset の名前の両方）。
5. **release の公開（tag と GitHub の release の作成）はしない。** それは coordinator が行う。dist/ は .gitignore に入れる。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- asset の名前と大きさ
- bun の無い環境での受領
- `mise run check` の結果
- mise で入れるときの `[tools]` の書き方（例）
