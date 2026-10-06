import { useSearchParams } from 'react-router-dom';
import Diagram from '../diagram/Diagram';
import { DIAGRAM_TYPES } from '../diagram/model';
import type { DiagramType } from '../diagram/model';
import Markdown from '../components/Markdown';
import { Card, Tag } from '../components/ui';
import { DIAGRAM_NAME, NOTATION } from '../data/notation';
import { ITEM_INDEX } from '../data/syllabus';

/*
  記法見本。レンダラを目で確かめる場所であり、smoke と contrast が図を測る場所でもある。
  既定は「すべて」にしておく（smoke が全図種のはみ出しを 1 画面で測れるように）。
  絞り込みは URL の ?type= に持つ（教材から図種を指してリンクできる）。
*/
export default function Notation() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('type');
  const type = DIAGRAM_TYPES.includes(raw as DiagramType) ? (raw as DiagramType) : null;
  const list = type ? NOTATION.filter((s) => s.model.type === type) : NOTATION;
  const chips: { id: DiagramType | null; label: string; count: number }[] = [
    { id: null, label: 'すべて', count: NOTATION.length },
    ...DIAGRAM_TYPES.map((t) => ({
      id: t,
      label: t,
      count: NOTATION.filter((s) => s.model.type === t).length,
    })),
  ];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title font-semibold tracking-tight text-fg">
          記法見本{type ? ` — ${DIAGRAM_NAME[type]}` : ''}
        </h1>
        <p className="mt-1 text-small text-muted">
          SysML v1.2 の図をそのままの記法で描いている。本番の図と同じく白黒。
        </p>
        <div
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
          role="group"
          aria-label="図種で絞る"
        >
          {chips.map((c) => {
            const on = c.id === type;
            return (
              <button
                key={c.id ?? 'all'}
                type="button"
                aria-pressed={on}
                title={c.id ? DIAGRAM_NAME[c.id] : undefined}
                onClick={() => setParams(c.id ? { type: c.id } : {})}
                className={`shrink-0 rounded-full border px-3 py-1 text-tiny font-semibold transition-colors ${
                  on
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-edge bg-raised text-muted hover:text-fg'
                }`}
              >
                {c.label}
                <span className="tnum ml-1 text-micro text-subtle">{c.count}</span>
              </button>
            );
          })}
        </div>
      </header>
      {list.map((s) => (
        <Card key={s.id} as="section" className="p-5" testId={`notation-${s.id}`}>
          <h2 className="text-lead font-semibold tracking-tight text-fg">{s.title}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.items.map((id) => (
              <Tag key={id}>{ITEM_INDEX.get(id)?.item.name ?? id}</Tag>
            ))}
          </div>
          <Diagram model={s.model} className="mt-4" />
          <Markdown className="mt-4">{s.note_md}</Markdown>
        </Card>
      ))}
    </div>
  );
}
