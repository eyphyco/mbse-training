import Diagram from '../diagram/Diagram';
import Markdown from '../components/Markdown';
import { Card, Tag } from '../components/ui';
import { NOTATION } from '../data/notation';
import { ITEM_INDEX } from '../data/syllabus';

/*
  記法見本。レンダラを目で確かめる場所であり、smoke と contrast が図を測る場所でもある。
  ゆくゆくはボードの詳細「図」タブ（DESIGN.md §4.9）に項目ごとに出す。それまでの仮の置き場。
*/
export default function Notation() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title font-semibold tracking-tight text-fg">
          記法見本 — ブロック定義図
        </h1>
        <p className="mt-1 text-small text-muted">
          SysML v1.2 の図をそのままの記法で描いている。本番の図と同じく白黒。
        </p>
      </header>
      {NOTATION.map((s) => (
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
