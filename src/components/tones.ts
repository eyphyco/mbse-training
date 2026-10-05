export type TileTone = 'blue' | 'orange' | 'purple' | 'green' | 'rose' | 'gray';

/**
 * 図種ごとのタイルの色。WHITEBOARD の札はタイルの色が中身で変わり、一覧に表情が出る。
 * レーン（状態）の区別は左の色バーと名前が持つので、タイルは図種に当てる。
 */
export const KIND_TONE: Record<string, TileTone> = {
  bdd: 'blue',
  ibd: 'purple',
  par: 'green',
  pkg: 'orange',
  req: 'rose',
  uc: 'blue',
  act: 'purple',
  stm: 'orange',
  sd: 'green',
  map: 'gray',
};
