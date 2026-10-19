+++
schema = 2
name = "dx-review-command"
outcome = "[review] command の既定（[\"agx\", \"jev\"]）をなくす。rubric を持つ type がある repo で command が書かれていなければ、規則の読み込みで exit 4 にし、書くように言う"
writes = ["src/config.ts", "src/commands/review.ts", "src/policy.ts", "src/checks.ts", "tests/dx-review-command.test.ts", "tests/helpers.ts", "docs/spec.md", "README.md"]
verify = ["bun test tests/dx-review-command.test.ts tests/review.test.ts"]
timeout_s = 600
premises = ["file:src/config.ts"]

[proposition]
id = "DX-REVIEW-COMMAND"
claim = "外の道具の名前を dx の暗黙の既定に持たなければ、その道具が名前を変えても dx は黙って壊れない"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19）。alpha（ade94424）の上で行う。**

## 事実

- src/config.ts:16 は、`[review] command` の既定を `["agx", "jev"]` にしている。
- dotfiles の次の版は、`agx jev` を消す（dotfiles 96421c62。`agx worker jev` は残るが、jex に置き換える予定の非推奨）。jex は、問いとファイルを引数で受ける形で、stdin の JSON を受ける形ではない。
- dx.toml に command を書いていない repo は、その版から dx review が動かなくなる。

## 決定（coordinator）

- 外の道具への依存は、各 repo の dx.toml に、見える形で 1 か所に置く。dx は既定を持たない（dx.toml は配線の値を持つ場所である）。
- rubric（review）を持つ type が 1 つでもあり、`[review] command` が無ければ、`UNDETERMINED:policy: dx.toml: [review] command を書く（例: ["agx", "worker", "jev"]）` で exit 4。check でも review でも同じ。rubric を持つ type が無い repo（soks）では、command が無くてよい。
- I-06 の判定は command を使わないので、check で exit 4 にするのは、規則が不完全なことを早く知らせるためである（I-07: 判定できない規則を空の成功にしない）。

## やること

1. config.ts の既定を消し、command を省略可能にする。上の条件で exit 4。
2. 試験: rubric を持つ type があって command が無ければ exit 4。rubric を持つ type が無ければ通る。既存の試験の fixture が command を書いていなければ、`tests/helpers.ts` で書くように直す。
3. spec §6（dx.toml）と README の `[review] command` の説明を直す（既定なし、必須の条件、例）。
## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-review-command.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えたファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
