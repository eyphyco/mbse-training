import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import ProblemRunner from '../components/ProblemRunner';
import { Button, Card, CountPill, EmptySlot, Meter, SectionTitle, Tag } from '../components/ui';
import { IconChevronLeft, IconChevronRight, IconTimer } from '../components/icons';
import { RISE, STAGGER } from '../components/motion';
import { PROBLEMS, itemName } from '../data/content';
import { ITEM_INDEX, SYLLABUS } from '../data/syllabus';
import type { Exam as ExamInfo } from '../data/syllabus';
import type { Problem } from '../data/types';
import { EMPTY_ANSWER, grade } from '../engine/judge';
import type { AnswerState } from '../engine/judge';
import { useProgress } from '../storage/progressContext';

/*
  模擬試験（EXAM.md §5）。
  - 本番は 90 問。問題がそれより少ない間は、ある分だけで行い、時間を問題数に比例させる
  - 出題は領域の比率（syllabus の weight）に比例させる
  - **途中で答えを見せない**。終わってからまとめて
  - 時間切れは時間切れとして記録する
  - 終わったら領域別に分解し、落とした項目を定着度 0 に戻す（翌日から出る）
*/

const examOf = (p: Problem) => ITEM_INDEX.get(p.items[0])?.exam.id;
/**
 * 模擬試験に出す型。本番は多肢選択だけなので、組み立てと記述は練習でだけ出す
 * （試験中に採点の見えない組み立てをさせても、本番の練習にならない）
 */
const EXAM_TYPES = new Set<Problem['type']>(['read_diagram', 'choose_construct', 'spot_error']);
const areaOf = (p: Problem) => ITEM_INDEX.get(p.items[0])?.area;

/** 領域の比率に比例させて選ぶ。決まった順で回せるよう、乱数は渡す */
function pick(pool: Problem[], exam: ExamInfo, n: number, rnd: () => number): Problem[] {
  const shuffled = [...pool].sort(() => rnd() - 0.5);
  if (shuffled.length <= n) return shuffled;
  const byArea = new Map<string, Problem[]>();
  for (const p of shuffled) {
    const a = areaOf(p)!.id;
    byArea.set(a, [...(byArea.get(a) ?? []), p]);
  }
  const out: Problem[] = [];
  for (const area of exam.areas) {
    const take = Math.round(area.weight * n);
    out.push(...(byArea.get(area.id) ?? []).slice(0, take));
  }
  // 丸めの過不足を、残りから埋める
  for (const p of shuffled) if (out.length < n && !out.includes(p)) out.push(p);
  return out.slice(0, n);
}

type Phase =
  | { kind: 'setup' }
  | { kind: 'run'; exam: ExamInfo; problems: Problem[]; endsAt: number; startedAt: number }
  | {
      kind: 'done';
      exam: ExamInfo;
      problems: Problem[];
      answers: AnswerState[];
      seconds: number;
      timedOut: boolean;
    };

export default function Exam() {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  if (phase.kind === 'run')
    return (
      <Running
        {...phase}
        onFinish={(answers, timedOut) =>
          setPhase({
            kind: 'done',
            exam: phase.exam,
            problems: phase.problems,
            answers,
            timedOut,
            seconds: Math.round((Date.now() - phase.startedAt) / 1000),
          })
        }
      />
    );
  if (phase.kind === 'done')
    return <Result {...phase} onAgain={() => setPhase({ kind: 'setup' })} />;
  return (
    <Setup
      onStart={(exam, problems, minutes) =>
        setPhase({
          kind: 'run',
          exam,
          problems,
          startedAt: Date.now(),
          endsAt: Date.now() + minutes * 60_000,
        })
      }
    />
  );
}

