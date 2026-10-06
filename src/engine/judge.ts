/**
 * 採点（DESIGN.md §9）。純粋関数。
 */
import type { Problem } from '../data/types';
import type { Model } from '../diagram/model';
import { judgeBuild } from './build';

/** 選択肢の問題。集合として一致すれば正解（順序は無視） */
export function judgeChoice(problem: Problem, picked: readonly string[]): boolean {
  const want = new Set(problem.answer ?? []);
  const got = new Set(picked);
  return want.size === got.size && [...want].every((a) => got.has(a));
}

export interface SpotResult {
  correct: boolean;
  /** 誤りを正しく指した */
  hits: string[];
  /** 指さなかった誤り */
  misses: string[];
  /** 誤りでない所を指した */
  wrongs: string[];
}

/**
 * 誤り指摘。指した場所の集合と、誤りの場所の集合を比べる（DESIGN.md §9）。
 * 1 か所に誤りが 2 つあっても、指すのは 1 回でよい（場所で数える）。
 */
export function judgeSpot(problem: Problem, picks: readonly string[]): SpotResult {
  const want = new Set((problem.errors ?? []).map((e) => e.at));
  const got = new Set(picks);
  const hits = [...got].filter((p) => want.has(p));
  const wrongs = [...got].filter((p) => !want.has(p));
  const misses = [...want].filter((w) => !got.has(w));
  return { correct: misses.length === 0 && wrongs.length === 0, hits, misses, wrongs };
}

/** 解答の中身（模擬試験で、採点を後回しにして溜めておく形） */
export interface AnswerState {
  choices: string[];
  picks: string[];
  /** written の自己採点 */
  self?: boolean;
  /** build_fragment で組んだモデル（土台 + 置いたもの） */
  built?: Model;
}

export const EMPTY_ANSWER: AnswerState = { choices: [], picks: [] };

/** どの型でも 1 つの入口で採点する */
export function grade(problem: Problem, a: AnswerState): boolean {
  switch (problem.type) {
    case 'read_diagram':
    case 'choose_construct':
      return judgeChoice(problem, a.choices);
    case 'spot_error':
      return judgeSpot(problem, a.picks).correct;
    case 'build_fragment':
      return (
        !!a.built && !!problem.answer_model && judgeBuild(problem.answer_model, a.built).correct
      );
    case 'written':
      return a.self === true;
  }
}

/** 何か答えたか（未回答のまま「答える」を押せないようにする） */
export function answered(problem: Problem, a: AnswerState): boolean {
  if (problem.type === 'spot_error') return a.picks.length > 0;
  if (problem.type === 'written') return true;
  if (problem.type === 'build_fragment')
    return (
      !!a.built && !!problem.model && JSON.stringify(a.built) !== JSON.stringify(problem.model)
    );
  return a.choices.length > 0;
}

export const TYPE_LABEL: Record<Problem['type'], string> = {
  read_diagram: '図を読む',
  spot_error: '誤りを見つける',
  choose_construct: '構成を選ぶ',
  build_fragment: '組み立てる',
  written: '記述',
};
