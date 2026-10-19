+++
schema = 2
name = "dx-resolve-model-ts"
outcome = "0.1.4 の統合の merge（d7a5e8144676）で競合した src/model.ts を、関わる issue の変更をすべて残す形で解く"
writes = ["src/model.ts"]
verify = ["bun -e \"const t=await Bun.file('src/model.ts').text(); if (/^(<{7}|>{7}|%{7}|[+]{7}) /m.test(t)) { console.error('conflict markers remain'); process.exit(1) }\" && bun run node_modules/oxfmt/bin/oxfmt --check src/model.ts"]
timeout_s = 600
premises = ["file:src/model.ts"]

[proposition]
id = "DX-RESOLVE-MODEL-TS"
claim = "src/model.ts の競合を、どの issue の変更も落とさずに解ける"
refuted_by = "2 つの issue の変更が、同じ箇所で両立しない（その箇所と 2 つの issue を返す）"
+++

**dx 0.1.4 の統合の lane から返した issue（2026-10-19）。作業コピーは、統合の merge d7a5e8144676 の子である。**

## 事実

- 0.1.4 の 11 の issue を 1 つの merge（d7a5e8144676）にまとめたところ、src/model.ts が競合した。
- 競合の面は、次の issue の commit から来ている（この表のうち、src/model.ts を変えたもの）。

| commit | issue | 何をしたか（「やること」） |
|---|---|---|
| 24379216 | dx-utf8 | .agents/tickets/dx-utf8.md |
| fdc51f43 | dx-diag-i06 | .agents/tickets/dx-diag-i06.md |
| 7cfa6f25 | dx-place-guard | .agents/tickets/dx-place-guard.md |
| 57d8e0a2 | dx-diag-i09 | .agents/tickets/dx-diag-i09.md |
| 401463f1 | dx-push-stderr | .agents/tickets/dx-push-stderr.md |
| 3a8e0d02 | dx-spec-text | .agents/tickets/dx-spec-text.md |
| b0d55e7d | dx-policy-paths | .agents/tickets/dx-policy-paths.md |
| a46eeef5 | dx-purge-match | .agents/tickets/dx-purge-match.md |
| 9446eace | dx-purge-frontmatter | .agents/tickets/dx-purge-frontmatter.md |
| 8301b582 | dx-lf | .agents/tickets/dx-lf.md |
| 359ed26b | dx-review-command | .agents/tickets/dx-review-command.md |

## やること

1. src/model.ts の競合の印（`<<<<<<<`、`%%%%%%%`、`+++++++`、`>>>>>>>`）をすべて解く。**関わる issue の変更を、どれも落とさない**（和をとる）。各 issue の変更は `git show <commit> -- src/model.ts` で読める（jj は lock が取れないので使わない）。各 issue の意図は、表の ticket の「やること」に書いてある。
2. 2 つの issue が同じ文や式を別々に変えていれば、両方の意図を満たす 1 つにする。同じ文面の追加（たとえば policy.ts の isPolicyPath）は 1 つにする。
3. どうしても両立しない箇所があれば、その箇所を目的に沿う最小の読みで決め、返却に書く。
4. 型が合うかは、ほかのファイルの競合が解けるまで確かめられない。統合の lane が、5 つのファイルを合わせた後に全体の検査を流す。

## 共通の決まり

- 上限は 10 分。src/model.ts だけを変える。ほかの 4 つのファイルは、ほかの issue が同時に解いている。
- 全体の検査（`mise run check`）は流さない。verify の命令だけを流す。`.md` には oxfmt をかけない。
- jj: commit しない（lock が取れない）。bookmark は動かさない。push しない。
- 返却: 解いた箇所ごとに、どの issue の変更をどう合わせたか。決めた読み。未検証。
