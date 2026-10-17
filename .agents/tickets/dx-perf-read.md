+++
schema = 2
name = "dx-perf-read"
outcome = "読み込みをまとめる変更（jj の木の情報 + git cat-file --batch）が、判定を変えずに仕上がる。soks（6,823 文書）と retrospectives（116 記録）の両方で、変える前と後の finding の組と終了コードが同じであることが確かめられ、mise run check が通り、README が更新されて返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/repository.ts"]

[proposition]
id = "DX-PERF-READ"
claim = "読み込みをまとめる変更は、soks と retrospectives の両方で判定を変えない"
refuted_by = "soks か retrospectives で、変える前と後の finding の組か終了コードが違う（その差を返す）"
+++

**この brief は、前の回（run ed02fb1e）の返却を受けて書き直した最新版です。**

## 前の回の結果（coordinator が受け入れる部分）

- 案 B（jj の木の情報と `git cat-file --batch`）を実装した。
- soks は 403 秒から 22.6 秒になった。retrospectives は 18.1 秒から 2.2 秒になり、出力の SHA-256 と終了コードは変える前と同じだった。
- jj と git の呼び出しは、retrospectives では 443 回から 10 回になった。
- 15 秒という目標は coordinator が根拠なく決めた数字で、取り下げる。検査の処理（13.6 秒）を速くするのは、別の issue にする。

## この回でやること（仕上げだけ。速くする作業はもうしない）

1. 追加した試験の lint の指摘を直す（14 行目の、要らない引用符のエスケープ）。
2. soks で、変える前と後の finding の組と終了コードが同じであることを確かめる（前の回では、まだ確かめていなかった）。soks は読むだけにし、写しを使う。変える前の測定がまだ続いている場合は、その結果を使うか、alpha の 1 つの revision に絞って比べる。
3. README に、読み込みの方式（git の object を直接読むこと、colocated の git が要ること）を書く。
4. `mise run check` を通す。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- soks の finding の組が一致したことの確かめ（件数と SHA-256）
- 変えたファイル
- `mise run check` の結果
- 検査の処理の時間の内訳（次の issue のために、check ごとの時間が分かれば書く）
