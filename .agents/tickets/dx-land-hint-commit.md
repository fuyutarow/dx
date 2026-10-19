+++
schema = 2
name = "dx-land-hint-commit"
outcome = "I-06 の文言と spec §5 の書き手の流れを、説明を付けて verdict を commit してから land する形にする"
writes = ["src/checks.ts", "tests/dx-diag-i06.test.ts", "docs/spec.md", "README.md"]
verify = ["bun test tests/dx-diag-i06.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/checks.ts tests/dx-diag-i06.test.ts && git diff --check docs/spec.md"]
timeout_s = 600
premises = ["file:src/checks.ts", "file:docs/spec.md"]

[proposition]
id = "DX-LAND-HINT-COMMIT"
claim = "dx の文言が jj の普段の使い方（説明を付けて commit してから、その commit を land）を勧めれば、説明の無い commit は land されにくくなる"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx の DevX の直し（2026-10-19、retrospectives の報告から）。作業コピーは dx の alpha の子で、依存は入っていない（`bun install --frozen-lockfile` を流してよい）。**

## 事実

- retrospectives で、今日の land のうち 2 回（3b8c8ee4、70dadfb5）が、説明の無い commit を alpha に入れた。どちらも、verdict を含む作業コピー（@）を、I-06 の文言の例のとおり `dx land @` で入れたためである。
- src/checks.ts:233 の I-06 の文言の例は `dx land @`。spec §5（docs/spec.md:143-150）の書き手の流れも `dx land @` と「land の後は jj new」。

## 決定（coordinator）

- `dx land` で説明の無い commit を拒む案は採らない。commit の説明は repo の決まりで、持ち主は jj と harness である。land の仕事（検査を通った commit への fast-forward）を広げない。
- dx の文言が誤った手を勧めていたので、文言と流れを直す。jj の普段の使い方（説明を付けて commit してから、その commit を land）にする。

## やること

1. src/checks.ts:233 の文言の後半を、`dx review は verdict を作業コピーに書く。jj commit -m "<説明>" で verdict を確定してから、その commit を land する（例: dx land @-）` にする。前半（英語の部分）、check の名前、key、field は変えない。tests/dx-diag-i06.test.ts の期待を合わせる。
2. spec §5 の流れを、`jj commit records/... -m "..."` → `dx check @-` → `dx review @-` → `jj commit -m "dx verdict for <記録>"` → `dx land @-` にし、説明の 1 文を「`dx review` は verdict を作業コピー（`@`）に書くので、説明を付けて commit してから、その commit（`@-`）を land する」に直す。
3. README に同じ流れがあれば合わせる。`.md` には oxfmt をかけない。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。全体の検査は流さない。verify の命令だけを流す。整形は変えた `.ts` にだけ。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 変えた箇所、verify の結果。
