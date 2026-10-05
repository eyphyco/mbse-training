# このリポジトリで作業するときに

**OCSMP Model Builder – Fundamental の取得を目的にした、SysML v1.2 のハンズオン教材。**
ブラウザだけで完結し、サーバも認証も無い（GitHub Pages に置く）。

## 読む順

1. [DESIGN.md](DESIGN.md) — 骨格。目的・設計思想・画面・技術・作る順番
2. [EXAM.md](EXAM.md) — 資格対策の仕掛け（出題範囲・間隔反復・模擬試験）
3. [CAPSTONE.md](CAPSTONE.md) — 通し課題 `KS-1`。**範囲を一周した後の仕上げ**（背骨ではない）

`DESIGN.v1-practice.md.bak` は実務向けだった初版。**参照しない**（目的が変わる前の設計）。

## 決着済み。蒸し返さないこと

議論し尽くして捨てた案がある。良かれと思って提案し直さないでほしい。

| 捨てた案 | 理由 |
| --- | --- |
| **SysML v2 を教える** | OCSMP は **SysML v1.2** が対象。公式の試験情報シートで確認済み |
| **独自のテキスト記法 / Lezer 文法 / CodeMirror** | v1.x に標準テキスト記法が無い。独自記法を教えると**試験に出ない記法を覚える時間**が発生する |
| **mermaid で図を描く** | «block» のステレオタイプ・コンパートメント・ひし形の塗り分け・ポート・多重度の位置を描けない。**描けない記法で教えると本番の図が読めない**（教材本文の概念図に使うのは可） |
| **図のドラッグ編集** | 本番でも図は描かない。構造化パレットで足りる |
| **通し課題を背骨にする** | 試験には 1 問も出ない。範囲を一周した後の仕上げに回した |
| **学習ヒートマップ** | sql-training で一度入れて外した（日ごとの濃淡は「次に何をやるか」の判断に使えない） |

**図のレンダラが製品の心臓。** 試験に出るのは図そのものなので、SysML v1.2 の記法への忠実さが価値になる。
初版には「レンダラの出来は採点に影響しない」と書いてあるが、**それは逆**（DESIGN.md §1.2）。

## 書きかたの約束（sql-training から引き継ぐ）

- **「なぜそうしたか」をコメントに残す。** 何をしているかはコードを読めば分かる。
  やめた案・踏んだ罠・測った値を書く。日本語で書く
- **配色・角丸・影・文字サイズは `src/index.css` の変数 1 か所**。直値を散らさない
- **動きの時間とイージングは `src/components/motion.ts` 1 か所**
- **判断のための数は推測せず測る。** コントラストは実描画のピクセルから、
  学習計画は `scripts/plan.mjs` で回して出す
- 色は必ず二重符号化（色 + 常にテキストラベル）。読み上げ用の控えを置く

## 検査（5 段。上ほど速く、下ほど本物に近い）

```bash
npm run test      # 純粋なロジック（照合・定着度・次回出題日・テーマ）
npm run coverage  # 出題範囲に穴が無いか。問題が 3 問未満の項目で落ちる
npm run validate  # 問題データ。モデルが図にできるか・誤りが規則で検出できるか
npm run smoke     # ブラウザでの通し操作（要 preview）
npm run contrast  # 配色のコントラスト比を実描画のピクセルから測る（要 preview）
```

`coverage` がこの教材の要。**網羅は「気をつける」では達成できない**ので、
穴があると CI が落ちる形にしてある。まだ 1 問も無い間だけ素通りする。

## この環境の罠

**Playwright が既定では起動しない**（共有ライブラリを欠いている）。`sudo` は通らない。
`smoke` と `contrast` を流すには先にこれを実行する。

```bash
cd <scratchpad>/libs
apt-get download libnspr4 libnss3 libasound2t64     # sudo 不要
for d in *.deb; do dpkg -x "$d" root; done
LD_LIBRARY_PATH="$PWD/root/usr/lib/x86_64-linux-gnu" node scripts/smoke.mjs
```

`ldd <bin> | grep 'not found'` で残りを確認する。**存在しないパスに ldd を掛けると
空になり「依存は満たされている」と誤読する**ので、パスを間違えないこと。

PDF を読む必要が出たら `poppler-utils` も同じ手で入る（依存は
`libpoppler156 libjpeg-turbo8 libopenjp2-7 libtiff6 liblerc4 libdeflate0 libjbig0 libwebp7 libgpgmepp7 libgpgme45 libassuan9 libgpg-error0`）。
ヘッドレスのフォントに CJK が無いので、スクリーンショットの日本語は豆腐になる。

## いま どこまで

`npm run dev` でホームが開き、出題範囲 65 項目が読める。
手順 1（`syllabus.json` と `coverage`）と手順 2 の bdd（`src/diagram/`）は完了している。
bdd の見本は `#/notation`（ナビには出していない）。
**次は DESIGN.md §13 の手順 3（`read_diagram` と `spot_error` の採点 + 誤り解説）から。**

図のレンダラの作り:

- `model.ts`（型と「図にできるか」の検査）→ `bdd.ts`（ELK で並べて座標にする）→ `Diagram.tsx`（描くだけ）
- 座標まではすべて Node で回る。`validate` は**本物のレイアウト**を走らせる（.ts を直接 import）
- 文字幅はブラウザでは canvas で実測、Node では `estimateWidth` の推定。`smoke` が実描画ではみ出しを測る
- 図の色は白黒（本番の図が白黒）。4 色の色相は未決のまま
