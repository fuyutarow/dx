+++
schema = 2
name = "genealogy-soks"
outcome = "notes/genealogy/soks.md に、soks のコードの各まとまりが『どのニーズ・事故・指示によって、いつ足されたか』の系譜表と、そのニーズを Unix 哲学(小さな単機能の filter の合成、既存の git/jj/agx/rr への leverage)で満たすならどう分かれるかの所見が、根拠(file:line、commit id、retrospectives の記録名:行)付きで書かれて返る"
writes = ["notes/genealogy/soks.md"]
verify = ["test -s notes/genealogy/soks.md"]
timeout_s = 2400
premises = []

[proposition]
id = "GENEALOGY-SOKS"
claim = "soks の肥大化は、記録に残ったニーズと事故から説明でき、そのニーズごとに置き場(領域に固有 / 既存の道具 / 前の設計が招いたもの / 消費者のいない推測)を分類できる"
refuted_by = "/home/fuyu/Workspace/soks の履歴か /home/fuyu/Workspace/retrospectives の記録を読めない(理由を返す)"
+++

**読み取りだけの調査です。** 対象 repo・retrospectives・他の repo のファイルを変えない。jj/git の状態を変える命令を使わない(log・show・diff など読むだけはよい。jj は `--ignore-working-copy` を付ける)。書いてよいのは notes/genealogy/soks.md だけ。

## 背景(coordinator から)

owner は、polysearch-v1・soks・retrospectives の 3 つを、Unix 哲学で統治し直した新しいプロジェクト **dx** にまとめることを考えている。owner の問い:「どうしてそこまでコードが肥大化したのか。ニーズがあったわけでしょ？」。いまの形(行数・機能)の調査は済んでいる(/home/fuyu/.cache/soks-coord/hear-a/answer.md、hear-b/answer.md。読んでよい)。足りないのは **なぜ増えたか** の観察。

対象: /home/fuyu/Workspace/soks

## やること

1. コードのまとまり(おおむね 150 行以上のモジュール・script、または一つの機能群)を数え上げ、行数を付ける。
2. それぞれについて、足された時期と理由を、次から突き合わせて特定する。
   - repo の履歴: `jj --ignore-working-copy log` / `git log --follow` のコミットメッセージ、soks-govern/README.md の退役の記録(:299-315 付近)、DOCTRINE.md、AGENTS.md。
   - retrospectives(/home/fuyu/Workspace/retrospectives/records/): **rr で引く**。retrospectives は ccc 未登録なので `rr about` は FATAL になる(これは「記録を読めない」ではない。refuted_by に当たらない)。`rr text '<語>'`・`rr regex '<re>'`・`rr files '<glob>'` で引き、該当ファイルは直接読む。ccc 登録済みの repo(soks など)では raw の grep/rg/find は hook で禁止なので rr を使う。soks・soks-govern・knowledge・hook・custody などを扱う記録を読み、どの事故・owner の指示・不満がその仕組みを生んだかを拾う。
   - 他の repo からの呼び出し(install-hooks で入った consumer、submodule での読み手)。
3. 各まとまりのニーズを次の 4 つに分類し、根拠を書く。
   - D: 領域に固有のニーズ(dx でも持ち主が必要)
   - T: 既存の道具(git/jj、agx、rr/ccc、Claude Code の harness、OS)がすでに満たせる、または満たすべきもの
   - S: 前の設計判断が招いたもの(例: 共有作業コピーに複数の書き手がいる、人の git を残す)。その元の判断も書く
   - X: 消費者がいない推測、または既に要らなくなったもの
4. 同じ形で繰り返し起きた事故やニーズを「パターン」として挙げる(例: 書き込みの境界を hook で守る → 迂回が見つかる → 解析を足す、の繰り返しがあったか)。
5. そのニーズを Unix 哲学(1 つのことをする小さな filter、テキストの入出力、既存の道具への leverage、捕らわれない interface、90% 解)で満たすなら、どの道具に分かれ、何が残差になるかを書く。

必ず扱うもの: hooks.rs・shell_syntax.rs・jj_policy.rs(書き込み阻止層、約 2,535 行)、custody.rs・commit.rs(選択 commit)、store.rs の journal/recovery、publish.rs、git_hooks.rs、validation.rs、旧 Bun manager から Rust への作り直しの経緯。

## 返却

notes/genealogy/soks.md に、日本語で次を書く。
- 系譜表: まとまり | 行数 | 足された時期 | きっかけ(事故・指示・ニーズ) | 根拠 | 分類 D/T/S/X
- パターン(繰り返し起きた肥大化の形)
- Unix 哲学で分けた場合の所見と残差
- 確かめた事実と推測を分ける。推測には「推測」と書く。
