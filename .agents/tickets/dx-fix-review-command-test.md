+++
schema = 2
name = "dx-fix-review-command-test"
outcome = "tests/dx-review-command.test.ts の試験が統合の merge で落ちる原因を突き止め、直す"
writes = ["tests/dx-review-command.test.ts","tests/helpers.ts"]
verify = ["bun test tests/dx-review-command.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware tests/dx-review-command.test.ts"]
timeout_s = 600
premises = ["file:tests/dx-review-command.test.ts"]

[proposition]
id = "DX-FIX-REVIEW-COMMAND-TEST"
claim = "tests/dx-review-command.test.ts の試験が統合の merge で落ちる原因を突き止め、直す"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。**

## 事実

統合の merge（5c3a20e42fcc）で、7 行の "rubric types require an explicit review command for check and review" が `expect(received).toBe(expected)` で落ちる。issue dx-review-command の枝では通っていた。ほかの issue（place の制約、frontmatter の place の削除、I-09 の判定の変更など）との組み合わせで、試験の fixture が別の理由で先に exit 4 になっていると見られる（未確認）。

## やること

1. 落ちる原因を確かめる。試験の fixture が、消えた機能（frontmatter の place、.dx/ の下の verdict）を使っていれば、それを今の規則に合わせる。dx-review-command の判定（rubric を持つ type があって command が無ければ exit 4、無ければ通る）を確かめる内容は変えない。
2. 原因が src の欠陥であれば、直さずに、その箇所と理由を返す。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。ほかの issue が同時に、統合の merge の上でほかのファイルを直している。
- 作業コピーは統合の merge（5c3a20e42fcc）の子で、依存は入っている。全体の検査（`mise run check`）は流さない。verify の命令だけを流す。
- 整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。`.md` には oxfmt をかけない。
- 止まるのは、書いてよいファイルの外にある欠陥に当たったときだけである。それ以外の食い違いは、目的に沿う最小の読みで決め、返却に書いて進む。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 変えたファイル、verify の結果、決めた読み、未検証。
