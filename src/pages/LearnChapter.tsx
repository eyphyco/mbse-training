import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Diagram from '../diagram/Diagram';
import Markdown from '../components/Markdown';
import { Button, Card, Tag } from '../components/ui';
import { IconCheck, IconChevronLeft, IconChevronRight } from '../components/icons';
import { LESSONS, itemName, problemsOfSection } from '../data/content';
import { NOTATION } from '../data/notation';
import { useProgress } from '../storage/progressContext';

/**
 * 教材の 1 章。左に節の目次（現在地）、右に本文。
 * 節の終わりに「この節で初めて出る語」と、その節の問題を置く。
 */
export default function LearnChapter() {
  const { id } = useParams();
  const { hash } = useLocation();
  const { data, markRead } = useProgress();
  const i = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[i];

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    // 描画が落ち着いてから飛ぶ（図の高さが後から決まるため）
    const t = setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return () => clearTimeout(t);
  }, [hash, id]);

  if (!lesson)
    return (
      <Card className="p-8 text-center">
        <p className="text-body text-fg">その章はありません。</p>
        <Link to="/learn" className="mt-2 inline-block text-accent underline">
          教材の一覧へ
        </Link>
      </Card>
    );

  const prev = LESSONS[i - 1];
  const next = LESSONS[i + 1];

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:items-start">
      <nav
        className="panel hidden rounded-xl border border-edge bg-surface p-3 lg:sticky lg:top-[88px] lg:block"
        aria-label="この章の節"
      >
        <p className="px-2 pb-2 text-tiny font-semibold text-accent">第 {lesson.no} 章</p>
        <p className="px-2 pb-3 text-body font-bold text-fg">{lesson.title}</p>
        <ol className="space-y-0.5">
          {lesson.sections.map((s) => {
            const read =
              s.items.length > 0 && s.items.every((it) => data.read[it] || data.items[it]);
            return (
              <li key={s.id}>
                <Link
                  to={`/learn/${lesson.id}#${s.id}`}
                  className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-small text-muted hover:bg-accent-soft hover:text-fg"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${read ? 'bg-[var(--c-lane-green)] text-white' : 'border border-line-strong'}`}
                  >
                    {read && <IconCheck size={9} />}
                  </span>
                  <span className="leading-snug">{s.title}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-4">
        <Card className="p-5 sm:p-6">
          <p className="text-tiny font-semibold text-accent">第 {lesson.no} 章</p>
          <h1 className="mt-1 text-display font-bold tracking-tight text-fg">{lesson.title}</h1>
          <p className="mt-2 text-body leading-relaxed text-muted">{lesson.lead}</p>
        </Card>

        {lesson.sections.map((s) => {
          const problems = problemsOfSection(s);
          const read = s.items.length > 0 && s.items.every((it) => data.read[it] || data.items[it]);
          return (
            <Card
              key={s.id}
              as="section"
              id={s.id}
              className="scroll-mt-24 p-5 sm:p-7"
              testId={`section-${s.id}`}
            >
              <h2 className="text-title font-bold tracking-tight text-fg">{s.title}</h2>
              {s.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.items.map((it) => (
                    <Link key={it} to={`/board?item=${it}`}>
                      <Tag tone="accent">{itemName(it)}</Tag>
                    </Link>
                  ))}
                </div>
              )}
              <Markdown className="mt-4">{s.body_md}</Markdown>

              {(s.figures ?? []).map((fid) => {
                const f = NOTATION.find((n) => n.id === fid);
                if (!f) return null;
                return (
                  <figure key={fid} className="mt-5 rounded-lg border border-edge bg-raised p-4">
                    <p className="mb-2 text-small font-bold text-fg">図: {f.title}</p>
                    <Diagram model={f.model} />
                    <Markdown className="mt-3 text-small">{f.note_md}</Markdown>
                  </figure>
                );
              })}

              {(s.terms ?? []).length > 0 && (
                <div className="mt-5 rounded-lg border border-[var(--c-tile-purple)] bg-[var(--c-tile-purple)] p-4">
                  <p className="mb-2 text-tiny font-bold text-[var(--c-tile-purple-fg)]">
                    この節で初めて出る語
                  </p>
                  <dl className="grid gap-x-4 gap-y-1.5 text-small sm:grid-cols-[minmax(8rem,auto)_1fr]">
                    {s.terms!.map((t) => (
                      <div key={t.term} className="contents">
                        <dt className="font-bold text-fg">{t.term}</dt>
                        <dd className="text-muted">{t.def}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {s.items.length > 0 &&
                  (read ? (
                    <span className="flex items-center gap-1.5 text-small font-semibold text-success">
                      <IconCheck size={14} /> 読んだ
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => markRead(s.items)}
                      data-testid={`read-${s.id}`}
                    >
                      <IconCheck size={14} /> 読んだ
                    </Button>
                  ))}
                {problems.map((p) => (
                  <Link
                    key={p.id}
                    to={`/problems/${p.id}`}
                    className="rounded-sm border border-edge bg-raised px-3 py-1.5 text-small font-semibold text-fg hover:border-accent-line hover:text-accent"
                  >
                    Lv{p.level} {p.title}
                    {data.problems[p.id]?.solved && <span className="ml-1.5 text-success">✓</span>}
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}

        <div className="flex justify-between gap-2">
          {prev ? (
            <Link
              to={`/learn/${prev.id}`}
              className="panel flex items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-3 text-small font-semibold text-fg hover:text-accent"
            >
              <IconChevronLeft size={14} /> 第 {prev.no} 章 {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              to={`/learn/${next.id}`}
              className="panel flex items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-3 text-small font-semibold text-fg hover:text-accent"
            >
              第 {next.no} 章 {next.title} <IconChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
