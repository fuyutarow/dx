+++
schema = 2
name = "dx-fix-cr-semantics"
outcome = "frontmatter の中の CR と本文の CR の扱いを、決めた意味に合わせ、document-text の試験を直す"
writes = ["src/formats.ts","tests/document-text.test.ts","tests/dx-lf.test.ts"]
verify = ["bun test tests/document-text.test.ts tests/dx-lf.test.ts tests/strict-yaml.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/formats.ts tests/document-text.test.ts"]
timeout_s = 600
premises = ["file:src/formats.ts","file:tests/document-text.test.ts","file:tests/dx-lf.test.ts"]

[proposition]
id = "DX-FIX-CR-SEMANTICS"
claim = "frontmatter の中の CR と本文の CR の扱いを、決めた意味に合わせ、document-text の試験を直す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）で、tests/document-text.test.ts の 3 つの試験が落ちる。issue dx-lf（frontmatter の区切りを LF だけにし、frontmatter の中の CR を format の finding にする）と、0.1.1 の文書全体の禁止文字（単独の U+000D）が食い違っている。

- "markdown-frontmatter rejects document character U+000D"（frontmatter の中の `a\rb`）: message が変わった。
- "markdown-frontmatter rejects document character U+000D"（本文の `a\rb`）: 拒否されなくなった。
- 44 行の "tabs, LF, CRLF, Unicode and literal U+FFFD remain accepted": CRLF の区切りが拒否されるようになった。

## 決定（coordinator）

- frontmatter の中（区切りを含む）の CR は、どれも `CR in frontmatter` の format の finding にする（dx-lf の決定）。
- 本文の扱いは変えない。単独の CR（LF が続かない U+000D）は、0.1.1 のとおり文書全体の禁止文字として拒否する。本文の CRLF の改行は受け付ける。

## やること

1. src/formats.ts を、上の意味に合わせる（本文の単独の CR の拒否が外れていれば戻す）。
2. 試験を直す: frontmatter の中の CR は `CR in frontmatter` を期待する。本文の単独の CR は禁止文字の finding を期待する。"remain accepted" の試験は、CRLF を本文だけに使う入力に直し、frontmatter の CRLF は拒否されることを別の試験で確かめる（dx-lf.test.ts にあれば重ねない）。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
