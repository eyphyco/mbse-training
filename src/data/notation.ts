import type { DiagramType, Model } from '../diagram/model';
import bdd from './notation/bdd.json';
import ibd from './notation/ibd.json';
import par from './notation/par.json';
import pkg from './notation/pkg.json';
import req from './notation/req.json';
import uc from './notation/uc.json';
import act from './notation/act.json';
import stm from './notation/stm.json';
import sd from './notation/sd.json';
import common from './notation/common.json';

/**
 * 記法見本。項目ごとの「図」タブ（DESIGN.md §4.9）と教材の節の図に出す見本の素。
 * 問題ではないので coverage の数には入れない。validate は問題と同じく「図にできるか」と
 * 「誤りが無いか」を見る（見本に誤りがあると、誤りを正しい形として覚えさせてしまう）。
 *
 * 並びは教材の章の順（bdd → ibd → par → pkg → req → uc → act → stm → sd → 割り当て）。
 */
export interface NotationSample {
  id: string;
  title: string;
  /** 出題範囲の項目 */
  items: string[];
  note_md: string;
  model: Model;
}

export const NOTATION: NotationSample[] = [
  bdd,
  ibd,
  par,
  pkg,
  req,
  uc,
  act,
  stm,
  sd,
  common,
].flat() as NotationSample[];

/** 図種ごとの見出し（記法見本の画面の絞り込み） */
export const DIAGRAM_NAME: Record<DiagramType, string> = {
  bdd: 'ブロック定義図',
  ibd: '内部ブロック図',
  par: 'パラメトリック図',
  pkg: 'パッケージ図',
  req: '要求図',
  uc: 'ユースケース図',
  act: 'アクティビティ図',
  stm: '状態機械図',
  sd: 'シーケンス図',
};
