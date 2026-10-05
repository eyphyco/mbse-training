import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Button,
  Card,
  CountPill,
  EmptySlot,
  Meter,
  SectionTitle,
  Tag,
  Tile,
} from '../components/ui';
import type { TileTone } from '../components/ui';
import { IconChevronRight, IconSparkle } from '../components/icons';
import { LIFT, RISE, STAGGER } from '../components/motion';
import { LANE_INFO } from '../components/lanes';
import {
  ASKABLE,
  ITEM_ORDER,
  PROBLEMS_BY_ITEM,
  PROBLEM_BY_ID,
  SECTION_BY_ITEM,
  itemName,
} from '../data/content';
import { ALL_ITEMS, SYLLABUS } from '../data/syllabus';
import type { Problem } from '../data/types';
import { useProgress } from '../storage/progressContext';
import { laneOf, planStatus, todayPlan } from '../storage/progress';
import { MATURE, daysBetween, dueLabel } from '../storage/srs';
import { relativeLabel } from '../components/toast';
import { useNow } from '../components/useNow';

/** 定着度に合った Lv の問題を 1 つ選ぶ。同じ Lv なら、最後に解いたのが古いもの */
function pickProblem(
  itemId: string,
  level: number,
  solvedOn: (id: string) => string,
): Problem | undefined {
  const ps = PROBLEMS_BY_ITEM.get(itemId) ?? [];
  const want = Math.min(3, 1 + Math.floor(level / 2));
  const same = ps.filter((p) => p.level === want);
  return [...(same.length > 0 ? same : ps)].sort((a, b) =>
    solvedOn(a.id) < solvedOn(b.id) ? -1 : 1,
  )[0];
}

