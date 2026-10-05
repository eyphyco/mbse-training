import type { DiagramType, Model } from '../diagram/model';
import type { IssueKind } from '../diagram/rules';

/**
 * 問題（DESIGN.md §8.2）。今ある型は 4 つ。
 * build_fragment（パレット）・trace_match・param_eval は DESIGN.md §13 の手順 10 以降で足す。
 */
export type ProblemType = 'read_diagram' | 'choose_construct' | 'spot_error' | 'written';

export interface Choice {
  id: string;
  text_md: string;
  /** 選択肢そのものが図のとき（「どの図が正しいか」） */
  model?: Model;
}

export interface SpotError {
  /** 指す場所（要素・関係・ポートの id、ヘッダは 'frame'） */
  at: string;
  /** 規則の名前。validate が規則で実際に検出できるかを確かめる */
  kind: IssueKind;
  /** この問題の文脈での説明 */
  why: string;
}

export interface Problem {
  id: string;
  type: ProblemType;
  /** 出題範囲の項目（1 つ以上） */
  items: string[];
  level: 1 | 2 | 3;
  diagram?: DiagramType;
  title: string;
  prompt_md: string;
  model?: Model;
  /** read_diagram / choose_construct */
  choices?: Choice[];
  /** 正解の選択肢 id。2 つ以上なら「すべて選ぶ」問題になる */
  answer?: string[];
  /** spot_error。空にはしない（「誤りは無い」問題は read_diagram で作る） */
  errors?: SpotError[];
  /** written の模範解答 */
  model_answer_md?: string;
  hints_md?: string[];
  explanation_md: string;
  tags?: string[];
}

/** 教材の節 */
export interface LessonSection {
  id: string;
  title: string;
  /** この節が扱う出題範囲の項目 */
  items: string[];
  body_md: string;
  /** 本文の後に描く図（記法見本の id） */
  figures?: string[];
  /** この節で初めて出る語（用語集の素。DESIGN.md §7.2） */
  terms?: { term: string; reading?: string; def: string }[];
  /** この節を読んだうえで解く問題 */
  problems: string[];
}

export interface Lesson {
  id: string;
  /** 章番号（0 = 地図） */
  no: number;
  title: string;
  /** 章の狙いを 1 行で */
  lead: string;
  /** 図種のアイコン */
  diagram?: DiagramType | 'map';
  /**
   * この章の項目の問題が揃っているか。true の章は coverage が穴を許さない。
   * まだ図が描けない章（ibd・act など）は false のまま置く。
   */
  problemsReady: boolean;
  sections: LessonSection[];
}
