# MBSE Training

**OCSMP Model Builder – Fundamental** の取得を目的にした、SysML **v1.2** のハンズオン教材。
図を読み・誤りを見つけ・組み立てる練習を、**出題範囲を分母にして、忘れた頃に出し直す**。

ブラウザだけで完結する。サーバも認証も不要で、静的ホスティングにそのまま置ける。

## クイックスタート

```bash
npm install
npm run dev        # http://localhost:5173
```

## 目標

| | Model User | Model Builder – Fundamental |
| --- | --- | --- |
| 標準 | SysML v1.2 | SysML v1.2 |
| 問題数 / 時間 | 90 問 / 120 分（日本語） | 90 問 / 135 分（日本語） |
| 合格 | 56 / 90（62%） | 60 / 90（67%） |
| 前提 | なし | **Model User の合格** |
| 形式 | 多肢選択（テキストと画像） | 多肢選択（テキストと画像） |

出典は OMG の試験情報シート（`src/data/syllabus.json` の `source`）。
**出題範囲 65 項目**（Model User 44 / Model Builder Fundamental 21）を同じファイルに写してある。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `dev` / `build` / `preview` | 開発サーバ / 型チェック付きビルド / ビルド結果の配信 |
| `test` | 単体テスト（vitest） |
| **`coverage`** | **出題範囲に穴が無いか**。問題が 3 問未満の項目があると落ちる |
| `validate` | 問題データの検証 |
| `plan` | 学習計画が試験日に間に合うかを回して確かめる |
| `smoke` / `contrast` | ブラウザでの通し操作 / 配色のコントラスト比 |
| `lint` / `format` | oxlint / Prettier |

```bash
npm run plan 65 365    # 項目数 65・試験日まで 365 日
```

## 設計

| 文書 | 中身 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 骨格。目的・設計思想・画面・技術・作る順番 |
| [EXAM.md](EXAM.md) | 出題範囲・間隔反復・模擬試験 |
| [CAPSTONE.md](CAPSTONE.md) | 通し課題 `KS-1`（範囲を一周した後の仕上げ） |
| [CLAUDE.md](CLAUDE.md) | 作業するときの約束と、この環境の罠 |

## いま どこまで

ホームが開き、出題範囲が読める。ブロック定義図のレンダラが入り、記法見本（`#/notation`）で見られる。
次は **`read_diagram` と `spot_error` の採点**（DESIGN.md §13 の手順 3）。
