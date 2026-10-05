/**
 * 図の寸法と文字の大きさ。
 *
 * 画面の文字サイズは index.css の変数 1 か所に集めてあるが、図の分だけはここに置く。
 * レイアウト（箱の幅・高さ）を決める時点で数が要り、それを Node（validate・test）でも
 * 同じに出したいため。CSS からは読めない。色だけは index.css の `.dg-*` が持つ。
 */

export const FONT = {
  /** 図枠のヘッダ */
  header: 12,
  /** «block» など */
  stereotype: 11,
  /** 要素名（太字） */
  name: 12.5,
  /** `{unit = kg}` */
  tag: 11,
  /** コンパートメントの見出し（斜体） */
  compTitle: 10.5,
  /** コンパートメントの行 */
  line: 11.5,
  /** 多重度・ロール名・«satisfy» */
  edge: 11,
} as const;

/** 行の高さ。文字の大きさ × 約 1.3 */
export const LINE_H = {
  stereotype: 14,
  name: 17,
  tag: 14,
  compTitle: 14,
  line: 15,
  edge: 14,
} as const;

export const BOX = {
  /** 箱の左右の余白 */
  padX: 12,
  /** 名前区画の上下の余白 */
  headPadY: 6,
  /** コンパートメントの上下の余白 */
  compPadY: 4,
  /** 箱の最小幅。名前が短くても «block» の札として読める幅 */
  minW: 96,
} as const;

/** ポートの四角の一辺 */
export const PORT = 12;

export const FRAME = {
  /** 図枠と中身の間 */
  pad: 16,
  /** ヘッダの札の高さ */
  tabH: 22,
  /** 札の右下を斜めに切る量 */
  tabCut: 8,
  /** 札の文字の左右 */
  tabPadX: 8,
} as const;

/** 関係の端の記号（線を縮める量でもある） */
export const MARKER = {
  diamondLen: 16,
  diamondHalf: 6,
  triangleLen: 13,
  triangleHalf: 8,
  arrowLen: 10,
  arrowHalf: 5,
} as const;

/* ------------------------------------------------------------------ */

/** 文字の太さ・形 */
export interface TextStyle {
  size: number;
  bold?: boolean;
  italic?: boolean;
}

/** 文字列の幅を返す関数。ブラウザでは実測、Node では推定を渡す */
export type Measure = (text: string, style: TextStyle) => number;

/**
 * 文字幅の推定（Node 用）。**ブラウザでは使わない**（canvas で実測する。Diagram.tsx）。
 *
 * validate と test は Node で走るのでフォントを測れない。そこで文字の種類ごとに
 * em 幅を当てる。値は Arial / Helvetica 系の字幅表から丸めたもので、
 * 外れても**広い側に**外すようにしてある（狭く見積もると文字が箱からはみ出す）。
 */
export function estimateWidth(text: string, { size, bold }: TextStyle): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    // 仮名・漢字・全角記号。U+2000 台の約物（– … など）は半角幅なので除く
    if (c >= 0x1100 && !(c >= 0x2000 && c <= 0x206f)) em += 1;
    else if (" ijlI|!.,:;'`".includes(ch)) em += 0.28;
    else if ('frt()[]{}'.includes(ch)) em += 0.36;
    else if ('mwMW'.includes(ch)) em += 0.9;
    else if (ch >= 'A' && ch <= 'Z') em += 0.7;
    else if (ch >= '0' && ch <= '9') em += 0.57;
    else em += 0.58;
  }
  return em * size * (bold ? 1.08 : 1);
}
