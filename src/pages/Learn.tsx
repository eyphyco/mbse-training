import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Card, Meter, Tag, Tile } from '../components/ui';
import { LIFT, RISE, STAGGER } from '../components/motion';
import { LESSONS, problemsOfSection } from '../data/content';
import { KIND_TONE } from '../components/tones';
import { sectionRead } from '../storage/progress';
import { useProgress } from '../storage/progressContext';

/**
 * 教材の一覧。章 = 出題範囲の領域（DESIGN.md §5）。章 0 は「地図」（§7.1）。
 */
export default function Learn() {
  const { data } = useProgress();
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h1 className="text-display font-bold tracking-tight text-fg">教材</h1>
        <p className="mt-2 max-w-3xl text-small leading-relaxed text-muted">
          SysML v1.2 の出題範囲 65 項目を 12 章で一周する。まず
          <strong className="text-fg">章 0「地図」</strong>
          で全体を見てから、章 1 のブロック定義図に進む。各節の最後に、その節の項目の問題がある。
        </p>
      </Card>
      <motion.ul
        variants={STAGGER}
        initial="hidden"
        animate="shown"
        className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]"
      >
        {LESSONS.map((l) => {
          // 節で数える（項目を持たない節もあるので、項目で数えると読み終えても満たない章が出る）
          const read = l.sections.filter((s) => sectionRead(data, s)).length;
          const nProblems = l.sections.reduce((n, s) => n + problemsOfSection(s).length, 0);
          return (
            <motion.li key={l.id} variants={RISE} whileHover={LIFT}>
              <Link to={`/learn/${l.id}`} className="block h-full" data-testid={`chapter-${l.id}`}>
                <Card className="flex h-full flex-col p-4 hover:border-accent-line">
                  <div className="flex items-start gap-3">
                    <Tile
                      kind={l.diagram ?? 'map'}
                      tone={l.no === 0 ? 'purple' : KIND_TONE[l.diagram ?? 'map']}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-tiny font-semibold text-accent">第 {l.no} 章</p>
                      <h2 className="text-lead font-bold text-fg">{l.title}</h2>
                    </div>
                    {nProblems > 0 && <Tag tone="success">問題 {nProblems}</Tag>}
                  </div>
                  <p className="mt-3 flex-1 text-small leading-relaxed text-muted">{l.lead}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <Meter value={read} total={l.sections.length} />
                    <span className="tnum shrink-0 text-tiny text-muted">
                      読んだ {read} / {l.sections.length} 節
                    </span>
                  </div>
                </Card>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}
