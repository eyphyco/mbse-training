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
