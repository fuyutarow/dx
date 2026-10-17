+++
schema = 2
name = "retro-dx-fix-lint"
outcome = "retro-dx の作業コピーで、mise run check（とくに lint:ts = lint-ts-candidate --dir tools）が、coordinator の通常の環境でも exit 0 になり、影運用の結果（116 件中 116 件一致）が変わらずに返る"
writes = ["dx.toml", ".dx/**", "tools/scripts/**", "tools/tests/**", "tools/tsconfig.json", "mise.toml"]
verify = ["mise run check", "bun tools/scripts/shadow.ts /home/fuyu/Workspace/dx"]
timeout_s = 1800
premises = ["file:tools/scripts/check.ts", "file:tools/scripts/schema.ts", "file:.dx/helpers/check.ts"]

[proposition]
id = "RETRO-DX-FIX-LINT"
claim = "tools/ の型検査と lint が .dx/helpers の型を解決できるようにすれば、lint:ts は通り、影運用の結果は変わらない"
refuted_by = "lint-ts-candidate が、tools/ の外（.dx/）のファイルを型解決できない仕組みになっている（その根拠を返す）"
+++

**retro-dx（run 5a177082）の受け入れ検査で見つかった失敗の修理です。**

## 失敗の事実（coordinator が通常の環境で `mise run check` を流した結果。exit 1）

```
[lint:ts] $ lint-ts-candidate --dir tools
{"message": "Unsafe assignment of an error typed value.","code": "typescript(no-unsafe-assignment)", "filename": "scripts/check.ts", line 76 ...}
{"message": "Unsafe member access .review on an `error` typed value.", "filename": "scripts/check.ts", ...}
... scripts/check.ts 76–97 行、scripts/schema.ts 33 行、tests/rg-gate.test.ts 15–18 行
[lint:ts] ERROR task failed
```

試験は 54 件すべて通っている。影運用は 116 件中 116 件が一致している（どちらも coordinator が確かめた）。

`.dx/helpers` から import した値が、`tools/` の lint の型解決では `error` 型になっている、と見られる（推測）。

全ログ: `/tmp/claude-1000/-home-fuyu-Workspace-dx/839d6f3e-4be1-4ef7-be78-1f69f738c3c5/scratchpad/retro-check.log`

## やること

- `lint:ts` が型を解決できるようにする。候補は 2 つ。
  - `tools/tsconfig.json` の include と paths を直す
  - `.dx/helpers` の型を `tools/` から解決できる形にする
- 規則の置き場は 1 つのまま保つ（`.dx/helpers` が正本）。
- lint の規則を緩めたり、無効にしたりして通すことはしない。
- sandbox で mise の状態に書けない場合は、`XDG_STATE_HOME` を一時ディレクトリにして `mise run check` を流し、その結果を返す。前の回の「成功」は、coordinator の環境では再現していない。返す前に、`lint-ts-candidate --dir tools` を単独でも流すこと。

## jj について

- 作業コピーの上に積む。bookmark は動かさない。push しない。

## 返却

- 原因
- 変えたファイル
- `mise run check` と `lint-ts-candidate --dir tools` の結果（コマンド、終了コード、最後の行）
- 影運用の結果
