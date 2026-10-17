+++
schema = 2
name = "dx-merge-review"
outcome = "dx の alpha（core、help の修理、land）と review の枝を合わせた merge の commit で、src/cli.ts と README.md の競合が解かれ、6 つのコマンド（ls、check、review、land、view、schema）がすべて登録されていて、help は平文のままであり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check", "bun src/main.ts --help"]
timeout_s = 1200
premises = ["file:docs/spec.md"]

[proposition]
id = "DX-MERGE-REVIEW"
claim = "land の枝と review の枝の競合は、両方のコマンドの登録を残し、help の修理を保つだけで解ける"
refuted_by = "2 つの枝が、同じ関数や同じ型を、両立しない形に変えている（その箇所を返す）"
+++

**統合の競合の解消だけを行う issue です。** 振る舞いは、どちらの枝のものも変えないでください。

## 事実

この workspace の作業コピーは、次の 2 つの親を持つ merge の commit です。

- dx の alpha（`bf880517`）: core、help の修理（help の出力は環境によらず平文。`tests/contracts.test.ts` の C1）、land
- review の枝（`bb9535eb`）: review と、Jev の要求に `model` を入れる修理

`jj resolve --list` の結果:

```
README.md     2-sided conflict
src/cli.ts    2-sided conflict
```

## やること

- `src/cli.ts`: 両方のコマンドの登録を残す。help の平文化（alpha 側）を保つ。
- `README.md`: 両方の説明を残す。コマンドの一覧は 6 つにする。
- `mise run check` を通す。land の試験、review の試験、C1 の試験が、すべて通ること。

## jj について

- 作業コピーの merge の commit の中で解き、競合が残っていないこと（`jj resolve --list` が空）を確かめる。bookmark `alpha` は動かさない。push しない。

## 返却

- 解いた箇所
- `mise run check` の結果
- `bun src/main.ts --help` の出力
