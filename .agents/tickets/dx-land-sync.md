+++
schema = 2
name = "dx-land-sync"
outcome = "dx land が push に成功した後、jj の remote-tracking の bookmark（<branch>@<remote>）が、push した commit を指す。jj を前提にした道具（ws rm、jj log、trunk()）が、land した直後から、その commit を land 済みとして扱える。試験があり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 1500
premises = ["file:src/commands/land.ts", "file:docs/spec.md"]

[proposition]
id = "DX-LAND-SYNC"
claim = "dx land は、push の後に、push した 1 つの branch だけを jj に取り込めば（jj git import か、その branch だけの fetch）、jj の見方と remote を食い違わせずに済む"
refuted_by = "取り込みのあとも、jj の <branch>@<remote> が push した commit を指さない（その出力を返す）"
+++

**retrospectives から報告された摩擦の修理です。**

## 事実

- `dx land @-` が成功した後に `ws rm` を流すと、workspace が「unlanded」として拒否された。`jj git fetch` を流すまで直らなかった（retrospectives のセッション、2026-10-17）。
- dx land は git の lease つきの push で remote を更新するが、jj の `alpha@origin` は更新しない。そのため jj から見ると、push した commit がまだ land されていないように見える。

## やること

1. push が通った後に、jj の remote-tracking の bookmark を合わせる。方法は次のどちらか（確かめて選ぶ）。
   - `jj git import`（colocated の git の refs を取り込む）
   - push した 1 つの branch だけを `jj git fetch --remote <remote> --branch <branch>` で取り込む
2. この取り込みに失敗しても、land そのものは成功したものとして exit 0 を返し、stderr に警告を出す。正本は remote にあるので、成否はそちらで決まる（spec §5 C2 の「bookmark の移動の失敗」と同じ扱い）。
3. 試験: bare の remote を使った一時の repo で land し、直後に `jj log -r '<branch>@<remote>'` が push した commit を指すことを確かめる。
4. README の land の節に、1 行書き足す。

この issue は、dx-tree-checks を統合した後の alpha の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 選んだ方法
- 試験
- `mise run check` の結果
