import { ALL_ITEMS, SYLLABUS, itemsOf } from '../data/syllabus';
import { Link } from 'react-router-dom';
import { Card, SectionTitle } from '../components/ui';

/*
  骨格。ここの主役は最終的に「今日やる分」になる（DESIGN.md §5）。
  今は出題範囲が読めていることだけを見せる。
*/
export default function Home() {
  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h1 className="text-tiny font-medium tracking-tight text-muted">学習の進捗</h1>
        <p className="mt-2 text-lead text-fg">
          出題範囲 <span className="tnum font-semibold">{ALL_ITEMS.length}</span> 項目 ・ 着手{' '}
          <span className="tnum font-semibold">0</span> 項目
        </p>
        <p className="mt-1 text-small text-muted">
          対象は {SYLLABUS.standard}。範囲は公式の coverage map から写してある（{SYLLABUS.fetchedOn}{' '}
          取得）。
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-body font-semibold tracking-tight text-fg">図の記法見本</h2>
        <p className="mt-1 text-small text-muted">
          ブロック定義図を SysML v1.2
          の記法どおりに描いたもの。ひし形・三角・多重度の置き場所を見比べる。
        </p>
        <Link
          to="/notation"
          className="mt-3 inline-block text-small font-medium text-accent underline underline-offset-2"
        >
          記法見本を開く
        </Link>
      </Card>

      <section>
        <SectionTitle>試験</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {SYLLABUS.exams.map((exam) => (
            <Card key={exam.id} className="p-4">
              <h3 className="text-body font-semibold tracking-tight text-fg">{exam.name}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-tiny">
                <dt className="text-subtle">問題数</dt>
                <dd className="tnum text-fg">{exam.questions} 問</dd>
                <dt className="text-subtle">時間（日本語）</dt>
                <dd className="tnum text-fg">{exam.minutes} 分</dd>
                <dt className="text-subtle">合格</dt>
                <dd className="tnum text-fg">
                  {exam.pass} / {exam.questions}（{exam.passPercent}%）
                </dd>
                <dt className="text-subtle">前提</dt>
                <dd className="text-fg">
                  {exam.prereq ? `${exam.prereq.toUpperCase()} の合格` : 'なし'}
                </dd>
                <dt className="text-subtle">範囲</dt>
                <dd className="tnum text-fg">{itemsOf(exam).length} 項目</dd>
              </dl>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>出題範囲</SectionTitle>
        <div className="space-y-5">
          {SYLLABUS.exams.map((exam) => (
            <div key={exam.id}>
              <p className="mb-2 text-tiny font-medium text-muted">{exam.name}</p>
              <ul className="panel overflow-hidden rounded-lg border border-line bg-surface">
                {exam.areas.map((area) => (
                  <li key={area.id} className="border-b border-line last:border-0">
                    <div className="flex items-baseline gap-3 px-4 py-2.5">
                      {/* 比率は公式の数字。問題数の配分と模擬試験の構成に使う */}
                      <span className="tnum w-10 shrink-0 text-right text-small font-medium text-accent">
                        {Math.round(area.weight * 100)}%
                      </span>
                      <span className="min-w-0 flex-1 text-body text-fg">{area.name}</span>
                      <span className="tnum shrink-0 text-tiny text-subtle">
                        {area.groups.reduce((n, g) => n + g.items.length, 0)} 項目
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
