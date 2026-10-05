import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGroup, motion } from 'motion/react';
import { Card, CountPill, EmptySlot, Tag, Tile } from '../components/ui';
import { FLY, LIFT } from '../components/motion';
import { LESSONS, PROBLEMS, SECTION_BY_ITEM, itemName } from '../data/content';
import { TYPE_LABEL } from '../engine/judge';
import type { Problem } from '../data/types';
import { useProgress } from '../storage/progressContext';

type State = 'all' | 'new' | 'failed' | 'solved';
const STATE_LABEL: Record<State, string> = {
  all: 'すべて',
  new: '未挑戦',
  failed: '未正解',
  solved: '正解済み',
};

/** 絞り込みの選択肢。押せるピルを並べる（WHITEBOARD のタグ） */
function Pills<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; n?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-tiny font-semibold text-muted">{label}</span>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full border px-3 py-1 text-tiny font-semibold transition-colors ${
            value === o.id
              ? 'border-accent-line bg-accent-soft text-accent'
              : 'border-edge bg-raised text-muted hover:text-fg'
          }`}
        >
          {o.label}
          {o.n !== undefined && <span className="tnum ml-1 text-subtle">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * 問題の一覧（DESIGN.md §5）。絞り込みは 章 / 型 / Lv / 状態。
 * 0 件になったら、条件と分母と逃げ道を出す（DESIGN.md §4.6）。
 */
export default function Problems() {
  const { data } = useProgress();
  const [chapter, setChapter] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [level, setLevel] = useState<number>(0);
  const [state, setState] = useState<State>('all');

  const stateOf = (p: Problem): State =>
    data.problems[p.id]?.solved ? 'solved' : data.problems[p.id] ? 'failed' : 'new';

  // 数十問なので毎回数え直す（useMemo の依存を書き間違える方が怖い）
  const list = PROBLEMS.filter(
    (p) =>
      (chapter === 'all' || SECTION_BY_ITEM.get(p.items[0])?.lesson.id === chapter) &&
      (type === 'all' || p.type === type) &&
      (level === 0 || p.level === level) &&
      (state === 'all' || stateOf(p) === state),
  );
  const chapters = LESSONS.filter((l) =>
    PROBLEMS.some((p) => SECTION_BY_ITEM.get(p.items[0])?.lesson.id === l.id),
  );
  const conditions = [chapter !== 'all', type !== 'all', level !== 0, state !== 'all'].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <h1 className="text-display font-bold tracking-tight text-fg">問題</h1>
          <CountPill>{PROBLEMS.length}</CountPill>
          <span className="text-small text-muted">
            正解済み {PROBLEMS.filter((p) => data.problems[p.id]?.solved).length} /{' '}
            {PROBLEMS.length}
          </span>
        </div>
        <Pills
          label="章"
          value={chapter}
          onChange={setChapter}
          options={[
            { id: 'all', label: 'すべて' },
            ...chapters.map((l) => ({ id: l.id, label: `${l.no}. ${l.title}` })),
          ]}
        />
        <Pills
          label="型"
          value={type}
          onChange={setType}
          options={[
            { id: 'all', label: 'すべて' },
            ...(['read_diagram', 'spot_error', 'choose_construct'] as const).map((t) => ({
              id: t,
              label: TYPE_LABEL[t],
              n: PROBLEMS.filter((p) => p.type === t).length,
            })),
          ]}
        />
        <Pills
          label="Lv"
          value={level}
          onChange={setLevel}
          options={[
            { id: 0, label: 'すべて' },
            ...[1, 2, 3].map((n) => ({ id: n, label: `Lv${n}` })),
          ]}
        />
        <Pills
          label="状態"
          value={state}
          onChange={setState}
          options={(Object.keys(STATE_LABEL) as State[]).map((s) => ({
            id: s,
            label: STATE_LABEL[s],
            n: s === 'all' ? undefined : PROBLEMS.filter((p) => stateOf(p) === s).length,
          }))}
        />
      </Card>

      <p className="px-1 text-small text-muted" data-testid="problem-count">
        表示 {list.length} / {PROBLEMS.length} 問
      </p>

      {list.length === 0 ? (
        <EmptySlot>
          {conditions} 件の条件で {PROBLEMS.length} 問から絞り込んだ結果、0 問です。条件を 1
          つ外すか、
          <button
            type="button"
            className="ml-1 font-semibold text-accent underline"
            onClick={() => {
              setChapter('all');
              setType('all');
              setLevel(0);
              setState('all');
            }}
          >
            すべての条件を外す
          </button>
        </EmptySlot>
      ) : (
        <LayoutGroup>
          <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {list.map((p) => {
              const st = stateOf(p);
              return (
                <motion.li key={p.id} layout transition={FLY} whileHover={LIFT}>
                  <Link
                    to={`/problems/${p.id}`}
                    className="panel-flat flex h-full items-center gap-3 rounded-md border border-edge bg-raised p-3 hover:border-accent-line"
                    data-testid="problem-link"
                  >
                    <Tile
                      kind={p.diagram ?? 'map'}
                      tone={st === 'solved' ? 'green' : st === 'failed' ? 'orange' : 'blue'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-bold text-fg">{p.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag tone="accent">Lv{p.level}</Tag>
                        <span className="text-micro text-muted">{TYPE_LABEL[p.type]}</span>
                        <span className="truncate text-micro text-subtle">
                          {itemName(p.items[0])}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-micro font-bold ${st === 'solved' ? 'text-success' : st === 'failed' ? 'text-danger' : 'text-subtle'}`}
                    >
                      {STATE_LABEL[st]}
                    </span>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </LayoutGroup>
      )}
    </div>
  );
}
