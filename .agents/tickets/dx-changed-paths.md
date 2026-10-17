+++
schema = 2
name = "dx-changed-paths"
outcome = "base と head の間で変わったファイル（記録に限らず、dx.toml、.dx/、[files] inputs を含む）の path を指す finding は、base に同じ key があっても new になる。壊れた規則の入力を入れた commit は exit 1 で拒まれる。retrospectives と soks の歴史で判定が変わる commit を一覧にし、spec の I-02 を直して、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/findings.ts", "file:src/commands/check.ts"]

[proposition]
id = "DX-CHANGED-PATHS"
claim = "I-02 の「新しい記録と変えた記録は潔白」を、変えたファイルすべてに広げれば、policy-rev のもとで規則の入力を壊した commit が古い finding として通る穴が閉じる"
refuted_by = "この規則にすると、壊れていない普通の commit が、retrospectives か soks の歴史で新たに拒まれる（その commit と finding を返す）"
+++

**soks が 0.1.2 で見つけた、policy-rev の穴です。**

## 事実

- policy-rev では、規則（dx.toml、`.dx/`、`[files] inputs` の中身）を 1 つの revision から読み、base にも head にも使う。
- soks では、壊れた `.leakcheck`（inputs）を finding として報告している。壊れた入力が base と head の両方に当てはめられるので、その finding は両側に出て、古い finding として扱われる。その結果、exit 0 で通る。
- I-09 があるので、`.leakcheck` を壊す commit は、inputs だけを変える commit になる。それが通った後は、記録を変えるどの commit も拒まれる。壊れたときに、通す側に倒れている。
- soks は、自分の側で、壊れた入力を throw にした（exit 4）。ただ、どの repo の check も同じ穴を抱えうる。

## 決定（coordinator）

- 「check は規則の入力が壊れていたら throw せよ」と文書に書く案は採らない。書き手が忘れれば黙って通ってしまうので、dx が穴を利用者に押しつけることになる。
- I-02 を広げる。base と head の間で変わったファイルの path（`finding.path`）を指す finding は、base に同じ key があっても `new:true` にする。記録の id で判定している今の規則（changedIds）は、そのまま残す。
- 変わったファイルとは、base と head の木で、bytes が違うか、片方にしかないファイルを言う。`--policy` を付けたときも、base と head の木を比べる（policy の revision は比べない）。

## やること

1. classify に、変わった path の集まりを渡す。`finding.path` がその集まりにあれば、`new:true` にする。
2. 試験:
   - 壊れた inputs のファイルを足すだけの commit が exit 1 になる（soks の `.leakcheck` を模したもの）。
   - 変えていないファイルの古い finding は、古いまま残る。
   - `--policy` を付けたときも、変わった path は base と head の木で決まる。
3. 照合（止まらない。一覧を返す）: retrospectives と soks の歴史（これまでの shadow と同じ組）で、変える前と後の判定を比べる。判定が変わった commit について、commit、finding、そのファイルが変わったかを一覧にする。
4. spec の I-02 の行と、README を直す。

この issue は、alpha（0.1.2、d36af1e7）の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 規則の変更と試験
- 照合の一覧（判定が変わった commit）
- `mise run check` の結果
