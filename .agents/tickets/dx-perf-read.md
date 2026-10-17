+++
schema = 2
name = "dx-perf-read"
outcome = "dx が revision の木を、ファイルごとの jj 呼び出しではなく、まとめて読むようになる。soks（6,823 文書）の `dx check --base A B` が、今の 403 秒から 15 秒以下になり、判定（finding の組と終了コード）は変わらない。測定の受領があり、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md"]
verify = ["mise run check"]
timeout_s = 3600
premises = ["file:docs/spec.md", "file:src/repository.ts"]

[proposition]
id = "DX-PERF-READ"
claim = "dx check の遅さの大半は、REV の木のファイルを 1 件ずつ jj で読むことにあり、まとめて読めば判定を変えずに 1 桁以上速くなる"
refuted_by = "まとめて読んでも 15 秒を下回らない（どこに時間がかかっているかの測定を返す）"
+++

**soks の移行の影運用で見つかった、dx の性能の欠陥（spec R-7）です。**

## 事実（soks のセッションの報告。2026-10-17）

- soks（6,823 文書）の全体の `dx check` は 403 秒。soks-govern の check は 2.1 秒。
- soks の worker の見立て: dx は head と base の両方で、ファイルを 1 件ずつ jj で読んでいる。
- 履歴の再生（直近 30 日の alpha の 598 commit）を今のままでやると、約 66 時間かかる。

## やること

1. まず測る。soks の写し（読むだけ。`/home/fuyu/Workspace/soks` の現在の alpha）か、同じ規模の合成の repo で、どこに時間がかかっているかを測る。jj の呼び出しの回数、ファイルの読み込み、parse、検査、`.dx/` の bundle。
2. 読み込みをまとめる。
   - 案 A: `jj file show` を、パスを列挙して 1 回にまとめる。
   - 案 B: colocated の git に対して `git cat-file --batch` を使う。jj の commit id から tree を引く。
   - 案 C: 同等の方法。
   
   どれを選ぶにしても、spec の I-07 を守る（副作用が無い。作業コピーを snapshot しない。cache を repo に書かない。判定できなければ終了コード 4）。
3. base と head で中身が同じファイル（blob の id が同じ）は、1 回だけ読んで parse する。
4. 判定が変わらないことを確かめる。今の 70 試験に加えて、retrospectives（116 記録）と soks（読むだけ）で、変える前と後の finding の組と終了コードが同じであることを確かめる。
5. 受領: soks の全体の check の時間（変える前と後）、retrospectives の時間、jj または git の呼び出しの回数。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- どこに時間がかかっていたか（測定）
- 選んだ方法
- 変えたファイル
- 前と後の時間
- 判定が同じであることの確かめ
- `mise run check` の結果
