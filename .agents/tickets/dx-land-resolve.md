+++
schema = 2
name = "dx-land-resolve"
outcome = "dx land が、push の結果が分からないとき（RESULT_UNKNOWN）に、remote を fetch して、試した REV が <branch>@<remote> の祖先に入っているかを確かめ、入っていれば exit 0（受領を出す）、入っていなければ exit 3 RACE に確定させる。確かめられないときだけ RESULT_UNKNOWN を残す。remote の ref のロックの競合は RACE に分類する。並行の land の試験で、RESULT_UNKNOWN が実際には確定できた件数が 0 になり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:src/commands/land.ts", "file:docs/spec.md"]

[proposition]
id = "DX-LAND-RESOLVE"
claim = "dx land の RESULT_UNKNOWN の多くは、push の後に祖先の関係を確かめれば、成功か RACE のどちらかに確定できる"
refuted_by = "fetch した後も、試した REV が受け入れられたかどうかを決められない場合が残る（その状況を返す）"
+++

**research-record-v2 から報告された、dx land の振る舞いの欠陥です。**

## 事実（research-record-v2 の run 424486c0）

- scratch の bare の remote に、8 つの書き手が 3 件ずつ、同時に `dx land @-` を流した。
- 終了コード: exit 1 `NOT_FAST_FORWARD` が 1 回、exit 3 `RACE` が 101 回、exit 3 `RESULT_UNKNOWN` が 11 回。11 回とも、実際には受け入れられていなかった。
- 書き手が RESULT_UNKNOWN を失敗と見て止まると、記録が失われる（初版では 24 件中 13 件しか入らなかった）。

## 追加の事実（research-record-v2 から。2026-10-18）

- 競合の無い、書き手 1 人の land でも、GitHub の https の remote に対して毎回 `RESULT_UNKNOWN` になり、push されない。
  - repo: `~/Workspace/research-record-v2.ws/ws_rr2-r2-types`（読むだけにする）
  - remote: `https://github.com/fuyutarow/research-record-v2.git`（private）
  - REV は alpha@origin の子孫で、`dx check` の新しい finding は 0 件。stderr は「dx: waiting for origin (push)…」→「RESULT_UNKNOWN」、exit 3。後で `git ls-remote` を見ても、alpha は変わっていない。
- 同じ remote に `jj git push -b alpha` で push すると成功する（認証は通っている）。
- この repo は `git lfs install --local` 済みで、pre-push の hook がある。file:// の bare の remote では、land が成功する。
- retrospectives（https、LFS の hook なし）では、dx land が成功している。

**やることに足す:** 原因を特定する。候補は、LFS の pre-push の hook（stdin、環境変数、出力）、https の認証の扱い（credential helper、環境変数）、push の出力の解析の 3 つ。そのうえで、この条件でも push が通るように直す。一時の repo に `git lfs install --local` を入れ、hook のある状態で、file:// と、できれば https の両方で試験する（GitHub に試験用の repo を作らない。https は、手元の https のサーバか、hook の振る舞いを再現する試験で代わりにする）。直せない場合でも、`RESULT_UNKNOWN` ではなく、原因が分かる拒否コードと stderr を出す。

## やること

1. push の後に結果が分からないときは、`<remote>` から `<branch>` を fetch し、REV が `<branch>@<remote>` の祖先にあるかを確かめる。
   - 祖先にある → exit 0。受領を出す。
   - 祖先に無い → exit 3 `RACE`。
   - fetch もできない → 今までどおり exit 3 `RESULT_UNKNOWN`。
2. git の push の失敗の分類を見直す。remote の ref のロックの競合（`failed to lock` など）と lease の外れは `RACE`、届かないのは `REMOTE_UNAVAILABLE`。どちらにも当たらないものだけを `RESULT_UNKNOWN` にする。
3. **再試行（fetch → rebase → 流し直す）は dx の中には入れない。** rebase は書き手の commit を書き換え、競合のときには判断が要る。そのため、呼び出す側の仕事とする（Unix の「呼び出し側が合成する」）。README に、書き手の側の再試行の手順を書く（`jj git fetch && jj rebase -r @- -d <branch>@<remote> && dx land @-` の繰り返し。上限は呼び出し側が決める）。
4. 試験: bare の remote と、並行の書き手（8 本以上）を使い、各試行の終了コードと、その試行の commit が実際に受け入れられたかを照合する。exit 0 と実際の受け入れが一致し、RESULT_UNKNOWN のうち確定できたはずのものが 0 件であることを確かめる。
5. spec §5 の C4 の表に、RESULT_UNKNOWN を確定させる手順を書く。

この issue は、dx-strict-yaml を統合した後の alpha の上で行う（dx-link-match より前）。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない（試験の bare の remote を除く）。

## 返却

- 分類の変更
- 並行の試験の結果（終了コードと、実際の受け入れの照合）
- `mise run check` の結果
