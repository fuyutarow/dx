+++
schema = 2
name = "dx-verdict-data"
outcome = "type の review が place = \"file:<glob>\" で置く verdict のファイルは、置き場所が .dx/ の下でも規則ではなくデータとして扱う。I-09 の規則側に数えず、--policy を付けても head の木から読む。I-06 の verdict が無いという指摘と I-09 の指摘は、次の一手を名指しする。retrospectives の歴史で判定が変わる commit を一覧にし、spec を直して、mise run check が通って返る"
writes = ["src/**", "tests/**", "README.md", "docs/spec.md"]
verify = ["mise run check"]
timeout_s = 2400
premises = ["file:docs/spec.md", "file:src/commands/check.ts", "file:src/collection.ts", "file:src/commands/review.ts"]

[proposition]
id = "DX-VERDICT-DATA"
claim = "verdict は review の出力でありデータである。I-09（規則と記録を同じ commit で変えない）から外しても、規則を緩める変更を記録の変更に紛れ込ませることはできない"
refuted_by = "verdict のファイルを I-09 から外すと、規則（dx.toml、.dx/ の型定義・rubric、inputs）を変える commit が記録と一緒に通る例が作れる（その例を返す）"
+++

**retrospectives の DevX 報告（2026-10-19）から。0.1.3 で land した書き手 3 人の 3 人ともが、同じ所で 2〜3 回ずつ land をやり直した。**

## 事実

- `dx review @-` が通ると、verdict は作業コピー（@）に書かれる。続けて `dx land @-` を流すと、`missing passing verdict bound to this record, rubric and another author` で拒まれる。この文言は、verdict が @ にあることを言わない。
- retrospectives の verdict は `.dx/verdicts/` に置かれている。そのため、verdict を記録の commit に squash すると、I-09 の `policy and records changed together` で拒まれる。この文言は、`.dx/verdicts` が規則に数えられていることを言わない。
- verdict のファイル名に含まれる `%2E` が jj の fileset の構文に当たって、`jj squash <path>` が失敗した書き手が 2 人いた。

## 決定（coordinator）

- verdict は review の出力であり、規則ではない。I-09 は「規則の変更を記録の変更に紛れ込ませない」ための性質なので、verdict を対象にする理由がない。
- type の review の `place: "file:<glob>"` に当たるファイル（verdict のファイル）は、置き場所にかかわらずデータとして扱う。
  - I-09 の規則側（dx.toml、.dx/、inputs）に数えない。
  - `--policy REV` を付けても、policy の revision ではなく head の木から読む。
  - 照合に使う glob は、規則の revision の型定義から取る（今と同じ）。
- `dx review` に commit させる案は採らない。commit は呼び出す側の仕事である（retry や rebase を呼び出す側に任せているのと同じ）。
- 診断で、次の一手を名指しする。
  - I-06 で verdict が無いとき: `dx review は verdict を作業コピーに書く。verdict を含む commit を land する（例: dx land @）` を、今の文言に添える。
  - I-09: 衝突した規則のファイルと記録のファイルを、それぞれ最大 5 件まで並べる。規則とは何か（dx.toml、.dx/ の下（verdict は除く）、[files] inputs）も 1 行で書く。

## 改めた決定（coordinator、2026-10-19。上の「決定」の 1 つ目と 2 つ目を置き換える。最新版）

- 「.dx/ の下は規則。ただし verdict は除く」という例外は作らない。1 つの階層（.dx/）に、規則とデータの 2 つの意味を持たせないためである（Unix 哲学の副原則 10。値と規則に、置き場所を 1 つずつ与える）。
- 規則のファイルの定義は、`dx.toml`、`.dx/` の下、`[files] inputs` の 1 つだけにする。I-09、policy の overlay、I-02 の「記録を生まないファイル」は、どれもこの 1 つの関数を使う（いま 3 か所にばらばらにある判定を、1 つにまとめる）。
- review の `place = "file:<glob>"` が、規則のファイルに当たる glob であれば、規則を読み込む段階で `UNDETERMINED:policy: <type>: review.place は規則のファイル（dx.toml、.dx/、inputs）の外に置く` として exit 4 にする。
- 根拠: research-record-v2 は、すでに `records/verdicts/` に置いている。retrospectives の `.dx/verdicts/` は、verdict を移すことと glob を変えることを 1 つの commit で行える（verdict は記録ではないので、I-09 に当たらない）。
- 診断の 2 つ（I-06 の次の一手、I-09 の衝突の一覧）は、そのまま行う。I-09 の一覧の「規則とは」の行から、「verdict は除く」を外す。
- push が hook に拒まれたときは、git の stderr のうち `remote:` の行をすべて stderr に出す（今は最初の 1 行だけ）。exit とコードは変えない（PUSH_REJECTED、exit 1）。
- spec の §5「書き手の普段の流れ」を直す: `dx review @-` の後は、verdict を含む @ を land する（`dx land @`）。
- spec の I-02 の行を、意味を変えずに 2 文に戻す: (a) 新しい key の finding が無い。(b) 変わった単位は finding を持たない。単位とは、記録（sha256 で判定）か、記録を生まないファイル（bytes で判定）である。経緯は §9 に移す。

## やること

1. 規則のファイルの集まり（I-09 と policy の overlay の両方）から、verdict のファイルを外す。
2. 上の 2 つの診断の文言を足す。
3. 試験:
   - 記録と、その verdict を同じ commit に入れたとき、I-09 で拒まれず exit 0 になる。
   - 記録と、.dx/ の型定義・rubric を同じ commit で変えたときは、今までどおり I-09 で拒まれる。
   - `--policy` を付けたとき、verdict は head から読まれる。
   - 2 つの診断の文言。
4. 照合（止まらない。一覧を返す）: retrospectives の歴史（これまでの shadow と同じ組）で、変える前と後の判定を比べる。判定が変わった commit を一覧にする。
5. spec の I-09、§7（review の place）、README を直す。

この issue は、alpha（0.1.3、26a72729）の上で行う。

## jj について

- 作業コピーの上に commit する（jj のロックが取れなければ、commit しないまま返す）。bookmark は動かさない。push しない。

## 返却

- 規則の変更と試験
- 照合の一覧
- `mise run check` の結果
