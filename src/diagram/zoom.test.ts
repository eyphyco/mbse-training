import { beforeEach, describe, expect, it } from 'vitest';
import {
  ZOOM_KEY,
  ZOOM_MAX,
  ZOOM_MIN,
  anchorScroll,
  fitZoom,
  readStoredZoom,
  stepZoom,
  storeZoom,
  wheelFactor,
  isMouseWheel,
  wheelIntent,
} from './zoom';

describe('stepZoom', () => {
  it('刻みを 1 段ずつ進む', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
  });
  it('半端な値からは押した向きの次の刻みへ', () => {
    expect(stepZoom(1.37, 1)).toBe(1.5);
    expect(stepZoom(1.37, -1)).toBe(1.25);
  });
  it('端で止まる', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe('fitZoom', () => {
  it('縦横の狭い方に合わせる', () => {
    expect(fitZoom(800, 400, 400, 400)).toBe(0.5);
  });
  it('小さい図は上限で止める', () => {
    expect(fitZoom(100, 100, 1000, 1000)).toBe(2);
  });
  it('大きさが無いときは等倍', () => {
    expect(fitZoom(0, 100, 400, 400)).toBe(1);
  });
});

describe('anchorScroll', () => {
  it('指の下の点が動かない', () => {
    // 拡大前: スクロール 100 + 指 50 = 図の 150 の位置。2 倍で 300 になり、指は 50 のまま
    expect(anchorScroll(100, 50, 1, 2)).toBe(250);
  });
  it('負のスクロールにはしない', () => {
    expect(anchorScroll(0, 50, 2, 1)).toBe(0);
  });
});

describe('wheelFactor', () => {
  it('手前に回すと縮小、奥へ回すと拡大し、往復で元に戻る', () => {
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1);
  });
  it('行単位のホイールも画素に直す', () => {
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(99));
  });
});

describe('覚えておく倍率', () => {
  beforeEach(() => localStorage.clear());
  it('無ければ等倍', () => expect(readStoredZoom()).toBe(1));
  it('書いたものを読める', () => {
    storeZoom(1.5);
    expect(readStoredZoom()).toBe(1.5);
  });
  it('等倍に戻したら消す', () => {
    storeZoom(1.5);
    storeZoom(1);
    expect(localStorage.getItem(ZOOM_KEY)).toBeNull();
  });
  it('壊れた値は等倍、範囲外は端に寄せる', () => {
    localStorage.setItem(ZOOM_KEY, 'abc');
    expect(readStoredZoom()).toBe(1);
    localStorage.setItem(ZOOM_KEY, '99');
    expect(readStoredZoom()).toBe(ZOOM_MAX);
  });
});

describe('isMouseWheel', () => {
  it('120 の倍数の wheelDelta はマウス（画面の倍率で deltaY が半端でも）', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 66.67, deltaMode: 0, wheelDeltaY: -120 })).toBe(true);
  });
  it('細かい wheelDelta はトラックパッド', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 4, deltaMode: 0, wheelDeltaY: -12 })).toBe(false);
  });
  it('行単位は Firefox のマウス', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(true);
  });
  it('wheelDelta が無ければ、横成分なしで大きいものをマウスとみなす', () => {
    expect(isMouseWheel({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(true);
    expect(isMouseWheel({ deltaX: 1, deltaY: 8, deltaMode: 0 })).toBe(false);
  });
});

describe('wheelIntent', () => {
  const base = {
    modifier: false,
    mouse: true,
    full: false,
    sinceScroll: 10_000,
    zoom: 1,
    deltaY: -100,
  };
  it('図の上で手を止めてから回したら拡大縮小', () => {
    expect(wheelIntent(base)).toBe('zoom');
  });
  it('ページを送っている途中なら素通し', () => {
    expect(wheelIntent({ ...base, sinceScroll: 100 })).toBe('pass');
  });
  it('全画面ではスクロールの途中でも拡大縮小', () => {
    expect(wheelIntent({ ...base, full: true, sinceScroll: 100 })).toBe('zoom');
  });
  it('トラックパッドのスクロールは素通し、Ctrl 付きなら拡大縮小', () => {
    expect(wheelIntent({ ...base, mouse: false })).toBe('pass');
    expect(wheelIntent({ ...base, mouse: false, modifier: true })).toBe('zoom');
  });
  it('端でそれ以上変えられない向きは素通し', () => {
    expect(wheelIntent({ ...base, zoom: ZOOM_MAX, deltaY: -100 })).toBe('pass');
    expect(wheelIntent({ ...base, zoom: ZOOM_MIN, deltaY: 100 })).toBe('pass');
    expect(wheelIntent({ ...base, zoom: ZOOM_MAX, deltaY: 100 })).toBe('zoom');
  });
});
