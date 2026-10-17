+++
schema = 2
name = "dx-version"
outcome = "`dx --version` と `dx -V` が、stdout に `dx 0.1.0`（package.json の version）を出して exit 0 を返し、help にもこのフラグが出る。試験があり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check", "bun src/main.ts --version", "bun src/main.ts -V"]
timeout_s = 900
premises = ["file:src/cli.ts", "file:package.json"]

[proposition]
id = "DX-VERSION"
claim = "dx の CLI に --version と -V を足しても、ほかの引数の扱い（重複、未知のオプションは exit 2）は変わらない"
refuted_by = "cleye の仕組み上、-V を足すと、ほかの短いオプションの扱いが変わる（理由を返す）"
+++

**owner が見つけた欠陥の修理です。**

```
$ dx -V
USAGE: unknown command: -V
$ dx --version
USAGE: unknown command: --version
```

## やること

- `dx --version` と `dx -V` で、stdout に `dx <version>` を 1 行出して exit 0 を返す。version は package.json から取り、2 か所に書かない。
- help の FLAGS に `--version` を出す。help は平文のまま（C3）。
- 試験: `--version`、`-V`、`--version --version`（重複は exit 2）。
- spec §5 C1 の「短いオプションは `-h` だけ」と食い違うので、その点は返却の `for_coordinator` に書く。coordinator が spec を直す。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 変えたファイル
- `bun src/main.ts --version` の出力
- `mise run check` の結果
