+++
schema = 2
name = "retro-dx-fix-symlink"
outcome = "retrospectives の木に symlink が無くなり（.dx/node_modules を追跡しない）、`dx check` が retrospectives の木で exit 0 または 1（判定できた）を返し、今の gate（mise run check、lint:records、review.ts）も動き続ける状態で、変更が commit されて返る"
writes = [".dx/**", ".gitignore", "tools/scripts/**", "tools/tests/**", "tools/tsconfig.json", "mise.toml"]
verify = ["mise run check", "dx check --base 'alpha@origin' @"]
timeout_s = 1200
premises = ["file:.dx/retro.ts"]

[proposition]
id = "RETRO-DX-FIX-SYMLINK"
claim = ".dx/node_modules の symlink を追跡から外し、依存の解決を setup の側で用意すれば、dx は木を判定でき、今の gate も動く"
refuted_by = "symlink を使わずに、tools/scripts が実行時に .dx/helpers の依存（zod、neverthrow）を解決する手段が無い（理由を返す）"
+++

**統合の後に見つかった失敗の修理です。** 原因は、coordinator が統合のときに `.dx` を丸ごと commit したことにあります。

## 事実

retrospectives の alpha（`4eb11332`）は `.dx/node_modules` を追跡している。これは `../tools/node_modules` への symlink。dx は symlink を判定できないので、次のようになる。

```
$ dx check            # retrospectives の workspace で
UNDETERMINED:unsupported or conflicted tree entry: .dx/node_modules (symlink )
exit 4
```

## やること

1. `.dx/node_modules` を追跡から外す（`jj file untrack`）。`.gitignore` に入れる。
2. symlink が無くなっても、次のものが動き続けるようにする。
   - `tools/scripts`（`lint:records`、`check.ts`、`schema.ts`）の実行時の依存の解決
   - `lint:ts` と `typecheck` の型解決
   
   方法は、次のどちらか、またはそれと同等のものを選ぶ。
   - `mise run setup` が、追跡しない symlink を作る
   - Bun の解決のしかたを、tsconfig や bunfig で指定する
   
   symlink を木に戻してはいけない。
3. `dx check --base 'alpha@origin' @` が、判定できる（exit 0 か 1）ことを確かめる。exit 4 はだめ。結果の finding の数を返却に書く。
4. `mise run check` を通す。sandbox で mise の状態に書けない場合は、`XDG_STATE_HOME` を一時ディレクトリにして流す。
5. 変更は `jj commit <paths>` で commit する。jj のロックが sandbox で取れない場合は、commit しないまま返し、そのことを書く。bookmark は動かさない。push しない。

## 返却

- 選んだ方法
- 変えたファイル
- `dx check` の結果（終了コード、finding の数）
- `mise run check` の結果
