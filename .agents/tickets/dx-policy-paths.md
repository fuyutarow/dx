+++
schema = 2
name = "dx-policy-paths"
outcome = "規則のファイルの判定を src/policy.ts の isPolicyPath 1 つにまとめ、I-09 と policy の overlay がそれを使う"
writes = ["src/policy.ts", "src/collection.ts", "tests/dx-policy-paths.test.ts"]
verify = ["bun test tests/policy-revision.test.ts tests/acceptance.test.ts tests/dx-policy-paths.test.ts"]
timeout_s = 600
premises = ["file:src/collection.ts", "file:src/policy.ts"]

[proposition]
id = "DX-POLICY-PATHS"
claim = "規則のファイルの判定を src/policy.ts の isPolicyPath 1 つにまとめ、I-09 と policy の overlay がそれを使う"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の issue（2026-10-19、DevX ヒアリングから）。alpha の上で行う（作業コピーが alpha の子孫であればよい。issue の ticket だけを足した commit の上でもよい）。**

## 事実
- I-09 の規則の判定（src/collection.ts:260 の policyPath）は `.dx/` と inputs だけを見ていて、dx.toml を見ていない（dx.toml は inputs の宣言が変わったかだけで見ている）。
- policy の overlay（src/collection.ts の tree の filter、`matches(config.files.inputs, path) || path === "dx.toml" || path.startsWith(".dx/")`）は、別の式で同じことを判定している。

## やること
1. src/policy.ts の末尾に、次の関数を **この文面のまま** 足す（issue dx-place-guard も同じ文面で足す。文面が同じなら統合で衝突しない）。`matches` は collection.ts が使っているものを import する。
```ts
/** Rule files: dx.toml, everything under .dx/, and [files] inputs. The one home for "what is policy". */
export function isPolicyPath(path: string, inputs: readonly string[]): boolean {
  return path === "dx.toml" || path.startsWith(".dx/") || matches(inputs, path);
}
```
2. I-09 の policyPath と、overlay の filter を、この関数の呼び出しに置き換える。I-09 では dx.toml も規則に数えるようになる。dx.toml と記録を同じ commit で変えると I-09 になることを、試験で確かめる。
3. spec の I-09 の行に、規則のファイルの定義（dx.toml、.dx/ の下、[files] inputs）を 1 文で書く。

## 共通の決まり（0.1.4 の 10 issue に共通）

- 上限は 10 分。この issue の範囲だけを変える。ほかの issue（dx-0.1.4 の A〜J）が同時に同じ repo を変えている。統合は coordinator が行う。
- 新しい試験は、この issue の名前のファイル（`tests/dx-policy-paths.test.ts`）に書く。既存の試験ファイルは、この issue の変更で壊れる期待値だけを直す。
- spec（docs/spec.md）と README は、この issue に書いた節だけを直す。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。**`.md`（docs/spec.md、README.md）には oxfmt をかけない**（全体が整形し直され、ほかの issue と統合で衝突する）。
- 止まるのは、この issue の範囲の外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。


## 前の回の返却を受けて（coordinator、2026-10-19 15:30。最新版）

- 前の回で、docs/spec.md（と README.md）全体に oxfmt がかかり、数百行が整形し直された。このままでは、ほかの issue と統合で衝突する。
- `jj restore --from @- docs/spec.md README.md` で 2 つのファイルを戻し、この issue の「やること」に書いた文だけを、手で入れ直す。`.md` には oxfmt をかけない。
- 前の回の verify は、並列の負荷で試験が 5 秒の上限を超えた。負荷を下げたので、verify をもう一度流す。時間切れになった試験があれば、その試験だけを `bun test <file> -t '<name>'` で流し直して確かめてよい。
- src と tests の変更は、そのまま残してよい（前の回の実装を続ける）。
