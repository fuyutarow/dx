+++
schema = 2
name = "dx-lint-checks-ts"
outcome = "0.1.4 の統合の merge で出た src/checks.ts の lint の指摘を、振る舞いを変えずに消す"
writes = ["src/checks.ts"]
verify = ["bun .dx-preset/lint-oxlint.ts --type-aware src/checks.ts"]
timeout_s = 600
premises = ["file:src/checks.ts"]

[proposition]
id = "DX-LINT-CHECKS-TS"
claim = "0.1.4 の統合の merge で出た src/checks.ts の lint の指摘を、振る舞いを変えずに消す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）の `mise run lint` で、src/checks.ts に次の指摘が出た。

- 22 行: try（禁止。fromThrowable などで値として返す）
- 23 行: `as` の型の決めつけ（禁止。zod で読むか satisfies）

## やること

1. 指摘を、振る舞いを変えずに消す。house の規則（throw・try・`as`・入れ子の三項演算子は禁止。neverthrow の Result、fromThrowable、早期 return、ts-pattern の match を使う）に従う。
2. lint を抑える注記（disable のコメント）で消さない。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
