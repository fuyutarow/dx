+++
schema = 2
name = "dx-test-timeout-default"
outcome = "bun の試験の既定の上限を bunfig.toml で 60 秒に決め、全体の検査の負荷で 5 秒を超えて落ちる試験をなくす"
writes = ["bunfig.toml"]
verify = ["bun test tests/policy-revision.test.ts tests/dx-jex-invoke.test.ts"]
timeout_s = 600
premises = ["file:mise.toml"]

[proposition]
id = "DX-TEST-TIMEOUT-DEFAULT"
claim = "試験の上限を 1 か所で決めれば、上限の付け忘れによる時間切れは起きない"
refuted_by = "verify の命令が、この変更の後も通らない"
+++

**dx の試験の設定（2026-10-19、統合の lane から）。作業コピーは dx の alpha の子で、依存は入っていない（`bun install --frozen-lockfile` を流してよい）。**

## 事実

- 全体の検査（`mise run check`。mise.toml:38 の `bun test tests`）で、上限を付けていない試験が、負荷のために既定の 5 秒を超えて落ちることが 2 回あった。
  - tests/dx-jex-invoke.test.ts:80（5000.40ms）。上限を付けて直した。
  - tests/policy-revision.test.ts:59（5012.58ms）。単独なら 2 回とも通る。このファイルで上限が付いているのは :211 の試験（60000）だけ。
- dx の多くの試験は、1 件の中で jj と dx を何度も走らせる。上限は、試験ごとにばらばらに付けている。repo には bunfig.toml が無い。

## やること

1. repo の根に bunfig.toml を作り、`[test]` の `timeout = 60000` だけを書く（bun の試験の既定の上限。試験ごとに付けた上限は、そのまま優先される）。
2. 試験のファイルは変えない。
3. verify を流し、上限を付けていない試験も通ることを確かめる。

## 共通の決まり

- 上限は 10 分。bunfig.toml だけを作る。全体の検査は流さない。verify の命令だけを流す。
- jj: commit しない。bookmark は動かさない。push しない。
- 返却: 作ったファイル、verify の結果。