/*
  ホーム。主役は「今日やる分」（DESIGN.md §5・EXAM.md §4）。
  毎日開く理由がこれ以外に無いので、一番上に一番大きく置く。
*/
export default function Home() {
  const { data, today } = useProgress();
  const navigate = useNavigate();
  const now = useNow();
  const plan = todayPlan(data, today, ITEM_ORDER, ASKABLE);
  const status = planStatus(
    data,
    today,
    ALL_ITEMS.map((i) => i.id),
  );
  const solvedOn = (id: string) => data.problems[id]?.lastOn ?? '';

  // 今日解く問題の列。新しい項目は導入として Lv1〜3 を全部、復習は 1 問ずつ（EXAM.md §2.3 の想定）
  const rows: { itemId: string; kind: 'overdue' | 'due' | 'fresh'; problems: Problem[] }[] = [
    ...plan.overdue.map((id) => ({
      itemId: id,
      kind: 'overdue' as const,
      problems: [pickProblem(id, data.items[id].level, solvedOn)!],
    })),
    ...plan.due.map((id) => ({
      itemId: id,
      kind: 'due' as const,
      problems: [pickProblem(id, data.items[id].level, solvedOn)!],
    })),
    ...(plan.fresh
      ? [
          {
            itemId: plan.fresh,
            kind: 'fresh' as const,
            problems: PROBLEMS_BY_ITEM.get(plan.fresh) ?? [],
          },
        ]
      : []),
  ].filter((r) => r.problems.length > 0 && r.problems[0]);
  const queue = rows.flatMap((r) => r.problems.map((p) => p.id));
  const start = () => navigate(`/problems/${queue[0]}?q=${queue.join(',')}`);

  const started = ALL_ITEMS.filter((i) => data.items[i.id] || data.read[i.id]).length;
  const mature = ALL_ITEMS.filter((i) => (data.items[i.id]?.level ?? 0) >= MATURE).length;

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="shown"
      className="grid gap-4 xl:grid-cols-[1.4fr_1fr] xl:items-start"
    >
      <div className="space-y-4">
        <motion.div variants={RISE}>
          <Card className="p-5 sm:p-6" testId="today">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-display font-bold tracking-tight text-fg">今日やる分</h1>
              <CountPill>{queue.length} 問</CountPill>
              {plan.overdue.length > 0 && (
                <Tag tone="danger">期限切れ {plan.overdue.length} 項目</Tag>
              )}
              <span className="ml-auto text-small text-muted">{today}</span>
            </div>

            {rows.length === 0 ? (
              // 0 問の日をごまかさない（EXAM.md §4）
              <div className="mt-4 space-y-3">
                <EmptySlot>
                  <strong className="text-fg">今日やる分はありません。</strong>
                  {plan.nextOn
                    ? ` 次に出るのは ${dueLabel(plan.nextOn, today)}（${plan.nextOn}）。`
                    : ''}
                  0
                  問の日があるのは正常です。間隔を空けて出し直すほうが定着するので、ここで無理に解かなくてよい。
                </EmptySlot>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => navigate('/exam')}>模擬試験を受ける</Button>
                  <Button variant="ghost" onClick={() => navigate('/learn')}>
                    教材を先に読む
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {rows.map((r) => {
                    const st = data.items[r.itemId];
                    const lane = laneOf(data, r.itemId);
                    const sec = SECTION_BY_ITEM.get(r.itemId);
                    return (
                      <motion.li key={r.itemId} whileHover={LIFT}>
                        <Link
                          to={`/problems/${r.problems[0].id}?q=${queue.join(',')}`}
                          className="panel-flat flex items-center gap-3 rounded-md border border-edge bg-raised p-3 hover:border-accent-line"
                        >
                          <Tile
                            kind={sec?.lesson.diagram ?? 'map'}
                            tone={LANE_INFO[lane].tile as TileTone}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-small font-bold text-fg">
                              {itemName(r.itemId)}
                            </span>
                            <span className="mt-0.5 block text-tiny text-muted">
                              {r.kind === 'fresh'
                                ? `新しく始める ・ Lv1〜3 を ${r.problems.length} 問`
                                : r.kind === 'overdue'
                                  ? `${daysBetween(st.dueOn, today)} 日遅れ ・ 定着 ${st.level}/5 ・ 1 問`
                                  : `今日が期限 ・ 定着 ${st.level}/5 ・ 1 問`}
                            </span>
                          </span>
                          <Tag
                            tone={
                              r.kind === 'overdue'
                                ? 'danger'
                                : r.kind === 'fresh'
                                  ? 'purple'
                                  : 'accent'
                            }
                          >
                            {r.kind === 'overdue'
                              ? '期限切れ'
                              : r.kind === 'fresh'
                                ? '新規'
                                : '今日'}
                          </Tag>
                          <IconChevronRight size={14} className="text-subtle" />
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="primary" size="lg" onClick={start} data-testid="start-today">
                    <IconSparkle size={16} /> 今日の分を始める（{queue.length} 問）
                  </Button>
                  <span className="text-tiny text-muted">
                    1 問 2〜3 分として約 {Math.max(1, Math.round(queue.length * 2.5))} 分
                  </span>
                </div>
              </>
            )}
          </Card>
        </motion.div>

        <motion.div variants={RISE}>
          <Card className="p-5">
            <SectionTitle sub="出題範囲を分母にする">網羅</SectionTitle>
            {/* 分母を必ず出す（DESIGN.md §4.6） */}
            <p className="tnum text-body text-fg" data-testid="coverage-summary">
              出題範囲 <strong>{ALL_ITEMS.length}</strong> 項目中 <strong>{started}</strong>{' '}
              項目に着手 / <strong>{mature}</strong> 項目が定着
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {SYLLABUS.exams.map((exam) => (
                <div key={exam.id}>
                  <p className="mb-2 text-tiny font-semibold text-muted">{exam.name}</p>
                  <ul className="space-y-2.5">
                    {exam.areas.map((area, k) => {
                      const ids = area.groups.flatMap((g) => g.items.map((i) => i.id));
                      const on = ids.filter((id) => data.items[id] || data.read[id]).length;
                      return (
                        <li key={area.id}>
                          <div className="mb-1 flex items-baseline gap-2 text-small">
                            <span className="tnum w-9 shrink-0 text-right font-bold text-accent">
                              {Math.round(area.weight * 100)}%
                            </span>
                            <span className="min-w-0 flex-1 truncate text-fg">{area.name}</span>
                            <span className="tnum shrink-0 text-tiny text-muted">
                              {on} / {ids.length}
                            </span>
                          </div>
                          <Meter value={on} total={ids.length} delay={k * 0.05} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="space-y-4">
        <motion.div variants={RISE}>
          <Card className="p-5" testId="plan">
            <SectionTitle sub="試験日から逆算する">間に合うか</SectionTitle>
            {!status ? (
              <EmptySlot>
                試験日がまだ入っていません。
                <Link to="/settings" className="font-semibold text-accent underline">
                  進捗
                </Link>
                で試験日を入れると、新しい項目をいつまでに始めれば定着が間に合うかを出します。
              </EmptySlot>
            ) : (
              // 違反ではなく「このままだと何が起きないか」を言う（EXAM.md §3）
              <div className="space-y-2 text-small leading-relaxed text-fg">
                <p>
                  試験日まで <strong className="tnum">{status.daysLeft} 日</strong>
                  。新しい項目の導入期限は
                  <strong className="tnum"> 残り {Math.max(0, status.deadlineIn)} 日</strong>
                  （9 割の項目が定着するのに {data.settings.mode === 'standard' ? 140 : 70}{' '}
                  日かかるため）。
                </p>
                <p>
                  未着手が <strong className="tnum">{status.untouched} 項目</strong>
                  あり、今のペース（{data.settings.paceDays} 日に 1 項目）では
                  <strong className="tnum"> {status.daysNeeded} 日</strong>かかります。
                </p>
                {status.short === 0 ? (
                  <p className="font-bold text-success">間に合います。</p>
                ) : (
                  <p className="rounded-sm bg-danger-soft px-3 py-2 font-semibold text-danger">
                    {status.short} 項目が定着に届きません。間隔を詰める（1-2-4-8-16）か、導入を 1
                    日に 1 項目へ上げてください。
                  </p>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div variants={RISE}>
          <Card className="p-5">
            <SectionTitle count={data.history.length}>学習の記録</SectionTitle>
            {data.history.length === 0 ? (
              <EmptySlot>
                まだ記録はありません。教材の章 0「地図」から始めるのがおすすめです。
              </EmptySlot>
            ) : (
              <ul className="divide-y divide-line">
                {data.history.slice(0, 6).map((h, i) => (
                  <li key={i} className="flex items-center gap-2 py-2 text-small">
                    <span
                      className={`w-12 shrink-0 font-bold ${h.correct ? 'text-success' : 'text-danger'}`}
                    >
                      {h.correct ? '正解' : '不正解'}
                    </span>
                    <Link
                      to={`/problems/${h.problemId}`}
                      className="min-w-0 flex-1 truncate text-fg hover:text-accent"
                    >
                      {PROBLEM_BY_ID.get(h.problemId)?.title ?? h.problemId}
                    </Link>
                    <span className="shrink-0 text-micro text-subtle">
                      {relativeLabel(Date.parse(h.at), now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>

        <motion.div variants={RISE}>
          <Card className="p-5">
            <SectionTitle>続きから</SectionTitle>
            <div className="grid gap-2">
              <Link
                to="/learn/map"
                className="panel-flat flex items-center gap-3 rounded-md border border-edge bg-raised p-3 hover:border-accent-line"
              >
                <Tile kind="map" tone="purple" size={36} />
                <span className="flex-1 text-small font-semibold text-fg">
                  章 0「地図」— 9 つの図と試験の構造
                </span>
              </Link>
              <Link
                to="/notation"
                className="panel-flat flex items-center gap-3 rounded-md border border-edge bg-raised p-3 hover:border-accent-line"
              >
                <Tile kind="bdd" tone="blue" size={36} />
                <span className="flex-1 text-small font-semibold text-fg">
                  図の記法見本（ブロック定義図）
                </span>
              </Link>
              <Link
                to="/board"
                className="panel-flat flex items-center gap-3 rounded-md border border-edge bg-raised p-3 hover:border-accent-line"
              >
                <Tile kind="map" tone="orange" size={36} />
                <span className="flex-1 text-small font-semibold text-fg">
                  出題範囲ボード — 落とした項目を空にする
                </span>
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
