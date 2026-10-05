import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { IconSearch } from './icons';
import { POP } from './motion';
import { GLOSSARY, LESSONS, PROBLEMS, itemName } from '../data/content';
import { ALL_ITEMS } from '../data/syllabus';

interface Hit {
  group: string;
  label: string;
  sub: string;
  to: string;
}

/** 全角・半角・大小を揃えて比べる */
const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/**
 * ヘッダの検索。対象範囲を placeholder に書く（DESIGN.md §4.10）。
 * Ctrl+K（Mac は ⌘K）でどこからでも入れる。
 */
export default function Search() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const k = norm(q.trim());
    if (!k) return [];
    const has = (...xs: (string | undefined)[]) => xs.some((x) => x && norm(x).includes(k));
    const out: Hit[] = [];
    for (const i of ALL_ITEMS)
      if (has(i.name, i.id))
        out.push({ group: '項目', label: i.name, sub: i.id, to: `/board?item=${i.id}` });
    for (const g of GLOSSARY)
      if (has(g.term, g.reading, g.def))
        out.push({
          group: '用語',
          label: g.term,
          sub: g.def,
          to: `/glossary#${encodeURIComponent(g.term)}`,
        });
    for (const l of LESSONS)
      for (const s of l.sections)
        if (has(s.title))
          out.push({
            group: '教材',
            label: s.title,
            sub: `第 ${l.no} 章 ${l.title}`,
            to: `/learn/${l.id}#${s.id}`,
          });
    for (const p of PROBLEMS)
      if (has(p.title, ...(p.tags ?? []), ...p.items.map(itemName)))
        out.push({
          group: '問題',
          label: p.title,
          sub: `Lv${p.level} ・ ${itemName(p.items[0])}`,
          to: `/problems/${p.id}`,
        });
    return out.slice(0, 24);
  }, [q]);

  const go = (to: string) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    navigate(to);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <label className="flex h-10 items-center gap-2 rounded-md border border-edge bg-raised px-3 text-muted focus-within:border-accent-line">
        <IconSearch size={16} />
        <span className="sr-only">検索</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) go(hits[0].to);
            if (e.key === 'Escape') inputRef.current?.blur();
          }}
          placeholder="項目名・用語・教材の節・問題名で検索…"
          className="min-w-0 flex-1 bg-transparent text-small text-fg outline-none placeholder:text-subtle"
          data-testid="search"
        />
        <kbd className="hidden rounded-xs border border-line bg-sunken px-1.5 py-0.5 text-micro text-subtle md:inline">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>
      <AnimatePresence>
        {open && q.trim() !== '' && (
          <motion.div
            {...POP}
            className="panel-pop absolute top-12 right-0 left-0 z-40 max-h-[60vh] overflow-y-auto rounded-lg border border-edge p-2"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-4 text-small text-muted">
                「{q}」に当たるものはありません。項目名・用語・教材の節・問題名が対象です。
              </p>
            ) : (
              <ul>
                {hits.map((h, i) => (
                  <li key={`${h.to}-${i}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(h.to)}
                      className="flex w-full items-baseline gap-3 rounded-sm px-3 py-2 text-left hover:bg-accent-soft"
                    >
                      <span className="w-8 shrink-0 text-micro font-semibold text-accent">
                        {h.group}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-fg">
                          {h.label}
                        </span>
                        <span className="block truncate text-tiny text-muted">{h.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
