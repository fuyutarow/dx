+++
schema = 2
name = "dx-preset"
outcome = "dx の lint・型検査・mise のタスクが、dotfiles の TypeScript の標準プリセット（~/dotfiles/presets/typescript）と同じ水準になる。no-sync（同期の fs と child_process の呼び出しの禁止）が、規則として dx に効いている。プリセットが consumer に渡すファイルは、dx の中に commit した写しだけを使い、symlink や dotfiles を指す参照は置かない。mise run check が通って返る"
writes = [".oxlintrc.json", ".oxfmtrc.json", "tsconfig.json", "package.json", "bun.lock", "mise.toml", "src/**", "tests/**", "README.md", ".dx-preset/**"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:/home/fuyu/dotfiles/presets/README.md", "file:/home/fuyu/dotfiles/presets/typescript/preset.toml"]

[proposition]
id = "DX-PRESET"
claim = "dx は、dotfiles の TypeScript の標準プリセットを当てても、今の振る舞いと試験を保ったまま、その lint と no-sync の規則を満たせる"
refuted_by = "プリセットの規則が、spec.md の振る舞い（たとえば jj や git の子プロセスを待つこと）と両立しない（その規則と箇所を返す）"
+++

**owner の指示:「dotfiles の standard presets 水準で」**

## 事実（coordinator が確かめた）

- dx の `.oxlintrc.json` は最小のもので、`correctness` と `no-debugger`、`no-unused-vars` だけ。プリセットは当てていない。
- dx の `src` には、同期の呼び出し（`*Sync(`、`spawnSync`、`execSync`）が 0 件。ただし、それを守る規則は無い。
- dotfiles の no-sync は、oxlint の `node/no-sync` と、`mise run lint:no-sync`（`scripts/lint-no-sync.ts`。baseline があり、`// sync-ok: <理由>` で例外にできる）で強制している。`tools/spec/architecture.md:269` には「この版では node/no-sync は .oxlintrc.json に無い」とある。
- dotfiles では、プリセットを `policy.toml` から、標準の `.oxlintrc.json` に移す作業（tkt_oxlint-standard）が進んでいる。owner の決定: consumer には symlink も dotfiles を指す参照も渡さない。プリセットは consumer が持って commit する写しとして配る。

## やること

1. `~/dotfiles/presets/README.md` と `presets/typescript/` を読み、consumer への当て方（プリセットの CLI、または写しの手順）に従って、dx に当てる。プリセットが移行の途中なら、今の alpha の時点で consumer に渡される形に合わせる。どちらか分からなければ、写しの形にし、その旨を返却に書く。
2. no-sync を dx に効かせる。oxlint の規則か、それに当たる検査を `mise run lint` に入れる。わざと同期の呼び出しを入れた一時のファイルで、lint が落ちることを確かめる（確かめたら消す）。
3. プリセットの規則で、今のコードが落ちる箇所を直す。振る舞いは変えない。試験はすべて通ったままにする。
4. 型検査は `bun check` のまま（D-bun-check）。bun は 1.4.3。プリセットが別の型検査の道具を求める場合は、`bun check` を優先し、食い違いを返却に書く。

## jj について

- この workspace の作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 当て方（プリセットのどのファイルを、どう写したか）
- no-sync の確かめ（落ちる例と通る例）
- 直した箇所
- `mise run check` の結果
- プリセットと dx の食い違い
