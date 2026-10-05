import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import Diagram from '../diagram/Diagram';
import Markdown from '../components/Markdown';
import { Button, Card, CountPill, EmptySlot, Meter, Tabs, Tag, Tile } from '../components/ui';
import { IconBook, IconFilter, IconPlus, IconSparkle, IconTrash, IconX } from '../components/icons';
import { FLY, LIFT, POP } from '../components/motion';
import { LANE_INFO, LANE_ORDER } from '../components/lanes';
import { NOTATION } from '../data/notation';
import { ITEM_INDEX, SYLLABUS } from '../data/syllabus';
import { PROBLEMS_BY_ITEM, SECTION_BY_ITEM, itemName } from '../data/content';
import { KIND_TONE } from '../components/tones';
import { useProgress } from '../storage/progressContext';
import { laneOf } from '../storage/progress';
import type { Lane } from '../storage/progress';
import { MATURE, dueLabel } from '../storage/srs';
import { relativeLabel } from '../components/toast';
import { useNow } from '../components/useNow';

/*
  出題範囲ボード（DESIGN.md §4.2）。版面は WHITEBOARD をそのまま使う。
  左に選んだ項目の詳細、右にレーン。モーダルは使わない（DESIGN.md §4.9）。

  札には layoutId を付けてあるので、読んだ・解いたで状態が変わると、
  札が元のレーンから次のレーンへ飛んで移る。どこからどこへ動いたかが目で追える。
*/

const MEMO_MAX = 300;

/** 項目の図種（章の図種） */
function kindOf(itemId: string): string {
  return SECTION_BY_ITEM.get(itemId)?.lesson.diagram ?? 'map';
}

