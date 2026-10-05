#!/usr/bin/env node
/**
 * 学習計画が試験日に間に合うかを、間隔反復を実際に回して確かめる。
 *
 *   node scripts/plan.mjs [項目数] [試験日までの日数]
 *   node scripts/plan.mjs 40 365
 *
 * 「1 項目が定着するまで最短 62 日」は間隔の合計だが、落とすと level 0 に
 * 戻るので実際の裾はもっと長い。平均で計画を立てると、落ちやすい項目が
 * 間に合わない。だから机上の足し算ではなく回して確かめる。
 *
 * 出題範囲の項目数が確定したら回し直す（EXAM.md §2.3 の表を更新する）。
 */

/** level 0→1, 1→2, … 最後の値は 5 以降に使い回す */
export const INTERVAL = {
  標準: [1, 3, 7, 16, 35, 90],
  詰め: [1, 2, 4, 8, 16, 40],
};

/** 定着とみなす level */
const MATURE = 5;
/** 導入時に解く問題数 / 再出題 1 回あたりの問題数 */
const NEW_PROBLEMS = 3;
const REVIEW_PROBLEMS = 1;

/**
 * 1 本回す。乱数は固定種（同じ条件なら同じ数が出る＝比較できる）。
 */
export function simulate({ gap, every, items, days, pass = 0.85, seed = 7 }) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const gapOf = (lv) => gap[Math.min(lv, gap.length - 1)];

  const state = [];
  const load = new Array(days + 1).fill(0);
  let introduced = 0;

  for (let d = 0; d <= days; d += 1) {
    if (introduced < items && d % every === 0) {
      state.push({ level: 0, due: d + gap[0], matured: null, born: d });
      load[d] += NEW_PROBLEMS;
      introduced += 1;
    }
    for (const it of state) {
      if (it.due !== d) continue;
      load[d] += REVIEW_PROBLEMS;
      // 間違えたら 0 に戻す。1 段下げでは「分かった気」のまま残る
      it.level = rnd() < pass ? it.level + 1 : 0;
      if (it.level >= MATURE && it.matured === null) it.matured = d;
      it.due = d + gapOf(it.level);
    }
  }

  const matured = state.filter((i) => i.matured !== null);
  const spans = matured.map((i) => i.matured - i.born).sort((a, b) => a - b);
  const at = (p) => spans[Math.min(spans.length - 1, Math.floor(spans.length * p))];

  return {
    items,
    allMaturedOn: matured.length === items ? Math.max(...matured.map((i) => i.matured)) : null,
    maturedCount: matured.length,
    spanMedian: at(0.5),
    span90: at(0.9),
    spanMax: spans[spans.length - 1],
    shortest: gap.slice(0, MATURE).reduce((a, b) => a + b, 0),
    lastIntroOn: (items - 1) * every,
    load,
  };
}

const slice = (load, a, b) => load.slice(a, Math.min(b, load.length));
const avg = (x) => x.reduce((p, c) => p + c, 0) / x.length;

function report(label, r, days) {
  const intro = slice(r.load, 0, Math.min(140, days));
  const zero = slice(r.load, 0, days).filter((v) => v === 0).length;
  const verdict =
    r.allMaturedOn === null
      ? `届かず（${r.maturedCount}/${r.items ?? '?'} 項目）`
      : r.allMaturedOn <= days
        ? `${r.allMaturedOn} 日目（余裕 ${days - r.allMaturedOn} 日）`
        : `${r.allMaturedOn} 日目（${r.allMaturedOn - days} 日 超過）`;
  console.log(
    `  ${label.padEnd(34)} 全定着 ${verdict.padEnd(26)} 導入期 平均 ${avg(intro).toFixed(1)} 問 / 最大 ${Math.max(...intro)} 問 / 0 問の日 ${zero} 日`,
  );
}

const items = Number(process.argv[2] ?? 40);
const days = Number(process.argv[3] ?? 365);

console.log(`出題範囲 ${items} 項目 / 試験日まで ${days} 日 / 一発正答率 85%\n`);
for (const [name, gap] of Object.entries(INTERVAL)) {
  for (const every of [1, 2, 3]) {
    const r = simulate({ gap, every, items, days });
    report(`${name}間隔 ${gap.slice(0, 5).join('-')} / ${every} 日に 1 項目`, r, days);
  }
}

const base = simulate({ gap: INTERVAL.標準, every: 2, items, days });
console.log(
  `\n1 項目が定着するまで: 中央 ${base.spanMedian} 日 / 9 割 ${base.span90} 日 / 最長 ${base.spanMax} 日（最短 ${base.shortest} 日）`,
);
/*
  導入期限は中央値では甘く、最長では厳しすぎる（最長は 1 項目の外れ値で決まる）。
  9 割が定着する日数で引いて、10 日単位に切り上げる。
*/
console.log(
  `新規項目の導入期限の目安: 試験日の ${Math.ceil(base.span90 / 10) * 10} 日前（9 割が定着する線で引く）`,
);
