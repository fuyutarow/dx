+++
schema = 2
name = "dx-land"
outcome = "dx に spec.md 版 1 の `dx land [REV]` が加わる。fetch して remote の正規の branch を base とし、REV が base の子孫であることを確かめ、check(base, REV) を流し、通れば base を期待値にした lease つきで push し、手元の bookmark を合わせる。I-01 と I-08 を、一時の jj repo とローカルの bare remote で確かめ、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md"]

[proposition]
id = "DX-LAND"
claim = "dx land は、jj の fetch と、lease つきの push だけで、hosting の機能に依存せずに、spec の I-01 と I-08 と終了コードの規定を満たせる"
refuted_by = "jj（または git）が、期待値つきの push（lease）を提供しない（その版と理由を返す）"
+++

**仕様は `docs/spec.md`（版 1）。** §5 の land の行、C2、C4、§3 の I-01 と I-08、§9 の D2 を読んでください。spec.md は書き換えないでください。

## この issue の範囲

`dx land [REV]`（REV の既定は `@`）を足します。手順は次のとおりです。

1. `[repo] remote` を fetch し、`<branch>@<remote>` を base とする。
2. REV が base の子孫でなければ、終了コード 1 と `NOT_FAST_FORWARD` を返す。
3. dx-core の `check(base, REV)` を同じ関数で流す。新しい finding があれば、push せずに終了コード 1 を返し、finding を全件出す。
4. 通れば、base を期待値にした lease つきで、REV を remote の branch に push する。
   - jj の `jj git push` が lease を持たない場合は、git の `--force-with-lease=<branch>:<base>` を使う。fast-forward であることは手順 2 ですでに確かめてあるので、強制はしない。
5. push が通ったら、手元の bookmark を REV に合わせ、stdout に受領 `{"v":1,"commit","base","branch","remote"}` を出す。

終了コードと失敗のときの扱い:

- lease が外れた → 3 / `RACE`
- remote に届かない、時間切れ（60 秒） → 3 / `REMOTE_UNAVAILABLE`
- push の結果が分からない → 3 / `RESULT_UNKNOWN`。成功とは返さない。
- push が通った後に bookmark を合わせられなかった → 0 を返し、stderr に警告を出す。
- 待ちが 2 秒を超えたら、stderr に `dx: waiting for origin (fetch|push)…` を 1 行出す。

**hosting（GitHub など）の機能や API は使わない**（D2）。`--force` は作らない。

## 試験

- 一時ディレクトリに、bare の git remote と jj repo を作って試験する。**実在の remote には push しない。**
- 次のことを、それぞれ試験で確かめる。
  - 正常に land すること
  - fast-forward でないときに 1
  - check で落ちたときに 1 で、push されていないこと
  - 別の clone が先に land したとき（lease が外れたとき）に 3 で、remote が変わっていないこと
  - remote が無いときに 3
  - 受領の形

## 作業場所の事実

- この workspace は、dx-core を統合した後の dx の `alpha` から作る。dx-review と並行して走るので、`src/commands/land.ts` と `src/land/**`、`tests/land/**` の中で閉じるように書く。共有の部分（コマンドの登録など）への変更は最小にする。

## jj について

- commit は 1 つにまとめてよい。bookmark `alpha` は動かさない。push は試験の bare remote にだけする。

## 返却

- 変えたファイル
- 試験の一覧
- `mise run check` の結果
- spec との食い違い
- 未検証のこと
