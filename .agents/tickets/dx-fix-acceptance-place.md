+++
schema = 2
name = "dx-fix-acceptance-place"
outcome = "tests/acceptance.test.ts の、消えた review.place = \"frontmatter\" を使う 2 つの試験を file:<glob> に移す"
writes = ["tests/acceptance.test.ts"]
verify = ["bun test tests/acceptance.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/acceptance.test.ts"]
timeout_s = 600
premises = ["file:tests/acceptance.test.ts"]

[proposition]
id = "DX-FIX-ACCEPTANCE-PLACE"
claim = "tests/acceptance.test.ts の、消えた review.place = \"frontmatter\" を使う 2 つの試験を file:<glob> に移す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）で、次の 2 つの試験が `UNDETERMINED:policy: note: review.place = "frontmatter" は消えた` で落ちる。issue dx-purge-frontmatter が place = "frontmatter" を消したが、この 2 つの試験を移していなかった。

- 237 行: "I-06 frontmatter: matching verdict passes; stale hashes, self-review, low p and fail reject"
- 279 行: "I-06: rubric-only change does not invalidate an unchanged accepted record"

## やること

1. 2 つの試験を `place = "file:<glob>"` に移す。verdict は規則のファイル（dx.toml、.dx/、inputs）の外に置く（例: `verdicts/*.jsonl`）。試験が確かめていた性質（I-06 の結びつき、古い hash・自分の review・低い p・fail の拒否、rubric だけの変更で既存の verdict が無効にならないこと）は、そのまま確かめる。
2. 試験の名前から "frontmatter" を外す。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
