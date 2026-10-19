+++
schema = 2
name = "dx-jex-reason-na"
outcome = "jex の reason が {na:true, why} のときも、dx review が verdict を作り、reasons には文字列の reason だけを残す"
writes = ["src/commands/review.ts", "tests/dx-jex-reason-na.test.ts"]
verify = ["bun test tests/dx-jex-reason-na.test.ts tests/dx-jex-invoke.test.ts && bun .dx-preset/lint-oxlint.ts --type-aware src/commands/review.ts tests/dx-jex-reason-na.test.ts"]
timeout_s = 600
premises = ["file:src/commands/review.ts"]

[proposition]
id = "DX-JEX-REASON-NA"
claim = "reason が無いと示された bit があっても、p から verdict を作れる"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx 0.1.5 の issue（2026-10-19）。作業コピーは dx の alpha（c8e360f5）である。**

## 事実

- dotfiles は jex を変える（run cb7e1573、jex-reason-na）。bits[].reason と refuted.reason は、Jev が理由の文を返せばその文字列、返さなければ `{ "na": true, "why": string }` になる。固定の作り文字列は出さない。
- 今の dx は、src/commands/review.ts:42 と :44 で reason を `z.string()` として読む。object が来ると形に合わず、exit 4 になる。:298 で reasons を verdict に書く。

## やること

1. :42 と :44 の reason を `z.union([z.string(), z.object({ na: z.literal(true), why: z.string() })])` にする。
2. verdict の reasons（:298）には、文字列の reason だけを残す（na の bit は書かない）。文字列の reason が 1 つも無ければ、reasons の field を書かない。p と pass の決め方は変えない。
3. 試験（tests/dx-jex-reason-na.test.ts）: 偽の jex（tests/fixtures/fake-jex.ts の制御で出力を決められる。できなければ試験の中で小さな偽の jex を書く）が、reason に文字列と {na} を混ぜて返すとき、verdict が作られ、reasons に文字列の分だけが入ること。すべて {na} のとき reasons の field が無いこと。

## 共通の決まり

- 上限は 10 分。書いてよいファイルだけを変える。issue dx-jex-evidence が同時に src/commands/review.ts の別の箇所（evidence の渡し方）を直している（統合は coordinator が行う）。:42・:44・:298 の付近だけを変える。
- 全体の検査は流さない。verify の命令だけを流す。整形は、変えた `.ts` のファイルにだけ `bun run node_modules/oxfmt/bin/oxfmt <files>` をかける。house の規則に従う。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 変えた箇所、verify の結果、未検証。
