/**
 * 線画アイコン。色は currentColor に従う。
 *
 * 線の太さは「画面上で何 px に見えるか」で決める。viewBox は 24 固定なので、
 * strokeWidth を据え置くと小さいアイコンほど線が細くなり、
 * 1px を割ったところでにじんで見える（14px なら 1.5 → 0.88px）。
 * 表示サイズで割り戻して、どの大きさでも同じ太さに見えるようにする。
 */
type IconProps = { className?: string; size?: number };

/** 画面上での線の太さ（CSS px） */
const STROKE_PX = 1.2;

function svg(path: React.ReactNode, { className = '', size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={(STROKE_PX * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => svg(<path d="m4.5 12.5 5 5 10-11" />, p);
export const IconX = (p: IconProps) => svg(<path d="M6 6l12 12M18 6 6 18" />, p);
export const IconDash = (p: IconProps) => svg(<path d="M6 12h12" />, p);
export const IconChevronDown = (p: IconProps) => svg(<path d="m5 9 7 7 7-7" />, p);
/*
  小さく出したときに崩れやすいので、他と作りを変えている。

  - 芯は塗りにする。線で描くと直径 4px 前後になったところで内側が潰れ、
    光条とつながって「※」のような塊に見えてしまう
  - 光条は長さ 2 単位（14px 表示なら 1.2px）しかなく点になっていたので、
    3.3 単位まで伸ばして芯との間を空ける
*/
export const IconSun = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2.2v3.3M12 18.5v3.3M2.2 12h3.3M18.5 12h3.3" />
      <path d="m5.05 5.05 2.35 2.35M16.6 16.6l2.35 2.35M18.95 5.05 16.6 7.4M7.4 16.6l-2.35 2.35" />
    </>,
    p,
  );
export const IconMoon = (p: IconProps) =>
  svg(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />, p);
export const IconMonitor = (p: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
    </>,
    p,
  );
export const IconPlay = (p: IconProps) => svg(<path d="M7 4.5 19 12 7 19.5v-15Z" />, p);
export const IconChevronLeft = (p: IconProps) => svg(<path d="m14.5 5-7 7 7 7" />, p);
export const IconChevronRight = (p: IconProps) => svg(<path d="m9.5 5 7 7-7 7" />, p);
export const IconDatabase = (p: IconProps) =>
  svg(
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-13" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>,
    p,
  );
export const IconBulb = (p: IconProps) =>
  svg(
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45.95 1.1.95 1.8V16h5.1v-.3c0-.7.35-1.35.95-1.8A6 6 0 0 0 12 3Z" />
    </>,
    p,
  );
export const IconBook = (p: IconProps) =>
  svg(
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" />
    </>,
    p,
  );
export const IconDownload = (p: IconProps) =>
  svg(<path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16" />, p);
export const IconUpload = (p: IconProps) =>
  svg(<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 20h16" />, p);
export const IconTrash = (p: IconProps) =>
  svg(
    <>
      <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6m3-6v6" />
    </>,
    p,
  );
export const IconLayers = (p: IconProps) =>
  svg(<path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Zm8.5 9L12 16.5 3.5 12m17 4.5L12 21l-8.5-4.5" />, p);
export const IconTable = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M9.5 9.5v10" />
    </>,
    p,
  );
export const IconSearch = (p: IconProps) =>
  svg(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>,
    p,
  );

/* --- 画面のナビ・操作 ------------------------------------------------ */
export const IconGrid = (p: IconProps) =>
  svg(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>,
    p,
  );
export const IconHome = (p: IconProps) =>
  svg(<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />, p);
export const IconList = (p: IconProps) =>
  svg(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />, p);
export const IconTimer = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 2M9.5 2.5h5" />
    </>,
    p,
  );
export const IconAa = (p: IconProps) =>
  svg(
    <path d="m3 18 4.5-12L12 18M4.7 13.5h5.6M15 12.5a3 3 0 1 1 0 5.5 3 3 0 0 1 0-5.5Zm3 0V18" />,
    p,
  );
export const IconSliders = (p: IconProps) =>
  svg(<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4.5v5M8 14.5v5" />, p);
export const IconFilter = (p: IconProps) => svg(<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5Z" />, p);
export const IconInfo = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>,
    p,
  );
export const IconPlus = (p: IconProps) => svg(<path d="M12 5v14M5 12h14" />, p);
export const IconSparkle = (p: IconProps) =>
  svg(
    <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9L12 3.5Z" />,
    p,
  );
export const IconNote = (p: IconProps) =>
  svg(
    <>
      <path d="M5 4h14v11l-5 5H5V4Z" />
      <path d="M14 20v-5h5" />
    </>,
    p,
  );
export const IconHistory = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
    </>,
    p,
  );
export const IconCube = (p: IconProps) =>
  svg(
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>,
    p,
  );

/* --- 図種（札の左のタイル。WHITEBOARD のサムネイルの代わり。DESIGN.md §4.11） ---- */
const DIAGRAM_GLYPH: Record<string, React.ReactNode> = {
  // bdd: 区画のある箱と、ひし形の線
  bdd: (
    <>
      <rect x="6" y="3" width="12" height="9" rx="1" />
      <path d="M6 7h12M12 12v3.5" />
      <path d="m12 15.5 1.6 1.8L12 19l-1.6-1.7z" fill="currentColor" />
      <rect x="8.5" y="19" width="7" height="2.5" rx=".5" />
    </>
  ),
  // ibd: 枠の中の 2 つの箱と線
  ibd: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
      <rect x="5" y="9" width="5" height="6" rx=".5" />
      <rect x="14" y="9" width="5" height="6" rx=".5" />
      <path d="M10 12h4" />
    </>
  ),
  // par: 角丸の箱と縁の四角
  par: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="4" />
      <rect x="2.5" y="10.5" width="3" height="3" />
      <rect x="18.5" y="10.5" width="3" height="3" />
    </>
  ),
  // pkg: フォルダ
  pkg: <path d="M3 7.5V19h18V7.5H11L9.5 5H3v2.5h18" />,
  // req: «requirement» の箱と文
  req: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M7.5 8h9M7.5 12h9M7.5 16h5" />
    </>
  ),
  // uc: 楕円と棒人間
  uc: (
    <>
      <ellipse cx="15.5" cy="12" rx="6" ry="3.8" />
      <circle cx="4.5" cy="7" r="1.8" />
      <path d="M4.5 9v6M2 11.5h5M4.5 15l-2 4M4.5 15l2 4" />
    </>
  ),
  // act: 開始 → 角丸 → 終了
  act: (
    <>
      <circle cx="12" cy="3.8" r="1.6" fill="currentColor" />
      <rect x="6" y="8" width="12" height="6" rx="3" />
      <path d="M12 5.5V8M12 14v3" />
      <circle cx="12" cy="19.5" r="2.4" />
      <circle cx="12" cy="19.5" r="1.1" fill="currentColor" />
    </>
  ),
  // stm: 2 つの状態と遷移
  stm: (
    <>
      <rect x="2.5" y="5" width="8" height="6" rx="2.5" />
      <rect x="13.5" y="13" width="8" height="6" rx="2.5" />
      <path d="M10.5 8h4.5v5m-1.6-1.8L15 13l1.6-1.8" />
    </>
  ),
  // sd: ライフラインとメッセージ
  sd: (
    <>
      <rect x="2.5" y="3" width="7" height="4" rx=".5" />
      <rect x="14.5" y="3" width="7" height="4" rx=".5" />
      <path d="M6 7v14M18 7v14" strokeDasharray="2 2" />
      <path d="M6 12h12m-2-1.6L18 12l-2 1.6" />
    </>
  ),
  // map: 方位
  map: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
};

export function IconDiagram({ kind, ...p }: IconProps & { kind: string }) {
  return svg(DIAGRAM_GLYPH[kind] ?? DIAGRAM_GLYPH.map, p);
}
