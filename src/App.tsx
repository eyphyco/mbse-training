import { useEffect, useState } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { COLLAPSE, PAGE, SLIDE } from './components/motion';
import { ToastProvider } from './components/ToastProvider';
import ThemeToggle from './components/ThemeToggle';
import ErrorBoundary from './components/ErrorBoundary';
import Search from './components/Search';
import Legend from './components/Legend';
import {
  IconAa,
  IconBook,
  IconCube,
  IconDatabase,
  IconGrid,
  IconHome,
  IconInfo,
  IconList,
  IconSliders,
  IconTimer,
} from './components/icons';
import { ProgressProvider } from './storage/ProgressProvider';
import { useProgress } from './storage/progressContext';
import Home from './pages/Home';
import Board from './pages/Board';
import Learn from './pages/Learn';
import LearnChapter from './pages/LearnChapter';
import Problems from './pages/Problems';
import ProblemPage from './pages/ProblemPage';
import Exam from './pages/Exam';
import Glossary from './pages/Glossary';
import Settings from './pages/Settings';
import Notation from './pages/Notation';

/*
  版面は WHITEBOARD（@_ryu15_ の 2 投稿の画面）に合わせる。
  浮いたガラスのヘッダ 1 本に、ロゴ・ナビ・検索・凡例・データの所在を並べる。
  経路は DESIGN.md §5 の表に合わせてある。
*/
const NAV = [
  { to: '/', label: 'ホーム', end: true, Icon: IconHome },
  { to: '/board', label: 'ボード', end: false, Icon: IconGrid },
  { to: '/learn', label: '教材', end: false, Icon: IconBook },
  { to: '/problems', label: '問題', end: false, Icon: IconList },
  { to: '/exam', label: '模擬試験', end: false, Icon: IconTimer },
  { to: '/glossary', label: '用語集', end: false, Icon: IconAa },
  { to: '/settings', label: '進捗', end: false, Icon: IconSliders },
];

function Header({ legend, onLegend }: { legend: boolean; onLegend: () => void }) {
  const { saveFailed } = useProgress();
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 lg:px-6">
      <div className="panel-chrome mx-auto flex max-w-page flex-wrap items-center gap-2 rounded-xl border border-edge px-3 py-2 lg:flex-nowrap lg:gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-2 pr-1">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-sm text-white"
            style={{ background: 'var(--g-primary)' }}
          >
            <IconCube size={18} />
          </span>
          <span className="text-body font-extrabold tracking-[0.06em] text-fg">MBSE TRAINING</span>
        </Link>

        {/* 選択中は下線ではなく丸い下地。1 つを使い回して滑らせる */}
        <nav className="order-3 -mx-1 flex w-full items-center gap-0.5 overflow-x-auto px-1 lg:order-none lg:w-auto">
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative isolate flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-small font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'text-accent' : 'text-muted hover:text-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      transition={SLIDE}
                      className="absolute inset-0 -z-10 rounded-sm bg-accent-soft ring-1 ring-accent-line"
                    />
                  )}
                  <Icon size={15} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="order-2 ml-auto flex min-w-0 items-center gap-2 lg:order-none lg:ml-0 lg:flex-1">
          <div className="hidden min-w-0 flex-1 md:block">
            <Search />
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={onLegend}
            aria-expanded={legend}
            className={`flex h-9 items-center gap-1.5 rounded-sm border px-2.5 text-small font-semibold transition-colors ${
              legend
                ? 'border-accent-line bg-accent-soft text-accent'
                : 'border-edge bg-raised text-muted hover:text-fg'
            }`}
          >
            <IconInfo size={15} />
            <span className="hidden sm:inline">凡例</span>
          </button>
          {/*
            データの所在（DESIGN.md §4.10）。ふだんは小さなアイコンにして、説明はホバー・フォーカスで出す
            （常時の赤い札は悪目立ちした。2026-10-06 の指摘）。詳しくは「進捗」（/settings）の「データ」に書いてある。
            保存に失敗しているときだけは赤い札で常に出す。気付かないとタブを閉じた時に進捗が消えるため
          */}
          {saveFailed ? (
            <span
              className="flex shrink-0 items-center gap-1.5 rounded-sm border border-danger-line bg-danger-soft px-2.5 py-1 text-micro leading-tight font-semibold text-danger"
              data-testid="data-badge"
              role="alert"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              <span>
                保存できていません
                <br />
                このタブを閉じると消えます
              </span>
            </span>
          ) : (
            <Link
              to="/settings"
              className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-edge bg-raised text-muted transition-colors hover:text-fg focus-visible:text-fg"
              aria-label="データはこの端末のブラウザにだけ保存（サーバには送らない）。「進捗」の「データ」で書き出せる"
              data-testid="data-badge"
            >
              <IconDatabase size={15} />
              <span
                role="tooltip"
                className="panel-pop pointer-events-none absolute top-full right-0 z-50 mt-2 w-60 rounded-md px-3 py-2 text-left text-tiny leading-relaxed text-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                データはこの端末のブラウザにだけ保存しています（サーバには送りません）。別の端末へ移すときは「進捗」の「データ」から書き出します。
              </span>
            </Link>
          )}
        </div>
        <div className="order-4 w-full md:hidden">
          <Search />
        </div>
      </div>
    </header>
  );
}

function Pages() {
  const location = useLocation();
  const section = location.pathname.split('/')[1] ?? '';
  /*
    画面を移ったら先頭から見せる。SPA は窓のスクロール位置を持ち越すので、
    教材の下の方からボードへ移ると、ボードも下の方から始まっていた。
    節への飛び先（#…）があるときは、飛ぶ側（教材の章）に任せる。
  */
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);
  return (
    <motion.div
      key={section}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={PAGE}
    >
      <ErrorBoundary resetKey={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/board" element={<Board />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:id" element={<LearnChapter />} />
          <Route path="/problems" element={<Problems />} />
          <Route path="/problems/:id" element={<ProblemPage />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="/settings" element={<Settings />} />
          {/* ナビには出さない。図のレンダラの見本 */}
          <Route path="/notation" element={<Notation />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </ErrorBoundary>
    </motion.div>
  );
}

function Shell() {
  const [legend, setLegend] = useState(false);
  return (
    <div className="min-h-full">
      <Header legend={legend} onLegend={() => setLegend((v) => !v)} />
      {/* 下の余白は通知の積み場の高さを足す（ToastProvider が書き出す） */}
      <main className="mx-auto w-full max-w-page px-3 pt-4 pb-[calc(2rem+var(--toast-space,0px))] sm:px-5 lg:px-6">
        <AnimatePresence initial={false}>
          {legend && (
            <motion.div
              key="legend"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={COLLAPSE}
              className="overflow-hidden"
            >
              <div className="pb-4">
                <Legend />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Pages />
      </main>
    </div>
  );
}

export default function App() {
  return (
    /* reducedMotion="user" で OS の「視差効果を減らす」に従う */
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ProgressProvider>
          {/* GitHub Pages でリロードしても 404 にならないよう HashRouter を使う */}
          <HashRouter>
            <Shell />
          </HashRouter>
        </ProgressProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
