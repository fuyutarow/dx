+++
schema = 2
name = "genealogy-retrospectives"
outcome = "notes/genealogy/retrospectives.md に、retrospectives のコードの各まとまりが『どのニーズ・事故・指示によって、いつ足されたか(と、いつ消されたか)』の系譜表と、そのニーズを Unix 哲学で満たすならどう分かれるかの所見、加えて 3 プロジェクトに共通する肥大化のパターンが、根拠(file:line、commit id、記録名:行)付きで書かれて返る"
writes = ["notes/genealogy/retrospectives.md"]
verify = ["test -s notes/genealogy/retrospectives.md"]
timeout_s = 2400
premises = []

[proposition]
id = "GENEALOGY-RETROSPECTIVES"
claim = "retrospectives の増減は、記録に残ったニーズと事故から説明でき、その記録群から 3 プロジェクト共通の肥大化の形を取り出せる"
refuted_by = "/home/fuyu/Workspace/retrospectives の履歴か記録を読めない(理由を返す)"
+++

**読み取りだけの調査です。** どの repo のファイルも変えない。jj/git の状態を変える命令を使わない(log・show・diff など読むだけはよい)。書いてよいのは notes/genealogy/retrospectives.md だけ。

## 背景(coordinator から)

owner は、polysearch-v1・soks・retrospectives の 3 つを、Unix 哲学で統治し直した新しいプロジェクト **dx** にまとめることを考えている。owner の問い:「どうしてそこまでコードが肥大化したのか。ニーズがあったわけでしょ？」。足りないのは **なぜ増えたか** の観察。polysearch-v1 と soks は別の worker が調べている。あなたは retrospectives 自身と、**retrospectives の記録全体(112 件)から見える 3 プロジェクト共通の形**を担当する。

対象: /home/fuyu/Workspace/retrospectives

## やること

1. tools/ のコードのまとまり(check.ts、schema.ts、candidate.ts、review.ts、lint-*、テスト)と、消されたもの(lessons/、recur、records/index.md など)を数え上げ、行数を付ける。
2. それぞれについて、足された時期と消された時期と理由を、履歴(`git log --follow` / `jj log`、README.md)と記録(20261016_retrospectives-schema-and-review-gate-frustration.md など)から特定する。**記録は rr で引く**。retrospectives は ccc 未登録なので `rr about` は FATAL になる(これは「記録を読めない」ではない。refuted_by に当たらない)。`rr text '<語>'`・`rr regex '<re>'`・`rr files '<glob>'` で引き、該当ファイルは直接読む。
3. 各まとまりのニーズを D(領域に固有)/ T(既存の道具が満たせる)/ S(前の設計判断が招いた)/ X(消費者がいない推測)に分類し、根拠を書く。
4. **横断の観察**: records/ の postmortem、frustration review、issue-structure、hearing、purge-decision、responsibility-split、DevX の記録を rr で引き、polysearch・soks・retrospectives・agx・hook について「仕組みが足された理由」として繰り返し出てくる形を挙げる(例: 境界を後付けの検査で守る → 迂回 → 検査を足す、agent が記録を書き換えた事故 → 凍結の仕組み、owner の指示を仕様に過剰に写した、など)。それぞれ記録名:行の根拠を付け、回数を数える。
5. それらを Unix 哲学(1 つのことをする小さな filter、テキストの入出力、既存の道具への leverage、捕らわれない interface、90% 解)で満たすなら、どの道具に分かれ、何が残差になるかを書く。

## 返却

notes/genealogy/retrospectives.md に、日本語で次を書く。
- 系譜表: まとまり | 行数 | 足された時期 / 消された時期 | きっかけ | 根拠 | 分類 D/T/S/X
- 3 プロジェクト共通の肥大化のパターン(回数と根拠つき)
- Unix 哲学で分けた場合の所見と残差
- 確かめた事実と推測を分ける。推測には「推測」と書く。
