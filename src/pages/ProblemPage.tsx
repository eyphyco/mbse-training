import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import ProblemRunner from '../components/ProblemRunner';
import { Button, Card } from '../components/ui';
import { IconChevronLeft, IconChevronRight } from '../components/icons';
import { PROBLEMS, PROBLEM_BY_ID, SECTION_BY_ITEM } from '../data/content';

/** 1 問を解くページ。前後送りは問題の並び順で */
export default function ProblemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const problem = id ? PROBLEM_BY_ID.get(id) : undefined;
  const [done, setDone] = useState(false);
  // 今日やる分から来たときは、その列の中で前後に送る（?q=id1,id2,…）
  const [params] = useSearchParams();
  const q =
    params
      .get('q')
      ?.split(',')
      .filter((x) => PROBLEM_BY_ID.has(x)) ?? null;

  if (!problem)
    return (
      <Card className="p-8 text-center">
        <p className="text-body text-fg">その問題はありません。</p>
        <Link to="/problems" className="mt-2 inline-block text-accent underline">
          問題の一覧へ
        </Link>
      </Card>
    );

  const list = q && q.includes(problem.id) ? q.map((x) => PROBLEM_BY_ID.get(x)!) : PROBLEMS;
  const i = list.indexOf(problem);
  const prev = list[i - 1];
  const next = list[i + 1];
  const suffix = q ? `?q=${q.join(',')}` : '';
  const sec = SECTION_BY_ITEM.get(problem.items[0]);

  return (
    <div className="mx-auto max-w-prose-wide space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-1 text-small text-muted">
        <Link to="/problems" className="hover:text-accent">
          問題
        </Link>
        <span>/</span>
        {sec && (
          <>
            <Link to={`/learn/${sec.lesson.id}#${sec.section.id}`} className="hover:text-accent">
              第 {sec.lesson.no} 章 {sec.section.title}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-fg">{problem.title}</span>
        {q && (
          <span className="tnum ml-auto rounded-full bg-accent-soft px-3 py-0.5 text-tiny font-bold text-accent">
            今日やる分 {i + 1} / {list.length}
          </span>
        )}
      </div>
      <Card className="p-5 sm:p-7">
        <h1 className="mb-4 text-title font-bold tracking-tight text-fg">{problem.title}</h1>
        {/* key で問題ごとに作り直す（前の問題の選択が残らないように） */}
        <ProblemRunner key={problem.id} problem={problem} onDone={() => setDone(true)} />
      </Card>
      <div className="flex justify-between gap-2">
        {prev ? (
          <Button
            onClick={() => {
              setDone(false);
              navigate(`/problems/${prev.id}${suffix}`);
            }}
          >
            <IconChevronLeft size={14} /> 前の問題
          </Button>
        ) : (
          <span />
        )}
        {!next && q && done && (
          <Button variant="primary" onClick={() => navigate('/')}>
            今日の分はおしまい
          </Button>
        )}
        {next && (
          <Button
            variant={done ? 'primary' : 'secondary'}
            onClick={() => {
              setDone(false);
              navigate(`/problems/${next.id}${suffix}`);
            }}
            data-testid="next-problem"
          >
            次の問題 <IconChevronRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
