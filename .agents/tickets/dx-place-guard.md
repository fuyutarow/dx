+++
schema = 2
name = "dx-place-guard"
outcome = "review の place = \"file:<glob>\" が規則のファイルに当たれば、規則の読み込みで exit 4 にする"
writes = ["src/policy.ts", "src/commands/check.ts", "src/commands/review.ts", "src/checks.ts", "tests/dx-place-guard.test.ts", "docs/spec.md"]
verify = ["bun test tests/dx-place-guard.test.ts"]
timeout_s = 600
premises = ["file:src/policy.ts", "file:src/checks.ts"]

[proposition]
id = "DX-PLACE-GUARD"
claim = "review の place = \"file:<glob>\" が規則のファイルに当たれば、規則の読み込みで exit 4 にする"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha（4028299a）の上で行う。**

## 決定（coordinator）
- .dx/ には規則だけを置く。verdict はデータなので、規則のファイル（dx.toml、.dx/ の下、[files] inputs）の外に置く（Unix 哲学の副原則 10。1 つの階層に 2 つの意味を持たせない）。
- review の `place = "file:<glob>"` の glob が、木の中の規則のファイルに 1 つでも当たる、または glob が `.dx/` で始まるなら、`UNDETERMINED:policy: <type>: review.place は規則のファイル（dx.toml、.dx/、inputs）の外に置く` で exit 4。check と review の両方で。

## やること
1. src/policy.ts の末尾に、次の関数を **この文面のまま** 足す（issue dx-policy-paths も同じ文面で足す）。`matches` は collection.ts が使っているものを import する。判定にはこの関数を使う。
```ts
/** Rule files: dx.toml, everything under .dx/, and [files] inputs. The one home for "what is policy". */
export function isPolicyPath(path: string, inputs: readonly string[]): boolean {
  return path === "dx.toml" || path.startsWith(".dx/") || matches(inputs, path);
}
```
2. 試験: `.dx/verdicts/*.jsonl` の place が exit 4 になる。`verdicts/*.jsonl` は通る。
3. spec §7 の review の place の説明に、この制約を 1 文で書く。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-place-guard.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えたファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
