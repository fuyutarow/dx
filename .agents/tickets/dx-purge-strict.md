+++
schema = 2
name = "dx-purge-strict"
outcome = "3 つの repo のどれも使わない links の match と review の place = \"frontmatter\" を消す。不正な UTF-8 と、frontmatter の区切りや本文に入った CR を、黙って読み替えずに format の finding にする。retrospectives、soks、research-record-v2 の歴史で判定が変わる commit を一覧にし、spec と README を直して、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/model.ts", "file:src/formats.ts", "file:src/repository.ts", "file:src/checks.ts"]

[proposition]
id = "DX-PURGE-STRICT"
claim = "使われていない 2 つの機能を消し、読み込みを厳しくしても、3 つの repo の正しい commit は 1 つも新たに拒まれない"
refuted_by = "3 つの repo の歴史で、正しい commit が新たに拒まれる（その commit と finding を返す）"
+++

**DevX ヒアリング（2026-10-19、dx 0.1.3 時点。retrospectives、soks、research-record-v2 の 3 つ）の結論です。**

## 事実

- links の `match` は、3 つの repo のどれも使っていない。`values` で同じことができる（soks は `values` を使っている）。
- review の `place = "frontmatter"` は、3 つの repo のどれも使っていない。immutable と両立しない（spec §3 の反例）。retrospectives と research-record-v2 は `place = "file:<glob>"` を使う。
- 木から読んだ blob を `toString("utf8")` で読み替えている（src/repository.ts:212）。不正な UTF-8 は、黙って U+FFFD になる。soks はこれを補うために、自前の document-text.ts で U+FFFD を拒んでいる。I-07（判定できないものを空の成功にしない）に反する。
- frontmatter の区切りを LF だけに限る検査を、retrospectives（retro.ts:38-41）と soks（format.ts）が、それぞれ自前で書いている。

## 決定（coordinator）

1. links の `match` を消す。宣言に `match` があれば、規則の読み込みで exit 4（`UNDETERMINED:policy: <type>.links.<rel>: match は消えた。values を使う`）。
2. review の `place = "frontmatter"` を消す。place は `"file:<glob>"` だけにする（鍵の形は変えない。public の約束を保つ）。`"frontmatter"` は規則の読み込みで exit 4。frontmatter に verdict を書き戻す処理、それを読む処理、関係する試験を消す。
3. blob を読むときは、不正な UTF-8 で失敗する decoder（`TextDecoder("utf-8", { fatal: true })` など）を使う。不正なら、そのファイルについて `format` の finding（`invalid UTF-8 at byte <n>`）を出し、記録としては読まない。inputs が不正な UTF-8 なら、同じく format の finding にする（変わった inputs なら、0.1.3 の規則で new になる）。BOM の扱いは今と同じにする（変えるなら返却に書く）。
4. markdown-frontmatter の adapter は、区切りを `---\n` に限る。frontmatter の中に CR があれば `format` の finding（`CR in frontmatter`）を出す。本文の CR は扱わない（今と同じ）。
5. 判定（終了コードと new の組）が変わるのは、3 と 4 に当たるファイルを持つ commit だけであるはずである。照合で確かめる。

## やること

1. 上の 1〜4 を実装する。
2. 試験: 1 と 2 の exit 4、3 の format の finding（記録と inputs の両方）、4 の format の finding。消した機能の試験を消す。
3. 照合（止まらない。一覧を返す）: retrospectives と soks（これまでの shadow と同じ組）と、research-record-v2 の alpha（`dx check --all --base 'root()' alpha` の、変える前と後）で判定を比べる。判定が変わった commit について、commit、finding、そのファイルを一覧にする。
4. spec（§3 の反例、§7 の links と review、I-07 の注記）と README を直す。

この issue は、dx-verdict-data を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 消したものと、規則の変更、試験
- 照合の一覧
- `mise run check` の結果
