+++
schema = 2
name = "dx-spec-text"
outcome = "spec の §5 の書き手の流れを直し、I-02 の行を意味を変えずに 2 文に戻す"
writes = ["docs/spec.md", "README.md"]
verify = ["git diff --check docs/spec.md README.md"]
timeout_s = 600
premises = ["file:docs/spec.md"]

[proposition]
id = "DX-SPEC-TEXT"
claim = "spec の §5 の書き手の流れを直し、I-02 の行を意味を変えずに 2 文に戻す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- spec §5「書き手の普段の流れ」（docs/spec.md:143-148）は `dx review @-` の後に `dx land @-` としている。verdict は作業コピー（@）に書かれるので、この手順は I-06 で拒まれる。
- I-02 の行（docs/spec.md:77）が、決定の経緯を含む 1 段落になっている。

## やること
1. §5 の流れを `jj commit <記録> -m ...` → `dx check @-` → `dx review @-` → `dx land @` に直し、「review は verdict を作業コピー（@）に書くので、verdict を含む @ を land する。land の後は jj new」と 1 文添える。README に同じ流れがあれば合わせる。
2. I-02 の行を次の 2 文に置き換える。意味は変えない: 「(a) 同じ規則 revision（既定は head、指定時は --policy REV）で base と head を数えて、新しい key の finding が無い。(b) 変わった単位は、既存のものも含めて finding を持たない。単位とは、記録（sha256 で判定。`id` が自分、または `ids` に自分を含む finding）か、head で記録を生まないファイル（bytes で判定。`path` がそのファイルの finding）である。」
3. 消した経緯（2026-10-17 の強化、2026-10-18 の ids と記録を生まないファイルへの拡張、その理由）は、§9 の決定の記録に 1 行ずつ移す。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-spec-text.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