export default function Board() {
  const { data, today } = useProgress();
  const [params, setParams] = useSearchParams();
  const selected = params.get('item');
  const select = (id: string | null) => setParams(id ? { item: id } : {}, { replace: true });

  // 絞り込み（WHITEBOARD の「タグでフィルター」）
  const [filterOpen, setFilterOpen] = useState(false);
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const allAreas = SYLLABUS.exams.flatMap((e) => e.areas.map((a) => ({ exam: e, area: a })));

  const items = useMemo(
    () => [...ITEM_INDEX.values()].filter(({ area }) => areas.size === 0 || areas.has(area.id)),
    [areas],
  );
  const lanes = useMemo(() => {
    const m = new Map<Lane, string[]>(LANE_ORDER.map((l) => [l, []]));
    for (const { item } of items) m.get(laneOf(data, item.id))!.push(item.id);
    return m;
  }, [items, data]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_1fr] lg:items-start">
      {/* 詳細。何も選んでいなければ、選び方を出す（空白に意味を持たせる） */}
      <div className="lg:sticky lg:top-[88px]">
        <AnimatePresence mode="wait">
          {selected && ITEM_INDEX.has(selected) ? (
            <motion.div key={selected} {...POP}>
              <Detail itemId={selected} onClose={() => select(null)} />
            </motion.div>
          ) : (
            <motion.div key="none" {...POP}>
              <Card className="p-6">
                <h1 className="text-title font-bold text-fg">出題範囲ボード</h1>
                <p className="mt-2 text-small leading-relaxed text-muted">
                  出題範囲 {ITEM_INDEX.size}{' '}
                  項目を、定着度で並べています。札を選ぶと、ここに詳細（メモ・教材・図・問題・履歴）が出ます。
                </p>
                <p className="mt-3 text-small leading-relaxed text-fg">
                  毎日の仕事は
                  <strong className="text-[var(--c-tile-orange-fg)]">「落とした」</strong>
                  レーンを空にすること。間違えた項目はここに来て、翌日また出ます。
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-3">
        <div className="relative flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className={`relative flex h-9 items-center gap-1.5 rounded-sm border px-3 text-small font-semibold ${
              areas.size > 0
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'panel-flat border-edge bg-raised text-muted hover:text-fg'
            }`}
          >
            <IconFilter size={15} /> 領域で絞り込む
            {areas.size > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-solid text-micro font-bold text-white">
                {areas.size}
              </span>
            )}
          </button>
          {/* 分母を必ず出す（DESIGN.md §4.6） */}
          <p className="text-small text-muted" data-testid="board-summary">
            {areas.size > 0 ? `${areas.size} 件の領域で絞り込み中・` : ''}
            {items.length} / {ITEM_INDEX.size} 項目 ・ 着手{' '}
            {items.filter(({ item }) => data.items[item.id] || data.read[item.id]).length} ・ 定着{' '}
            {items.filter(({ item }) => (data.items[item.id]?.level ?? 0) >= MATURE).length}
          </p>
          <AnimatePresence>
            {filterOpen && (
              <motion.div
                {...POP}
                className="panel-pop absolute top-11 left-0 z-20 w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-edge p-4"
              >
                <div className="mb-2 flex items-center">
                  <p className="text-small font-bold text-fg">
                    領域でフィルター{' '}
                    <span className="font-normal text-muted">（{areas.size} 件の条件）</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setAreas(new Set())}
                    className="ml-auto rounded-xs bg-accent-soft px-2 py-1 text-tiny font-semibold text-accent"
                  >
                    すべてクリア
                  </button>
                </div>
                {SYLLABUS.exams.map((e) => (
                  <div key={e.id} className="mt-2">
                    <p className="mb-1 text-tiny font-semibold text-subtle">{e.name}</p>
                    {allAreas
                      .filter((x) => x.exam.id === e.id)
                      .map(({ area }) => {
                        const n = area.groups.reduce((k, g) => k + g.items.length, 0);
                        return (
                          <label
                            key={area.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded-xs px-1 py-1.5 hover:bg-accent-soft"
                          >
                            <input
                              type="checkbox"
                              checked={areas.has(area.id)}
                              onChange={() =>
                                setAreas((s) => {
                                  const next = new Set(s);
                                  if (next.has(area.id)) next.delete(area.id);
                                  else next.add(area.id);
                                  return next;
                                })
                              }
                              className="h-4 w-4 accent-[var(--c-accent-solid)]"
                            />
                            <span className="flex-1 text-small text-fg">{area.name}</span>
                            <CountPill>{n}</CountPill>
                          </label>
                        );
                      })}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <LayoutGroup>
          {LANE_ORDER.map((lane) => {
            const ids = lanes.get(lane)!;
            const info = LANE_INFO[lane];
            return (
              <Card key={lane} as="section" className="p-3 sm:p-4" testId={`lane-${lane}`}>
                <div className="mb-3 flex items-center gap-2.5 px-1">
                  <span
                    className="h-6 w-1.5 shrink-0 rounded-full"
                    style={{ background: info.color }}
                  />
                  <h2 className="text-lead font-bold text-fg">{info.name}</h2>
                  <span className="text-small text-muted">{info.sub}</span>
                  <CountPill>{ids.length}</CountPill>
                  <span className="ml-auto hidden text-tiny text-subtle sm:inline">
                    次の一手: {info.next}
                  </span>
                </div>
                {ids.length === 0 ? (
                  <EmptySlot>{info.empty}</EmptySlot>
                ) : (
                  <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                    {ids.map((id, i) => (
                      <motion.li key={id} layout layoutId={`card-${id}`} transition={FLY}>
                        <ItemCard
                          id={id}
                          n={i + 1}
                          on={selected === id}
                          onClick={() => select(id)}
                          due={data.items[id] ? dueLabel(data.items[id].dueOn, today) : null}
                          level={data.items[id]?.level ?? null}
                        />
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}

function ItemCard({
  id,
  n,
  on,
  onClick,
  due,
  level,
}: {
  id: string;
  n: number;
  on: boolean;
  onClick: () => void;
  due: string | null;
  level: number | null;
}) {
  const askable = (PROBLEMS_BY_ITEM.get(id)?.length ?? 0) > 0;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={LIFT}
      aria-pressed={on}
      data-item={id}
      className={`panel-flat relative flex h-full w-full items-center gap-3 rounded-md border bg-raised p-3 pr-8 text-left ${
        on ? 'border-accent-solid ring-2 ring-accent-line' : 'border-edge hover:border-accent-line'
      }`}
    >
      <Tile kind={kindOf(id)} tone={KIND_TONE[kindOf(id)]} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-small leading-snug font-semibold text-fg">
          {itemName(id)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-micro text-muted">
          {level !== null && <span>定着 {level}/5</span>}
          {due && <span>次は{due}</span>}
          {!askable && <span className="text-subtle">問題は準備中</span>}
        </span>
      </span>
      <span className="tnum absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-xs border border-line px-1 text-micro text-subtle">
        {n}
      </span>
    </motion.button>
  );
}

type DetailTab = 'memo' | 'lesson' | 'figure' | 'problems' | 'history';

function Detail({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { data, today, markRead, addMemo, removeMemo } = useProgress();
  const now = useNow();
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>('memo');
  const [memo, setMemo] = useState('');
  const where = ITEM_INDEX.get(itemId)!;
  const lane = laneOf(data, itemId);
  const st = data.items[itemId];
  const sec = SECTION_BY_ITEM.get(itemId);
  const problems = PROBLEMS_BY_ITEM.get(itemId) ?? [];
  const figures = NOTATION.filter((s) => s.items.includes(itemId));
  const memos = data.memos[itemId] ?? [];
  const history = data.history.filter((h) => h.items.includes(itemId));
  const info = LANE_INFO[lane];

  // 主行動: 定着度に合った Lv の問題（未着手なら Lv1）。無ければ教材へ
  const next =
    problems.find((p) => p.level === Math.min(3, 1 + Math.floor((st?.level ?? 0) / 2))) ??
    problems[0];

  return (
    <Card className="flex flex-col p-4 sm:p-5" testId="detail">
      <div className="flex items-start gap-3">
        <Tile kind={kindOf(itemId)} tone={KIND_TONE[kindOf(itemId)]} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lead leading-snug font-bold text-fg">{where.item.name}</h1>
          <p className="mt-1 text-tiny text-muted">
            {where.exam.name} ・ {where.area.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="詳細を閉じる"
          className="rounded-full p-1.5 text-subtle hover:bg-raised hover:text-fg"
        >
          <IconX size={16} />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-2.5 text-small">
        <dt className="text-muted">状態</dt>
        <dd className="flex items-center gap-2 font-semibold text-fg">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color }} />
          {info.name}
          <span className="font-normal text-muted">{info.sub}</span>
        </dd>
        <dt className="text-muted">定着度</dt>
        <dd className="flex items-center gap-2">
          <span className="w-24">
            <Meter value={st?.level ?? 0} total={MATURE} />
          </span>
          <span className="tnum text-fg">{st ? `${st.level} / ${MATURE}` : '—'}</span>
        </dd>
        <dt className="text-muted">次の出題</dt>
        <dd className="text-fg">
          {st ? (
            <>
              <strong>{dueLabel(st.dueOn, today)}</strong>
              <span className="ml-1.5 text-muted">（{st.dueOn}）</span>
            </>
          ) : (
            <span className="text-muted">まだ解いていない</span>
          )}
        </dd>
        <dt className="text-muted">落とした回数</dt>
        <dd className="tnum text-fg">{st?.lapses ?? 0} 回</dd>
        <dt className="text-muted">教材</dt>
        <dd className="text-fg">
          {sec ? (
            <Link
              to={`/learn/${sec.lesson.id}#${sec.section.id}`}
              className="text-accent underline underline-offset-2"
            >
              第 {sec.lesson.no} 章 {sec.section.title}
            </Link>
          ) : (
            '—'
          )}
        </dd>
      </dl>

      <div className="mt-5 overflow-hidden rounded-lg border border-edge bg-raised">
        <Tabs<DetailTab>
          layoutId="detail-tab"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'memo', label: 'メモ', count: memos.length },
            { id: 'lesson', label: '教材' },
            { id: 'figure', label: '図', count: figures.length },
            { id: 'problems', label: '問題', count: problems.length },
            { id: 'history', label: '履歴', count: history.length },
          ]}
        />
        <div className="max-h-[42vh] min-h-48 overflow-y-auto p-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {tab === 'memo' && (
                <div className="space-y-3">
                  {/* 制約を結果で言う（DESIGN.md §4.5） */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!memo.trim()) return;
                      addMemo(itemId, memo.trim());
                      setMemo('');
                    }}
                    className="rounded-md border border-edge bg-surface p-2.5"
                  >
                    <div className="flex gap-2">
                      <textarea
                        value={memo}
                        onChange={(e) => setMemo(e.target.value.slice(0, MEMO_MAX))}
                        placeholder={`間違えた理由を自分の言葉で…（最大 ${MEMO_MAX} 文字）`}
                        rows={2}
                        className="min-w-0 flex-1 resize-none bg-transparent text-small text-fg outline-none placeholder:text-subtle"
                      />
                      <Button variant="primary" size="sm" type="submit" disabled={!memo.trim()}>
                        貼る
                      </Button>
                    </div>
                    <p className="tnum mt-1 text-right text-micro text-subtle">
                      {memo.length} / {MEMO_MAX}
                    </p>
                  </form>
                  {memos.length === 0 ? (
                    <EmptySlot>
                      まだメモはありません。間違えたときに「なぜ取り違えたか」を残すと、次に効きます。
                    </EmptySlot>
                  ) : (
                    <ul className="divide-y divide-line">
                      {memos.map((m) => (
                        <li key={m.at} className="flex gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-micro text-subtle">
                              {relativeLabel(Date.parse(m.at), now)}（
                              {m.at.slice(0, 16).replace('T', ' ')}）
                            </p>
                            <p className="mt-0.5 text-small leading-relaxed whitespace-pre-wrap text-fg">
                              {m.text}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMemo(itemId, m.at)}
                            aria-label="メモを消す"
                            className="self-start rounded-full p-1 text-danger hover:bg-danger-soft"
                          >
                            <IconTrash size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {tab === 'lesson' && sec && (
                <div className="space-y-3">
                  <p className="text-small font-bold text-fg">{sec.section.title}</p>
                  <div className="max-h-64 overflow-hidden [mask-image:linear-gradient(black_70%,transparent)]">
                    <Markdown className="text-small">
                      {sec.section.body_md.split('\n### ')[0]}
                    </Markdown>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/learn/${sec.lesson.id}#${sec.section.id}`)}
                    >
                      <IconBook size={14} /> 教材で続きを読む
                    </Button>
                    {!data.read[itemId] && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead([itemId])}
                        data-testid="mark-read"
                      >
                        読んだ印を付ける
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {tab === 'figure' &&
                (figures.length === 0 ? (
                  <EmptySlot>
                    この項目の記法見本はまだありません。図のレンダラが入った図種から増えます（今は
                    bdd）。
                  </EmptySlot>
                ) : (
                  <div className="space-y-4">
                    {figures.map((f) => (
                      <div key={f.id}>
                        <p className="mb-1.5 text-small font-bold text-fg">{f.title}</p>
                        <Diagram model={f.model} />
                      </div>
                    ))}
                  </div>
                ))}
              {tab === 'problems' &&
                (problems.length === 0 ? (
                  <EmptySlot>
                    この項目の問題は準備中です。図のレンダラが入った章から揃えています（今は第 1
                    章）。
                  </EmptySlot>
                ) : (
                  <ul className="space-y-1.5">
                    {problems.map((p) => {
                      const r = data.problems[p.id];
                      return (
                        <li key={p.id}>
                          <Link
                            to={`/problems/${p.id}`}
                            className="flex items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent-soft"
                          >
                            <Tag tone="accent">Lv{p.level}</Tag>
                            <span className="min-w-0 flex-1 truncate text-small text-fg">
                              {p.title}
                            </span>
                            <span
                              className={`text-micro font-semibold ${r?.solved ? 'text-success' : r ? 'text-danger' : 'text-subtle'}`}
                            >
                              {r?.solved ? '正解済み' : r ? `${r.attempts} 回・未正解` : '未挑戦'}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ))}
              {tab === 'history' &&
                (history.length === 0 ? (
                  <EmptySlot>まだ記録はありません。</EmptySlot>
                ) : (
                  <ul className="divide-y divide-line">
                    {history.slice(0, 50).map((h, i) => (
                      <li key={i} className="flex items-center gap-2 py-2 text-small">
                        <span className={`font-bold ${h.correct ? 'text-success' : 'text-danger'}`}>
                          {h.correct ? '正解' : '不正解'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-fg">{h.problemId}</span>
                        <span className="text-micro text-subtle">
                          {relativeLabel(Date.parse(h.at), now)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          size="lg"
          onClick={() => (sec ? navigate(`/learn/${sec.lesson.id}#${sec.section.id}`) : undefined)}
        >
          <IconPlus size={15} /> 教材を読む
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!next}
          onClick={() => next && navigate(`/problems/${next.id}`)}
          data-testid="solve-item"
        >
          <IconSparkle size={15} /> {next ? 'この項目を解く' : '問題は準備中'}
        </Button>
      </div>
    </Card>
  );
}
