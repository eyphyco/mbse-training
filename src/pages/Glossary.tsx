import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CountPill, EmptySlot } from '../components/ui';
import { GLOSSARY } from '../data/content';

/**
 * 用語集。教材の「この節で初めて出る語」から自動で作る（DESIGN.md §7.2。手で二重管理しない）。
 * 各語から初出の節へ飛べる。
 */
export default function Glossary() {
  const [q, setQ] = useState('');
  const { hash } = useLocation();
  const k = q.normalize('NFKC').toLowerCase();
  const list = GLOSSARY.filter((g) =>
    !k
      ? true
      : [g.term, g.reading ?? '', g.def].some((x) => x.normalize('NFKC').toLowerCase().includes(k)),
  );

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(`term-${decodeURIComponent(hash.slice(1))}`);
    el?.scrollIntoView({ block: 'center' });
    el?.classList.add('ring-2', 'ring-accent-line');
  }, [hash]);

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-display font-bold tracking-tight text-fg">用語集</h1>
          <CountPill>{GLOSSARY.length}</CountPill>
        </div>
        <p className="mt-2 text-small text-muted">
          教材の各節で初めて出る語を集めたもの。語から初出の節へ飛べる。
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="語・読み・説明で絞り込む…"
          className="mt-4 h-10 w-full rounded-md border border-edge bg-raised px-3 text-small text-fg outline-none placeholder:text-subtle focus:border-accent-line"
        />
      </Card>
      {list.length === 0 ? (
        <EmptySlot>
          「{q}」に当たる語は {GLOSSARY.length} 語の中にありません。
        </EmptySlot>
      ) : (
        <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {list.map((g) => (
            <li
              key={g.term}
              id={`term-${g.term}`}
              className="panel-flat rounded-md border border-edge bg-raised p-4 transition-shadow"
            >
              <p className="text-body font-bold text-fg">
                {g.term}
                {g.reading && (
                  <span className="ml-2 text-tiny font-normal text-subtle">{g.reading}</span>
                )}
              </p>
              <p className="mt-1 text-small leading-relaxed text-fg">{g.def}</p>
              <Link
                to={`/learn/${g.lesson.id}#${g.section.id}`}
                className="mt-2 inline-block text-tiny font-semibold text-accent hover:underline"
              >
                初出: 第 {g.lesson.no} 章 {g.section.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
