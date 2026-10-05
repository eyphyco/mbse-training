import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Diagram from '../diagram/Diagram';
import { MARK_LABEL } from '../diagram/marks';
import type { PickMark } from '../diagram/marks';
import { RULES, pickableRefs, refLabel } from '../diagram/rules';
import Markdown from './Markdown';
import { Button, Tag } from './ui';
import { IconBulb, IconCheck, IconX } from './icons';
import { RISE, STAGGER } from './motion';
import { EMPTY_ANSWER, TYPE_LABEL, answered, grade, judgeSpot } from '../engine/judge';
import type { AnswerState } from '../engine/judge';
import type { Problem } from '../data/types';
import { itemName } from '../data/content';
import { useProgress } from '../storage/progressContext';
import { dueLabel } from '../storage/srs';
import type { Transition } from '../storage/progress';

/**
 * 1 問を解く。練習（すぐ採点・定着度を更新）と模擬試験（溜めるだけ）の両方で使う。
 *
 * 採点の後に必ず「次にいつ出るか」を言う（DESIGN.md §4.5）。「不正解です」で終わらせない。
 */
export default function ProblemRunner({
  problem,
  mode = 'practice',
  value,
  onChange,
  onDone,
}: {
  problem: Problem;
  mode?: 'practice' | 'exam';
  /** 模擬試験: 外が持つ解答 */
  value?: AnswerState;
  onChange?: (a: AnswerState) => void;
  /** 練習: 採点が終わった */
  onDone?: (correct: boolean) => void;
}) {
  const exam = mode === 'exam';
  const [local, setLocal] = useState<AnswerState>(EMPTY_ANSWER);
  const a = exam ? (value ?? EMPTY_ANSWER) : local;
  const set = (next: AnswerState) => (exam ? onChange?.(next) : setLocal(next));

  const [result, setResult] = useState<{ correct: boolean; transitions: Transition[] } | null>(
    null,
  );
  const [hints, setHints] = useState(0);
  const [showModel, setShowModel] = useState(false);
  const { answer, today } = useProgress();
  const done = result !== null;

  const multi = (problem.answer?.length ?? 0) > 1;
  const toggleChoice = (id: string) => {
    if (done) return;
    const has = a.choices.includes(id);
    set({
      ...a,
      choices: multi ? (has ? a.choices.filter((c) => c !== id) : [...a.choices, id]) : [id],
    });
  };
  const togglePick = (ref: string) => {
    if (done) return;
    const has = a.picks.includes(ref);
    set({ ...a, picks: has ? a.picks.filter((p) => p !== ref) : [...a.picks, ref] });
  };

  const submit = (self?: boolean) => {
    const final = self === undefined ? a : { ...a, self };
    const correct = grade(problem, final);
    const transitions = answer(problem.id, problem.items, correct);
    setResult({ correct, transitions });
    onDone?.(correct);
  };

  /* 誤り指摘の印 */
  const spot = useMemo(
    () => (problem.type === 'spot_error' && done ? judgeSpot(problem, a.picks) : null),
    [problem, a.picks, done],
  );
  const marks: Record<string, PickMark> = {};
  if (spot) {
    for (const r of spot.hits) marks[r] = 'hit';
    for (const r of spot.misses) marks[r] = 'miss';
    for (const r of spot.wrongs) marks[r] = 'wrong';
  } else for (const r of a.picks) marks[r] = 'picked';

  const refs = problem.model && problem.type === 'spot_error' ? pickableRefs(problem.model) : [];

  return (
    <div className="space-y-5" data-testid="problem" data-problem={problem.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="accent">Lv{problem.level}</Tag>
        <Tag tone="purple">{TYPE_LABEL[problem.type]}</Tag>
        {problem.items.map((id) => (
          <Tag key={id}>{itemName(id)}</Tag>
        ))}
      </div>

      <Markdown>{problem.prompt_md}</Markdown>

      {problem.model && (
        <div className="rounded-md bg-sunken p-3">
          <Diagram
            model={problem.model}
            pick={
              problem.type === 'spot_error'
                ? { marks, onToggle: done ? undefined : togglePick }
                : undefined
            }
          />
        </div>
      )}

      {/* 誤り指摘: 図をクリックできない人のための一覧。図と同じ操作になる */}
      {problem.type === 'spot_error' && problem.model && (
        <fieldset>
          <legend className="mb-2 text-tiny font-semibold text-muted">
            誤っている所（図をクリックするか、ここで選ぶ）・ 選択中 {a.picks.length} か所
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {refs.map((r) => {
              const m = marks[r];
              const tone =
                m === 'hit'
                  ? 'border-success-line bg-success-soft text-success'
                  : m === 'miss'
                    ? 'border-danger-line bg-danger-soft text-danger'
                    : m === 'wrong'
                      ? 'border-warning-line bg-warning-soft text-warning'
                      : m === 'picked'
                        ? 'border-accent-line bg-accent-soft text-accent'
                        : 'border-edge bg-raised text-muted hover:text-fg';
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={a.picks.includes(r)}
                  disabled={done}
                  onClick={() => togglePick(r)}
                  className={`rounded-full border px-3 py-1 text-tiny font-semibold transition-colors ${tone}`}
                  data-ref-chip={r}
                >
                  {refLabel(problem.model!, r)}
                  {m && m !== 'picked' && <span className="ml-1">・{MARK_LABEL[m]}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {problem.choices && (
        <fieldset>
          <legend className="mb-2 text-tiny font-semibold text-muted">
            {multi ? '当てはまるものをすべて選ぶ' : '1 つ選ぶ'}
          </legend>
          <div
            className={`grid gap-2 ${problem.choices.some((c) => c.model) ? 'lg:grid-cols-2' : ''}`}
          >
            {problem.choices.map((c, i) => {
              const on = a.choices.includes(c.id);
              const right = done && problem.answer?.includes(c.id);
              const wrongPick = done && on && !right;
              return (
                <button
                  key={c.id}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  disabled={done}
                  onClick={() => toggleChoice(c.id)}
                  data-choice={c.id}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-[border-color,background-color,transform] ${
                    right
                      ? 'border-success-line bg-success-soft'
                      : wrongPick
                        ? 'border-danger-line bg-danger-soft'
                        : on
                          ? 'border-accent-line bg-accent-soft'
                          : 'border-edge bg-raised hover:-translate-y-px hover:border-accent-line'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center ${multi ? 'rounded-xs' : 'rounded-full'} border text-tiny font-bold ${
                      on ? 'border-transparent text-white' : 'border-line-strong text-muted'
                    }`}
                    style={on ? { background: 'var(--g-primary)' } : undefined}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Markdown className="text-body">{c.text_md}</Markdown>
                    {c.model && (
                      <div className="mt-2 rounded-sm bg-sunken p-2">
                        <Diagram model={c.model} />
                      </div>
                    )}
                    {done && (right || wrongPick) && (
                      <span
                        className={`mt-1 block text-tiny font-bold ${right ? 'text-success' : 'text-danger'}`}
                      >
                        {right ? '正解の選択肢' : 'あなたの選択（誤り）'}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {problem.type === 'written' && !exam && (
        <div className="space-y-3">
          {!showModel ? (
            <Button onClick={() => setShowModel(true)}>模範解答を見る</Button>
          ) : (
            <>
              <div className="rounded-md border border-edge bg-raised p-4">
                <Markdown>{problem.model_answer_md ?? ''}</Markdown>
              </div>
              {!done && (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => submit(true)}>
                    分かっていた
                  </Button>
                  <Button onClick={() => submit(false)}>もう一度出してほしい</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!exam && !done && (
        <div className="flex flex-wrap items-center gap-2">
          {problem.type !== 'written' && (
            <Button
              variant="primary"
              size="lg"
              disabled={!answered(problem, a)}
              onClick={() => submit()}
              data-testid="submit"
            >
              <IconCheck size={16} /> 答える
            </Button>
          )}
          {(problem.hints_md?.length ?? 0) > hints && (
            <Button variant="ghost" onClick={() => setHints((h) => h + 1)}>
              <IconBulb size={15} /> ヒント（{hints + 1} / {problem.hints_md!.length}）
            </Button>
          )}
        </div>
      )}

      <AnimatePresence>
        {hints > 0 && !done && (
          <motion.ul variants={STAGGER} initial="hidden" animate="shown" className="space-y-2">
            {problem.hints_md!.slice(0, hints).map((h, i) => (
              <motion.li
                key={i}
                variants={RISE}
                className="rounded-md border border-warning-line bg-warning-soft px-4 py-2.5 text-small text-fg"
              >
                <span className="mr-2 font-bold text-warning">ヒント {i + 1}</span>
                {h}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {done && result && (
          <motion.div
            variants={STAGGER}
            initial="hidden"
            animate="shown"
            className="space-y-3"
            data-testid="result"
            data-correct={result.correct}
          >
            <motion.div
              variants={RISE}
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                result.correct
                  ? 'border-success-line bg-success-soft'
                  : 'border-danger-line bg-danger-soft'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
                  result.correct ? 'bg-[var(--c-success)]' : 'bg-[var(--c-danger)]'
                }`}
              >
                {result.correct ? <IconCheck size={16} /> : <IconX size={16} />}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-lead font-bold ${result.correct ? 'text-success' : 'text-danger'}`}
                >
                  {result.correct ? '正解' : '不正解'}
                </p>
                {/* 「不正解です」で終わらせず、次にいつ出るかを言う */}
                <ul className="mt-1 space-y-0.5 text-small text-fg">
                  {result.transitions.map((t) => (
                    <li key={t.itemId}>
                      {itemName(t.itemId)}: 定着度 {t.fromLevel ?? '—'} → {t.toLevel}・次は
                      <strong>{dueLabel(t.dueOn, today)}</strong>
                      {t.early && '（出題日より前なので据え置き）'}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {problem.type === 'spot_error' && (
              <motion.div variants={RISE} className="space-y-2">
                {(problem.errors ?? []).map((e, i) => (
                  <div key={i} className="rounded-md border border-edge bg-raised p-4">
                    <p className="text-tiny font-semibold text-muted">
                      {refLabel(problem.model!, e.at)}
                    </p>
                    <p className="mt-0.5 text-body font-bold text-fg">{RULES[e.kind].title}</p>
                    <p className="mt-1 text-small leading-relaxed text-fg">{e.why}</p>
                    <p className="mt-1.5 text-small leading-relaxed text-muted">
                      {RULES[e.kind].explain}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}

            <motion.div variants={RISE} className="rounded-md border border-edge bg-raised p-4">
              <p className="mb-2 text-tiny font-semibold text-muted">解説</p>
              <Markdown>{problem.explanation_md}</Markdown>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
