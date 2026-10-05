/** 指した場所の状態。採点前は picked、採点後は hit / miss / wrong */
export type PickMark = 'picked' | 'hit' | 'miss' | 'wrong';

/** 札の文字。色だけに頼らない（二重符号化） */
export const MARK_LABEL: Record<PickMark, string> = {
  picked: '指摘',
  hit: '正解',
  miss: '見落とし',
  wrong: '誤りではない',
};
