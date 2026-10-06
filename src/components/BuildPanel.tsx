import { useState } from 'react';
import Diagram from '../diagram/Diagram';
import { PALETTES, FIELD_LABEL } from '../diagram/palette';
import type { ElementTool, Field, RelationTool } from '../diagram/palette';
import { RULES, findIssues, refLabel } from '../diagram/rules';
import type { Issue } from '../diagram/rules';
import { KIND_LABEL } from '../diagram/model';
import type { Model } from '../diagram/model';
import {
  addElement,
  addRelation,
  elementLabel,
  endCandidates,
  judgeBuild,
  relationText,
  removeAdded,
} from '../engine/build';
import type { Values } from '../engine/build';
import { Button } from './ui';
import { IconCheck, IconX } from './icons';

/**
 * 組み立て問題のパレット（DESIGN.md §6.3）。左に図、右にパレット。
 *
 * **図は置いた瞬間に動かす**（DESIGN.md §6.5）。置いた要素と図の箱が同時に動くこと自体が、
 * 記法を覚える仕掛けになる。妥当性の指摘は「検査」を押したときだけ出す
 * （置くたびに赤字が出ると、組み立ての途中の形が全部「誤り」に見える）。
 */

const INPUT =
  'h-9 w-full min-w-0 rounded-md border border-edge bg-raised px-2.5 text-small text-fg placeholder:text-subtle';

function FieldInputs({
  fields,
  values,
  onChange,
  parents,
}: {
  fields: Field[];
  values: Values;
  onChange: (v: Values) => void;
  parents?: { id: string; label: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((f) =>
        f === 'parent' ? (
          parents && parents.length > 0 ? (
            <label key={f} className="text-tiny font-semibold text-muted">
              {FIELD_LABEL[f].label}
              <select
                className={`${INPUT} mt-1`}
                value={values.parent ?? ''}
                onChange={(e) => onChange({ ...values, parent: e.target.value })}
              >
                <option value="">（図のいちばん外）</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} の中
                  </option>
                ))}
              </select>
            </label>
          ) : null
        ) : (
          <label key={f} className="text-tiny font-semibold text-muted">
            {FIELD_LABEL[f].label}
            <input
              className={`${INPUT} mt-1`}
              value={values[f] ?? ''}
              placeholder={FIELD_LABEL[f].placeholder}
              onChange={(e) => onChange({ ...values, [f]: e.target.value })}
              data-field={f}
            />
          </label>
        ),
      )}
    </div>
  );
}

function ToolButton({
  on,
  label,
  hint,
  onClick,
  disabled,
  testId,
}: {
  on: boolean;
  label: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      title={hint}
      data-tool={testId}
      className={`rounded-md border px-2.5 py-1.5 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-dashed border-edge bg-transparent opacity-60'
          : on
            ? 'border-accent-line bg-accent-soft'
            : 'border-edge bg-raised hover:border-accent-line'
      }`}
    >
      <span className={`block text-tiny font-bold ${on ? 'text-accent' : 'text-fg'}`}>{label}</span>
      <span className="block text-micro text-muted">{hint}</span>
    </button>
  );
}

