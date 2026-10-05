import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'motion/react';
import { PAGE, SLIDE } from './components/motion';
import { ToastProvider } from './components/ToastProvider';
import ThemeToggle from './components/ThemeToggle';
import ErrorBoundary from './components/ErrorBoundary';
import { IconLayers } from './components/icons';
import Home from './pages/Home';
import Notation from './pages/Notation';

/*
  骨格だけ。中身は DESIGN.md §13 の順で入れていく。
  経路は DESIGN.md §5 の表に合わせてある。
*/
const NAV = [
  { to: '/', label: 'ホーム', end: true },
  { to: '/board', label: '範囲', end: false },
  { to: '/learn', label: '教材', end: false },
  { to: '/problems', label: '問題', end: false },
  { to: '/exam', label: '模擬試験', end: false },
  { to: '/settings', label: '進捗', end: false },
];

function Header() {
  return (
    <header className="panel-chrome sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-page items-center gap-2 px-3 sm:gap-6 sm:px-5 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-body font-semibold tracking-tight text-fg"
        >
          <IconLayers size={17} className="text-accent" />
          <span className="hidden sm:inline">MBSE Training</span>
          <span className="sr-only sm:hidden">MBSE Training</span>
        </Link>
        {/* 選択中は下線ではなく丸い下地。1 つを使い回して滑らせる */}
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative isolate flex h-8 items-center rounded-full px-2 text-small whitespace-nowrap transition-colors sm:px-2.5 sm:text-body ${
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
                      className="absolute inset-0 -z-10 rounded-full bg-accent-soft ring-1 ring-accent-line"
                    />
                  )}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** まだ無い画面。何が入る予定かを書いておく（空白に意味を持たせる） */
function Planned({ title, note }: { title: string; note: string }) {
  return (
    <div className="panel rounded-lg border border-dashed border-line bg-surface p-8 text-center">
      <h1 className="text-lead font-semibold tracking-tight text-fg">{title}</h1>
      <p className="mt-2 text-small leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function Pages() {
  const location = useLocation();
  const section = location.pathname.split('/')[1] ?? '';
  return (
    <motion.div key={section} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={PAGE}>
      <ErrorBoundary resetKey={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          {/* ナビには出さない。ボードの「図」タブができたらそこへ吸収する */}
          <Route path="/notation" element={<Notation />} />
          <Route
            path="/board"
            element={
              <Planned title="出題範囲ボード" note="DESIGN.md §4.2。範囲を定着度で並べる。" />
            }
          />
          <Route
            path="/learn"
            element={<Planned title="教材" note="DESIGN.md §7。章 0「地図」から。" />}
          />
          <Route
            path="/problems"
            element={
              <Planned title="問題" note="DESIGN.md §6。図を読む・誤りを見つける・組み立てる。" />
            }
          />
          <Route
            path="/exam"
            element={
              <Planned title="模擬試験" note="EXAM.md §5。本番は 90 問・日本語で 120〜135 分。" />
            }
          />
          <Route
            path="/settings"
            element={<Planned title="進捗" note="エクスポート / インポート / リセット。" />}
          />
          <Route path="*" element={<Home />} />
        </Routes>
      </ErrorBoundary>
    </motion.div>
  );
}

export default function App() {
  return (
    /* reducedMotion="user" で OS の「視差効果を減らす」に従う */
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        {/* GitHub Pages でリロードしても 404 にならないよう HashRouter を使う */}
        <HashRouter>
          <div className="min-h-full">
            <Header />
            {/* 下の余白は通知の積み場の高さを足す（ToastProvider が書き出す） */}
            <main className="mx-auto w-full max-w-page px-5 pt-8 pb-[calc(2rem+var(--toast-space,0px))] lg:px-8">
              <Pages />
            </main>
          </div>
        </HashRouter>
      </ToastProvider>
    </MotionConfig>
  );
}
