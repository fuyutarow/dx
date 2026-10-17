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

## 前の回（run d314ed43）の返却を受けての決定（coordinator。最新版）

- 衝突していた点: プリセットの `ThrowStatement` の禁止（`presets/typescript/.oxlintrc.json:101`）と、dx の `throw`（`src/errors.ts:8`）、`src/review-request.ts:95` の中断、`tests/review.test.ts:370` の `toThrow`。仮に当てると、31 ファイルで 110 件のエラーになった。
- **決定: プリセットに合わせる。例外は作らない。** エラーは値（neverthrow の `Result` / `ResultAsync`）で返す。
  - 外から見える振る舞い（spec §5 の終了コード 0〜4、stdout と stderr の中身）は変えない。
  - 例外を前提にしていた試験は、`isErr()` と、そのエラーの種類を確かめる形に書き換える。それは内部の契約の変更として認める。
- プリセットの禁止を、例外の規則（`// eslint-disable` の類）で外してはいけない。プリセットに正式な例外の手続きがあり、どうしても避けられない箇所（外部の library が throw するのを catch する境目など）がある場合だけ、その手続きに従う。その箇所と理由は、返却に書く。
- 型検査は `bun check` を優先する（プリセットが tsgo を求めても）。その食い違いは返却に書く。
- この issue は、dx-perf-read（読み込みの修理）を統合した後の alpha の上で行う。

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