export default function BuildPanel({
  base,
  value,
  onChange,
  answer,
  done,
}: {
  /** 土台（問題の model） */
  base: Model;
  value: Model;
  onChange: (m: Model) => void;
  /** 正解の図（採点後に出す） */
  answer?: Model;
  done: boolean;
}) {
  const palette = PALETTES[base.type];
  const [elTool, setElTool] = useState<ElementTool | null>(null);
  const [relTool, setRelTool] = useState<RelationTool | null>(null);
  const [elValues, setElValues] = useState<Values>({});
  const [relValues, setRelValues] = useState<Values>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);

  const baseIds = new Set([
    ...base.elements.map((e) => e.id),
    ...base.relations.map((r) => r.id),
    ...(base.steps ?? []).map((s) => s.id),
  ]);
  const added = [
    ...value.elements
      .filter((e) => !baseIds.has(e.id))
      .map((e) => ({ id: e.id, text: `${elementLabel(e)}（${KIND_LABEL[e.kind]}）` })),
    ...value.relations
      .filter((r) => !baseIds.has(r.id))
      .map((r) => ({ id: r.id, text: relationText(value, r) })),
    ...(value.steps ?? [])
      .filter((s) => !baseIds.has(s.id))
      .map((s) => ({ id: s.id, text: refLabel(value, s.id) })),
  ];

  const change = (m: Model) => {
    setIssues(null);
    setError(null);
    onChange(m);
  };
  const placeElement = () => {
    if (!elTool) return;
    const r = addElement(value, elTool, elValues);
    if ('error' in r) return setError(r.error);
    change(r.model);
    setElValues({});
  };
  const placeRelation = () => {
    if (!relTool) return;
    const r = addRelation(value, relTool, from, to, relValues);
    if ('error' in r) return setError(r.error);
    change(r.model);
    setRelValues({});
    setFrom('');
    setTo('');
  };

  const parentsFor = (tool: ElementTool) =>
    tool.parents
      ? value.elements
          .filter((e) => tool.parents!.includes(e.kind))
          .map((e) => ({ id: e.id, label: elementLabel(e) }))
      : undefined;
  const froms = relTool ? endCandidates(value, relTool.from) : [];
  const tos = relTool ? endCandidates(value, relTool.to) : [];
  const result = done && answer ? judgeBuild(answer, value) : null;

  return (
    <div className="space-y-4" data-testid="build">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="min-w-0 rounded-md bg-sunken p-3">
          <p className="mb-2 text-tiny font-semibold text-muted">
            {done ? 'あなたが組んだ図' : '組んでいる図（置くとすぐ描き直す）'}
          </p>
          <Diagram model={value} />
        </div>

        {!done && (
          <div className="space-y-4 rounded-md border border-edge bg-raised p-4">
            <section>
              <h3 className="mb-2 text-small font-bold text-fg">要素を置く</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {palette.elements.map((t) => (
                  <ToolButton
                    key={t.id}
                    on={elTool?.id === t.id}
                    label={t.label}
                    hint={t.hint}
                    testId={`el-${t.id}`}
                    onClick={() => {
                      setElTool(elTool?.id === t.id ? null : t);
                      setElValues({});
                      setError(null);
                    }}
                  />
                ))}
              </div>
              {elTool && (
                <div className="mt-3 space-y-2">
                  <FieldInputs
                    fields={elTool.fields}
                    values={elValues}
                    onChange={setElValues}
                    parents={parentsFor(elTool)}
                  />
                  <Button size="sm" onClick={placeElement} data-testid="place-element">
                    {elTool.label}を置く
                  </Button>
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-small font-bold text-fg">関係を引く</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {palette.relations.map((t) => (
                  <ToolButton
                    key={t.id}
                    on={relTool?.id === t.id}
                    label={t.label}
                    hint={t.hint}
                    testId={`rel-${t.id}`}
                    onClick={() => {
                      setRelTool(relTool?.id === t.id ? null : t);
                      setRelValues({});
                      setFrom('');
                      setTo('');
                      setError(null);
                    }}
                  />
                ))}
              </div>
              {relTool && (
                <div className="mt-3 space-y-2">
                  {froms.length === 0 || tos.length === 0 ? (
                    <p className="text-tiny text-muted">
                      {relTool.label}で結べる要素がまだありません。先に要素を置いてください。
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-tiny font-semibold text-muted">
                          元
                          <select
                            className={`${INPUT} mt-1`}
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            data-field="from"
                          >
                            <option value="">選ぶ</option>
                            {froms.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-tiny font-semibold text-muted">
                          先
                          <select
                            className={`${INPUT} mt-1`}
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            data-field="to"
                          >
                            <option value="">選ぶ</option>
                            {tos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <FieldInputs
                        fields={relTool.fields}
                        values={relValues}
                        onChange={setRelValues}
                      />
                      <Button size="sm" onClick={placeRelation} data-testid="place-relation">
                        {relTool.label}を引く
                      </Button>
                    </>
                  )}
                </div>
              )}
            </section>

            {palette.outOfScope.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-tiny font-semibold text-muted">
                  使えないもの（範囲外）
                </h3>
                <ul className="space-y-1">
                  {palette.outOfScope.map((o) => (
                    <li key={o.label} className="text-micro text-muted">
                      <span className="mr-1.5 rounded-xs border border-dashed border-edge px-1.5 py-0.5 font-semibold opacity-70">
                        {o.label}
                      </span>
                      {o.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-tiny text-danger"
              >
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {!done && (
        <div className="rounded-md border border-edge bg-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-small font-bold text-fg">
              置いたもの <span className="tnum text-muted">{added.length}</span>
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIssues(findIssues(value))}
              data-testid="check-build"
            >
              検査
            </Button>
          </div>
          {added.length === 0 ? (
            <p className="mt-1 text-tiny text-muted">
              まだ何も置いていません。右のパレットから置きます。
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {added.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-small text-fg">
                  <button
                    type="button"
                    onClick={() => change(removeAdded(value, x.id))}
                    className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger"
                    aria-label={`${x.text} を外す`}
                  >
                    <IconX size={13} />
                  </button>
                  {x.text}
                </li>
              ))}
            </ul>
          )}
          {issues && (
            <div className="mt-3" role="status">
              {issues.length === 0 ? (
                <p className="text-tiny font-semibold text-success">
                  図の中の食い違いは見つかりませんでした（正解かどうかは「答える」で判定します）
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {issues.map((i) => (
                    <li
                      key={`${i.at}:${i.kind}`}
                      className="rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-tiny text-fg"
                    >
                      <span className="font-bold text-warning">{RULES[i.kind].title}</span>（
                      {refLabel(value, i.at)}）
                      <span className="mt-0.5 block text-muted">{RULES[i.kind].explain}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {result && answer && (
        <div className="space-y-3">
          {(result.missing.length > 0 || result.extra.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {result.missing.length > 0 && (
                <div className="rounded-md border border-danger-line bg-danger-soft p-3">
                  <p className="text-tiny font-bold text-danger">足りないもの</p>
                  <ul className="mt-1 space-y-0.5 text-small text-fg">
                    {result.missing.map((m) => (
                      <li key={m}>・{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.extra.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft p-3">
                  <p className="text-tiny font-bold text-warning">余分なもの（正解に無い）</p>
                  <ul className="mt-1 space-y-0.5 text-small text-fg">
                    {result.extra.map((m) => (
                      <li key={m}>・{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {result.correct && (
            <p className="flex items-center gap-1.5 text-small font-bold text-success">
              <IconCheck size={15} /> 正解の図と同じモデルになっています
            </p>
          )}
          <div className="rounded-md bg-sunken p-3">
            <p className="mb-2 text-tiny font-semibold text-muted">正解の図</p>
            <Diagram model={answer} />
          </div>
        </div>
      )}
    </div>
  );
}
