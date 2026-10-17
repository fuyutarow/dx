+++
schema = 2
name = "genealogy-polysearch-v1"
outcome = "notes/genealogy/polysearch-v1.md に、polysearch-v1 のコードの各まとまりが『どのニーズ・事故・指示によって、いつ足されたか』の系譜表と、そのニーズを Unix 哲学(小さな単機能の filter の合成、既存の git/jj/agx/rr への leverage)で満たすならどう分かれるかの所見が、根拠(file:line、commit id、retrospectives の記録名:行)付きで書かれて返る"
writes = ["notes/genealogy/polysearch-v1.md"]
verify = ["test -s notes/genealogy/polysearch-v1.md"]
timeout_s = 2400
premises = []

[proposition]
id = "GENEALOGY-POLYSEARCH-V1"
claim = "polysearch-v1 の肥大化は、記録に残ったニーズと事故から説明でき、そのニーズごとに置き場(領域に固有 / 既存の道具 / 前の設計が招いたもの / 消費者のいない推測)を分類できる"
refuted_by = "/home/fuyu/Workspace/polysearch-v1 の履歴か /home/fuyu/Workspace/retrospectives の記録を読めない(理由を返す)"
+++

**読み取りだけの調査です。** 対象 repo・retrospectives・他の repo のファイルを変えない。jj/git の状態を変える命令を使わない(log・show・diff など読むだけはよい)。書いてよいのは notes/genealogy/polysearch-v1.md だけ。

## 背景(coordinator から)

owner は、polysearch-v1・soks・retrospectives の 3 つを、Unix 哲学で統治し直した新しいプロジェクト **dx** にまとめることを考えている。owner の問い:「どうしてそこまでコードが肥大化したのか。ニーズがあったわけでしょ？」。いまの形(行数・機能)の調査は済んでいる。足りないのは **なぜ増えたか** の観察。

対象: /home/fuyu/Workspace/polysearch-v1(前身の v0: /home/fuyu/Workspace/polysearch。利用者: /home/fuyu/Workspace/firedancer)

## やること

1. コードのまとまり(おおむね 150 行以上のモジュール・crate・script、または一つの機能群)を数え上げ、行数を付ける。
2. それぞれについて、足された時期と理由を、次から突き合わせて特定する。
   - repo の履歴: `git log --follow` / `jj log` のコミットメッセージ、CHANGELOG.md、changes/、HANDOFF.md、spec/sections の決定の記録(09-decisions-retired-terms.md、10-open-design-plan.md など)。
   - retrospectives(/home/fuyu/Workspace/retrospectives/records/): **rr で引く**(ccc 登録済みで、raw の grep/rg/find は hook で禁止。`rr about '<意味>'`、`rr text '<語>'`、`rr regex` を使う。rr about は 5 秒を超えることがあるので run_in_background を使う)。特に 20261012_polysearch-v1-coordinator.md、20261015_polysearch-issue-structure-retro.md、20261016_polysearch-issue-structure-retro.md、20261016_polysearch-v1-frustration-review.md、20261016_polysearch-v1-purge-decision.md、20261016_polysearch-v1-responsibility-split.md と、firedancer の記録で polysearch を扱うもの。どの事故・owner の指示・不満がその仕組みを生んだかを拾う。
   - firedancer からの実際の呼び出し(launcher/ の v1_record.ts、lineage_gate.ts、repository.test.ts、row_capture.ts、packages/ModelRegistry.jl/scripts/generate_editions_catalog.ts など)。firedancer も ccc 登録済みなので rr を使う。
3. 各まとまりのニーズを次の 4 つに分類し、根拠を書く。
   - D: 領域に固有のニーズ(dx でも持ち主が必要)
   - T: 既存の道具(git/jj/LFS、agx、rr/ccc、Claude Code の harness、OS)がすでに満たせる、または満たすべきもの
   - S: 前の設計判断が招いたもの。その元の判断も書く
   - X: 消費者がいない推測、または既に要らなくなったもの
4. 同じ形で繰り返し起きた事故やニーズを「パターン」として挙げる。
5. そのニーズを Unix 哲学(1 つのことをする小さな filter、テキストの入出力、既存の道具への leverage、捕らわれない interface、90% 解)で満たすなら、どの道具に分かれ、何が残差になるかを書く。

必ず扱うもの: v0 から v1 への作り直しの理由、leaderboard・arena・candidate・compare crate、read graph と §4 の status 導出(証明依存グラフ、予測の事前登録)、run の journal/recovery/process identity、store の lock/staging/canonical/trust、gc、10-16〜17 の purge(約 -4,600 行)の判断と、firedancer にまだ残る leaderboard の呼び出し(launcher/repository.test.ts:146 など)。

## 返却

notes/genealogy/polysearch-v1.md に、日本語で次を書く。
- 系譜表: まとまり | 行数 | 足された時期 | きっかけ(事故・指示・ニーズ) | 根拠 | 分類 D/T/S/X
- パターン(繰り返し起きた肥大化の形)
- Unix 哲学で分けた場合の所見と残差
- 確かめた事実と推測を分ける。推測には「推測」と書く。
