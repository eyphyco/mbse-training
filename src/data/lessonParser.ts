/**
 * 教材の Markdown を読む。ブラウザ（Vite の ?raw）と Node（validate・coverage）の両方から使う。
 *
 * 本文を JSON の文字列に書くと、改行のエスケープで書きにくく、差分も読めない。
 * そこで章ごとに 1 枚の Markdown にして、決まった形の見出しと札だけを読む。
 *
 * ```md
 * ---
 * id: bdd
 * no: 1
 * title: ブロック定義図
 * lead: 章の狙いを 1 行で
 * diagram: bdd
 * problemsReady: true
 * ---
 *
 * ## ブロックと «block» {#bdd-block}
 * items: mu-def-usage, mu-block-features
 * figures: bdd-structure
 * term: ブロック | block | システムの構造の単位を定義するもの
 *
 * 本文（### 以下は自由）
 * ```
 *
 * 節の見出しの直後、空行までが札（items / figures / term）。term は何行でも書ける。
 * Node から import するので、消せる構文しか使わず、import には拡張子を付ける。
 */
import type { Lesson, LessonSection } from './types.ts';

export function parseLesson(src: string, file = '(lesson)'): Lesson {
  const text = src.replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error(`${file}: 先頭に --- で囲んだ札が無い`);
  const meta = new Map<string, string>();
  for (const line of fm[1].split('\n')) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m) meta.set(m[1], m[2].trim());
  }
  const need = (k: string) => {
    const v = meta.get(k);
    if (v === undefined || v === '') throw new Error(`${file}: 札「${k}」が無い`);
    return v;
  };

  const rest = text.slice(fm[0].length);
  const sections: LessonSection[] = [];
  const parts = rest.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const hm = /^(.*?)\s*\{#([\w-]+)\}$/.exec(head);
    if (!hm) throw new Error(`${file}: 節の見出しに {#id} が無い「${head}」`);
    const body = nl < 0 ? '' : part.slice(nl + 1);
    const lines = body.split('\n');
    const sec: LessonSection = { id: hm[2], title: hm[1], items: [], body_md: '', problems: [] };
    let i = 0;
    for (; i < lines.length; i += 1) {
      const l = lines[i];
      if (l.trim() === '') break;
      const m = /^(items|figures|term):\s*(.*)$/.exec(l);
      if (!m) break;
      const list = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (m[1] === 'items') sec.items = list;
      else if (m[1] === 'figures') sec.figures = list;
      else {
        const [term, reading, ...def] = m[2].split('|').map((s) => s.trim());
        sec.terms = [
          ...(sec.terms ?? []),
          { term, reading: reading || undefined, def: def.join('|') },
        ];
      }
    }
    sec.body_md = lines.slice(i).join('\n').trim();
    sections.push(sec);
  }

  return {
    id: need('id'),
    no: Number(need('no')),
    title: need('title'),
    lead: need('lead'),
    diagram: (meta.get('diagram') || undefined) as Lesson['diagram'],
    problemsReady: meta.get('problemsReady') === 'true',
    sections,
  };
}