function Setup({ onStart }: { onStart: (e: ExamInfo, p: Problem[], minutes: number) => void }) {
  const { data } = useProgress();
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h1 className="text-display font-bold tracking-tight text-fg">模擬試験</h1>
        <p className="mt-2 max-w-3xl text-small leading-relaxed text-muted">
          本番と同じく、途中で答えは見せない。終わったら領域別に分解し、落とした項目は定着度を 0
          に戻して翌日から出す。 受験の 2 か月前から 2 週ごとに 4 回が目安（EXAM.md §5.1）。
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {SYLLABUS.exams.map((exam, k) => {
          const pool = PROBLEMS.filter((p) => examOf(p) === exam.id && EXAM_TYPES.has(p.type));
          const n = Math.min(exam.questions, pool.length);
          const minutes = Math.max(1, Math.round((exam.minutes * n) / exam.questions));
          const pass = Math.ceil((exam.pass / exam.questions) * n);
          const last = data.exams.find((r) => r.examId === exam.id);
          return (
            <Card key={exam.id} className="flex flex-col p-5">
              <h2 className="text-title font-bold text-fg">{exam.name}</h2>
              <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-1.5 text-small">
                <dt className="text-muted">本番</dt>
                <dd className="tnum text-fg">
                  {exam.questions} 問 ・ {exam.minutes} 分 ・ 合格 {exam.pass} 問（
                  {exam.passPercent}%）
                </dd>
                <dt className="text-muted">今回</dt>
                <dd className="tnum font-bold text-fg">
                  {n} 問 ・ {minutes} 分 ・ 合格の目安 {pass} 問
                </dd>
                <dt className="text-muted">前回</dt>
                <dd className="tnum text-fg">
                  {last
                    ? `${last.score} / ${last.total}（${last.at.slice(0, 10)}）`
                    : 'まだ受けていない'}
                </dd>
              </dl>
              {/* 分母を出す。問題が本番より少ないことを隠さない（DESIGN.md §4.6） */}
              {n < exam.questions && (
                <p className="mt-3 rounded-sm bg-warning-soft px-3 py-2 text-tiny leading-relaxed text-warning">
                  問題が {pool.length} 問しかないので {n} 問で行います（本番は {exam.questions}{' '}
                  問）。時間と合格の目安は問題数に比例させています。
                </p>
              )}
              <div className="mt-auto pt-4">
                <Button
                  variant={k === 0 ? 'primary' : 'secondary'} // 主行動は 1 画面に 1 つ。受ける順の先（Model User）だけ塗る
                  size="lg"
                  className="w-full"
                  disabled={n === 0}
                  onClick={() => onStart(exam, pick(pool, exam, n, Math.random), minutes)}
                  data-testid={`start-${exam.id}`}
                >
                  <IconTimer size={16} /> {n === 0 ? '問題がまだありません' : '始める'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Running({
  exam,
  problems,
  endsAt,
  startedAt,
  onFinish,
}: {
  exam: ExamInfo;
  problems: Problem[];
  endsAt: number;
  startedAt: number;
  onFinish: (answers: AnswerState[], timedOut: boolean) => void;
}) {
  const [answers, setAnswers] = useState<AnswerState[]>(() => problems.map(() => EMPTY_ANSWER));
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // 時間切れは時間切れとして記録する（本番で起きるのはそれ）
    if (now >= endsAt && !finished.current) {
      finished.current = true;
      onFinish(answersRef.current, true);
    }
  }, [now, endsAt, onFinish]);

  const done = answers.filter(
    (a) => a.choices.length > 0 || a.picks.length > 0 || !!a.built,
  ).length;
  const left = endsAt - now;
  const total = endsAt - startedAt;
  const p = problems[i];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-start">
      <Card className="p-5 sm:p-7" testId="exam-question">
        <div className="mb-4 flex items-center gap-3">
          <p className="text-small font-bold text-accent">
            第 {i + 1} 問 / {problems.length}
          </p>
          <button
            type="button"
            onClick={() =>
              setFlags((s) => {
                const n = new Set(s);
                if (n.has(i)) n.delete(i);
                else n.add(i);
                return n;
              })
            }
            aria-pressed={flags.has(i)}
            className={`ml-auto rounded-full border px-3 py-1 text-tiny font-semibold ${flags.has(i) ? 'border-warning-line bg-warning-soft text-warning' : 'border-edge bg-raised text-muted'}`}
          >
            {flags.has(i) ? '見直す印あり' : '見直す印を付ける'}
          </button>
        </div>
        <ProblemRunner
          key={p.id}
          problem={p}
          mode="exam"
          value={answers[i]}
          onChange={(a) => setAnswers((xs) => xs.map((x, k) => (k === i ? a : x)))}
        />
        <div className="mt-6 flex justify-between">
          <Button disabled={i === 0} onClick={() => setI(i - 1)}>
            <IconChevronLeft size={14} /> 前へ
          </Button>
          {i < problems.length - 1 ? (
            <Button onClick={() => setI(i + 1)} data-testid="exam-next">
              次へ <IconChevronRight size={14} />
            </Button>
          ) : (
            <span />
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-4 lg:sticky lg:top-[88px]">
        <div>
          <p className="text-tiny font-semibold text-muted">{exam.name}</p>
          <p
            className={`tnum mt-1 text-display font-bold ${left < 60_000 ? 'text-danger' : 'text-fg'}`}
            aria-live="off"
          >
            残り {clock(left)}
          </p>
          <Meter
            value={Math.max(0, left)}
            total={total}
            color={left < total * 0.1 ? 'var(--c-danger)' : undefined}
          />
        </div>
        <p className="tnum text-small text-muted">
          回答 {done} / {problems.length} ・ 見直す印 {flags.size}
        </p>
        <ol className="grid grid-cols-6 gap-1.5">
          {problems.map((q, k) => {
            const a = answers[k];
            const has = a.choices.length > 0 || a.picks.length > 0;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setI(k)}
                  aria-label={`第 ${k + 1} 問${has ? '・回答済み' : ''}${flags.has(k) ? '・見直す印' : ''}`}
                  className={`tnum relative h-8 w-full rounded-xs border text-tiny font-bold ${
                    k === i ? 'border-accent-solid ring-2 ring-accent-line' : 'border-edge'
                  } ${has ? 'bg-accent-soft text-accent' : 'bg-raised text-muted'}`}
                >
                  {k + 1}
                  {flags.has(k) && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--c-lane-orange)]" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            const rest = problems.length - done;
            if (rest > 0 && !window.confirm(`未回答が ${rest} 問あります。提出しますか？`)) return;
            finished.current = true;
            onFinish(answers, false);
          }}
          data-testid="exam-submit"
        >
          提出する
        </Button>
      </Card>
    </div>
  );
}

function Result({
  exam,
  problems,
  answers,
  seconds,
  timedOut,
  onAgain,
}: {
  exam: ExamInfo;
  problems: Problem[];
  answers: AnswerState[];
  seconds: number;
  timedOut: boolean;
  onAgain: () => void;
}) {
  const { data, recordExam } = useProgress();
  const marks = useMemo(() => problems.map((p, k) => grade(p, answers[k])), [problems, answers]);
  const score = marks.filter(Boolean).length;
  const pass = Math.ceil((exam.pass / exam.questions) * problems.length);
  const byArea: Record<string, { correct: number; total: number }> = {};
  problems.forEach((p, k) => {
    const a = areaOf(p)!.id;
    byArea[a] ??= { correct: 0, total: 0 };
    byArea[a].total += 1;
    if (marks[k]) byArea[a].correct += 1;
  });
  const dropped = [...new Set(problems.flatMap((p, k) => (marks[k] ? [] : p.items)))];
  const prev = data.exams.find((r) => r.examId === exam.id);

  // 1 回だけ記録する（StrictMode の 2 回呼びでも二重にしない）
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    recordExam(
      {
        at: new Date().toISOString(),
        examId: exam.id,
        score,
        total: problems.length,
        byArea,
        timedOut,
        seconds,
      },
      dropped,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="shown"
      className="space-y-4"
      data-testid="exam-result"
    >
      <motion.div variants={RISE}>
        <Card className="p-5 sm:p-7">
          <p className="text-small font-semibold text-muted">{exam.name} ・ 模擬試験の結果</p>
          <p className="tnum mt-2 text-[40px] leading-none font-extrabold text-fg">
            {score} <span className="text-title font-bold text-muted">/ {problems.length} 問</span>
          </p>
          <p
            className={`mt-2 text-body font-bold ${score >= pass ? 'text-success' : 'text-danger'}`}
          >
            {score >= pass ? '合格の目安に届いた' : '合格の目安に届かなかった'}（目安 {pass} 問・
            {exam.passPercent}%）
          </p>
          <p className="tnum mt-1 text-small text-muted">
            {timedOut ? '時間切れで終了' : '提出して終了'} ・ {Math.floor(seconds / 60)} 分{' '}
            {seconds % 60} 秒 ・ 1 問あたり {Math.round(seconds / problems.length)} 秒
            {prev &&
              ` ・ 前回 ${prev.score} / ${prev.total} から ${score - prev.score >= 0 ? '+' : ''}${score - prev.score}`}
          </p>
        </Card>
      </motion.div>

      <motion.div variants={RISE}>
        <Card className="p-5">
          <SectionTitle>領域別の正答率</SectionTitle>
          <ul className="space-y-3">
            {exam.areas
              .filter((a) => byArea[a.id])
              .map((a) => {
                const r = byArea[a.id];
                return (
                  <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                    <span className="text-small text-fg">{a.name}</span>
                    <span className="tnum text-small font-bold text-fg">
                      {r.correct} / {r.total}
                    </span>
                    <span className="col-span-2">
                      <Meter value={r.correct} total={r.total} />
                    </span>
                  </li>
                );
              })}
          </ul>
        </Card>
      </motion.div>

      <motion.div variants={RISE}>
        <Card className="p-5">
          <SectionTitle count={dropped.length} color="var(--c-lane-orange)">
            落とした項目
          </SectionTitle>
          {dropped.length === 0 ? (
            <EmptySlot>落とした項目はありません。</EmptySlot>
          ) : (
            <>
              <p className="mb-3 text-small text-muted">
                定着度を 0 に戻しました。<strong className="text-fg">明日から</strong>
                今日やる分に出ます。ボードの「落とした」レーンにも並びます。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dropped.map((id) => (
                  <Link key={id} to={`/board?item=${id}`}>
                    <Tag tone="warning">{itemName(id)}</Tag>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>
      </motion.div>

      <motion.div variants={RISE}>
        <Card className="p-5">
          <SectionTitle count={problems.length}>1 問ずつの見直し</SectionTitle>
          <ol className="divide-y divide-line">
            {problems.map((p, k) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="tnum w-8 text-small text-muted">{k + 1}</span>
                <span
                  className={`w-14 text-small font-bold ${marks[k] ? 'text-success' : 'text-danger'}`}
                >
                  {marks[k] ? '正解' : '不正解'}
                </span>
                <Link
                  to={`/problems/${p.id}`}
                  className="min-w-0 flex-1 truncate text-small text-fg hover:text-accent"
                >
                  {p.title}
                </Link>
                <CountPill>Lv{p.level}</CountPill>
              </li>
            ))}
          </ol>
        </Card>
      </motion.div>

      <AnimatePresence>
        <motion.div variants={RISE} className="flex justify-center">
          <Button variant="primary" size="lg" onClick={onAgain}>
            もう一度受ける
          </Button>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
