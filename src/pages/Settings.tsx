import { useRef, useState } from 'react';
import { Button, Card, SectionTitle } from '../components/ui';
import { IconDownload, IconTrash, IconUpload } from '../components/icons';
import { useProgress } from '../storage/progressContext';
import { normalize } from '../storage/progress';
import { INTERVALS, P90_DAYS } from '../storage/srs';
import type { IntervalMode } from '../storage/srs';
import { useToast } from '../components/toastContext';

/**
 * 進捗（DESIGN.md §5）。試験日・間隔・導入ペースの設定と、データの出し入れ。
 * データはこのブラウザにしか無いので、書き出しが唯一の控えになる。
 */
export default function Settings() {
  const { data, setSettings, replace, reset } = useProgress();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const s = data.settings;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mbse-training-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const next = normalize(JSON.parse(await file.text()));
      replace(next);
      notify({
        tone: 'success',
        text: '読み込みました',
        detail: `${Object.keys(next.items).length} 項目の定着度・${next.history.length} 件の記録`,
      });
    } catch {
      notify({
        tone: 'danger',
        text: '読み込めませんでした',
        detail: 'このアプリが書き出した JSON を選んでください',
      });
    }
  };

  return (
    <div className="mx-auto max-w-prose-wide space-y-4">
      <Card className="p-5 sm:p-6">
        <h1 className="text-display font-bold tracking-tight text-fg">進捗と設定</h1>
        <p className="mt-2 text-small text-muted">
          記録はこのブラウザの中だけにあります。サーバには送りません。
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle>試験日と学習の間隔</SectionTitle>
        <label className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-center">
          <span className="text-small font-semibold text-fg">試験日</span>
          <input
            type="date"
            value={s.examDate ?? ''}
            onChange={(e) => setSettings({ examDate: e.target.value || null })}
            className="h-10 rounded-md border border-edge bg-raised px-3 text-small text-fg"
            data-testid="exam-date"
          />
        </label>
        <fieldset className="grid gap-1.5 sm:grid-cols-[10rem_1fr]">
          <legend className="sr-only">間隔</legend>
          <span className="text-small font-semibold text-fg">間隔</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(INTERVALS) as IntervalMode[]).map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-md border p-3 ${s.mode === m ? 'border-accent-line bg-accent-soft' : 'border-edge bg-raised'}`}
              >
                <input
                  type="radio"
                  name="mode"
                  className="sr-only"
                  checked={s.mode === m}
                  onChange={() => setSettings({ mode: m })}
                />
                <span className="block text-small font-bold text-fg">
                  {m === 'standard' ? '標準（1 年向け）' : '詰め（半年向け）'}
                </span>
                <span className="tnum block text-tiny text-muted">
                  {INTERVALS[m].join('-')} 日 ・ 9 割が定着するまで {P90_DAYS[m]} 日
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-center">
          <span className="text-small font-semibold text-fg">新しい項目</span>
          <span className="flex items-center gap-2 text-small text-fg">
            <select
              value={s.paceDays}
              onChange={(e) => setSettings({ paceDays: Number(e.target.value) })}
              className="h-10 rounded-md border border-edge bg-raised px-2 text-small text-fg"
            >
              {[1, 2, 3, 4, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d} 日
                </option>
              ))}
            </select>
            に 1 項目を始める
          </span>
        </label>
        <p className="text-tiny leading-relaxed text-muted">
          1 年なら「標準 / 3 日に 1 項目」、半年なら「詰め / 1 日に 1 項目」（EXAM.md §2.4
          で回した結果）。 試験日を入れると、ホームに間に合うかどうかが出ます。
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle>データ</SectionTitle>
        <p className="text-small leading-relaxed text-fg">
          進捗はこの端末のブラウザ（localStorage）にだけ保存しています。サーバには送らず、ログインもありません。
          別の端末やブラウザへ移すときは、下の「書き出す」で JSON にして、移った先で「読み込む」。
          ブラウザのサイトデータを消すと進捗も消えるので、ときどき書き出しておくと安心です。
        </p>
        <p className="tnum text-small text-muted">
          定着度 {Object.keys(data.items).length} 項目 ・ 解いた記録 {data.history.length} 件 ・
          メモ {Object.values(data.memos).reduce((n, m) => n + m.length, 0)} 件 ・ 模擬試験{' '}
          {data.exams.length} 回
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>
            <IconDownload size={15} /> 書き出す（JSON）
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <IconUpload size={15} /> 読み込む
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
          {!confirm ? (
            <Button variant="danger" onClick={() => setConfirm(true)}>
              <IconTrash size={15} /> すべて消す
            </Button>
          ) : (
            <span className="flex items-center gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-1.5 text-small text-danger">
              定着度・記録・メモがすべて消えます。
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                消す
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                やめる
              </Button>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
