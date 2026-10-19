+++
schema = 2
name = "dx-lint-fake-jex"
outcome = "tests/fixtures/fake-jex.ts の lint の指摘 3 件を、偽の jex の振る舞いを変えずに消す"
writes = ["tests/fixtures/fake-jex.ts"]
verify = ["bun .dx-preset/lint-oxlint.ts --type-aware tests/fixtures/fake-jex.ts && bun test tests/review.test.ts tests/review-author.test.ts tests/dx-review-command.test.ts"]
timeout_s = 600
premises = ["file:tests/fixtures/fake-jex.ts"]

[proposition]
id = "DX-LINT-FAKE-JEX"
claim = "偽の jex の lint の指摘を、振る舞いを変えずに消せる"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.5 の統合の lane から返した issue（2026-10-19）。作業コピーは統合の merge f581168e の子で、依存は入っている。**

## 事実

統合の merge の `mise run lint` で、tests/fixtures/fake-jex.ts に次の 3 件が出た（型の検査と試験 391 件は通る）。

- 18 行: 入れ子の三項演算子（禁止。ts-pattern の match、if/else、早期 return）
- 35 行: typescript(strict-boolean-expressions)（文字列をそのまま条件に使っている）
- 37 行: `.json()` は any を返す（`.text()` で読み、`jsonOf(Schema).safeParse(text)` で zod に通す。repo の zod の module を使う）

## やること

1. 3 件を、偽の jex の振る舞い（引数、作業ディレクトリのファイルの読み方、stdout、終了コード、fail_on_call で exit 3）を変えずに消す。lint を抑える注記で消さない。

## 共通の決まり

- 上限は 10 分。tests/fixtures/fake-jex.ts だけを変える。全体の検査は流さない。verify の命令だけを流す。
- 整形は、このファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt tests/fixtures/fake-jex.ts` をかける。house の規則（throw・try・`as`・入れ子の三項演算子は禁止）に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 変えた箇所、verify の結果、未検証。
