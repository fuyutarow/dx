+++
schema = 2
name = "dx-core-fix-help"
outcome = "dx の help の出力が、端末・環境変数（TTY、NO_COLOR、FORCE_COLOR、TERM）によらず同じ平文になり（ANSI の装飾を出さない。spec §5 C3）、tests/contracts.test.ts の C1 の試験が、coordinator の環境でも sandbox でも通り、mise run check が通って返る"
writes = ["src/**", "tests/**"]
verify = ["mise run check", "env FORCE_COLOR=1 bun src/main.ts --help"]
timeout_s = 1200
premises = ["file:docs/spec.md", "file:src/cli.ts", "file:tests/contracts.test.ts"]

[proposition]
id = "DX-CORE-FIX-HELP"
claim = "cleye の help の装飾を止めれば、help の出力は環境によらず一定になり、C1 の試験は環境に依らず通る"
refuted_by = "cleye が装飾を止める手段を持たない（その版と理由を返す）"
+++

**dx-core（run a0268fe8）の受け入れ検査で見つかった失敗の修理です。** 範囲は help の出力だけです。ほかの振る舞いは変えないでください。

## 失敗の事実（coordinator が 2026-10-17 17:5x JST に `mise run check` を流した結果）

```
(fail) C1: unknown/repeated options, extras, missing values, short options exit 2
tests/contracts.test.ts:196  expect(result.stdout).toContain("USAGE:")
Received: "dx v0.1.0\n\nRead and check records in a jj revision\n\n\u001B[1mUsage:\u001B[22m\n  dx [flags...] ..."
32 pass / 1 fail
```

worker の sandbox では `USAGE:`（装飾なし）が出ていて試験が通った。coordinator の環境では cleye が ANSI の太字と `Usage:` を出した。つまり help の出力が環境で変わっている。spec §5 C3 は「色や表は付けない」と定めている。

## やること

- help の出力から、ANSI のエスケープを、どの環境でも出さないようにする（cleye の設定か、出力の後処理で）。
- 見出しの表記を 1 つに決め、試験はその平文に合わせる。
- 試験は、`FORCE_COLOR=1` と、TTY でない状態の両方で、同じ出力になることを確かめる。

## jj について

- 今の作業コピーの上に commit する（1 つでよい）。bookmark `alpha` は動かさない。push しない。

## 返却

- 変えたファイル
- 試験の結果
- `env FORCE_COLOR=1 bun src/main.ts --help` の出力
