import { LANE_INFO, LANE_ORDER } from './lanes';
import { IconInfo } from './icons';

/**
 * 凡例。画面の下に畳める形で常設する（DESIGN.md §4.3）。
 * 語彙は 1 回説明する形だと必ず失敗するので、いつでも引けるようにしておく。
 */
const RELATIONS: [string, string, string][] = [
  ['黒ひし形', '持ち物（コンポジション）', '全体の側に付く。全体が消えると部分も消える'],
  ['白ひし形', '共有してよい（共有集約）', '黒との取り違えが頻出'],
  ['白三角', '〜の一種（汎化）', '一般の側に付く'],
  ['«satisfy»', 'この設計が応える', '設計 → 要求'],
  ['«deriveReqt»', 'ここから導いた', '導いた要求 → 元の要求'],
  ['«refine»', '同じことを詳しく言った', '条件を足したなら deriveReqt'],
  ['«verify»', 'これで確かめる', 'テストケース → 要求'],
  ['«trace»', '関係はあるが弱い', '迷ったときの逃げ'],
  ['«copy»', '同じ文を使い回す', '写し → 元'],
  ['«allocate»', 'この要素に担当させる', 'satisfy との違いは「応える」か「担当させる」か'],
];

export default function Legend() {
  return (
    <section
      aria-labelledby="legend-title"
      className="panel rounded-xl border border-edge bg-surface p-4 sm:p-5"
      data-testid="legend"
    >
      <h2 id="legend-title" className="mb-3 flex items-center gap-2 text-body font-bold text-fg">
        <IconInfo size={16} className="text-accent" /> 凡例
      </h2>
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="mb-2 text-tiny font-semibold text-muted">
            定着度・どこまで進んでいるか（レーン）
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {LANE_ORDER.map((l) => (
              <li key={l} className="flex items-center gap-2 text-small">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: LANE_INFO[l].color }}
                />
                <span className="font-semibold text-fg">{LANE_INFO[l].name}</span>
                <span className="truncate text-muted">{LANE_INFO[l].sub}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-tiny font-semibold text-muted">
            SysML の記号と関係（試験に直接出る）
          </p>
          <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
            {RELATIONS.map(([name, sub, note]) => (
              <li key={name} className="text-small leading-snug">
                <span className="font-semibold text-fg">{name}</span>{' '}
                <span className="text-muted">{sub}</span>
                <span className="block text-tiny text-subtle">{note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
