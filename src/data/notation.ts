import type { Model } from '../diagram/model';
import bdd from './notation/bdd.json';

/**
 * 記法見本。項目ごとの「図」タブ（DESIGN.md §4.9）に出す見本の素。
 * 問題ではないので coverage の数には入れない。validate は問題と同じく「図にできるか」を見る。
 */
export interface NotationSample {
  id: string;
  title: string;
  /** 出題範囲の項目 */
  items: string[];
  note_md: string;
  model: Model;
}

export const NOTATION: NotationSample[] = bdd as NotationSample[];
