+++
schema = 2
name = "dx-bun-check"
outcome = "dx の型検査が `bun check` で行われ（tsgo を使わない）、bun の最低版が 1.4.3 になり（mise.toml の [tools] と package.json の engines）、要らなくなった依存が外れ、mise run check が bun 1.4.3 の上で通って返る"
writes = ["mise.toml", "package.json", "bun.lock", "tsconfig.json", "README.md", "src/**", "tests/**"]
verify = ["mise run check", "mise exec -- bun --version"]
timeout_s = 1200
premises = ["file:mise.toml", "file:package.json"]

[proposition]
id = "DX-BUN-CHECK"
claim = "dx の型検査は、tsgo の代わりに bun 1.4.3 の `bun check` で、同じ tsconfig のまま行える"
refuted_by = "`bun check` が、tsgo では通る dx の型を誤って拒否する、または型の誤りを見逃す（その例を返す）"
+++

**owner の指示: 「typecheck については bun check を利用するようにして。tsgo ではなく。bun >= 1.4.3 にすることで」**

## 事実（coordinator が確かめた）

- 今の `mise.toml`: `[tools] bun = "1.4"`、`[tasks.typecheck] run = "bun run node_modules/@typescript/native-preview/bin/tsgo --noEmit"`。
- `package.json` の devDependencies に `@typescript/native-preview`（7.0.0-dev.20260707.2）がある。
- PATH の bun は 1.4.2 で、`bun check` が無い（`error: Script not found "check"`）。
- `mise exec bun@1.4.3 -- bun check --help` は動く。近くの tsconfig.json を使い、tsc と同じ誤りを出す。

## やること

1. `mise.toml` の `[tools] bun` を 1.4.3 にする（1.4.3 以上を保証する書き方。mise が範囲指定を受け付けなければ、`1.4.3` に固定する）。`package.json` に `"engines": { "bun": ">=1.4.3" }` を足す。
2. `[tasks.typecheck]` を `bun check` にする（tsconfig はそのまま）。
3. `@typescript/native-preview` を外せるなら外す。oxlint の型を使う lint（oxlint-tsgolint）がそれを要るなら残し、理由を返却に書く。
4. 正しさを確かめる。
   - 型の誤りを 1 つわざと入れた一時のファイルで、`bun check` が失敗することを確かめる（確かめた後に消す）。
   - 今のコードで、`bun check` と tsgo の結果が同じであることも確かめる。
5. README の、依存と版の記述を直す。

## jj について

- この workspace の作業コピーの上に commit する。jj のロックが取れなければ、commit しないまま返す。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- `bun check` の結果（今のコードでの結果と、誤りを入れたときの結果）
- `mise run check` の結果
- 外した依存と残した依存、その理由
