import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMediaFeedScope, MEDIA_LOAD_THROTTLE_MS, MEDIA_SETTLE_MS } from './mediaFeedScope';

interface FakeObserver {
  fire(entries: { target: Element; isIntersecting: boolean }[]): void;
  observed: Element[];
  unobserved: Element[];
}

let observers: FakeObserver[] = [];

class FakeIntersectionObserver {
  observed: Element[] = [];
  unobserved: Element[] = [];

  constructor(private callback: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
    observers.push(this);
  }

  observe(node: Element): void {
    this.observed.push(node);
  }

  unobserve(node: Element): void {
    this.unobserved.push(node);
  }

  disconnect(): void {}

  fire(entries: { target: Element; isIntersecting: boolean }[]): void {
    this.callback(entries);
  }
}

function tiles(count: number): HTMLElement[] {
  return Array.from({ length: count }, () => document.createElement('div'));
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('наблюдатель загрузки медиа', () => {
  it('на всю ленту заводится один наблюдатель, а не по одному на плитку', () => {
    const scope = createMediaFeedScope(document.createElement('div'))!;
    for (const node of tiles(10)) scope.observeForLoading(node, () => {});

    expect(observers).toHaveLength(1);
    expect(observers[0]!.observed).toHaveLength(10);
  });

  it('на стоящей ленте видимая плитка грузится сразу', () => {
    const scope = createMediaFeedScope(document.createElement('div'))!;
    const node = document.createElement('div');
    const onVisible = vi.fn();
    scope.observeForLoading(node, onVisible);

    observers[0]!.fire([{ target: node, isIntersecting: true }]);

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('пока лента едет, обратный вызов ждёт троттл', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const node = document.createElement('div');
    const onVisible = vi.fn();
    scope.observeForLoading(node, onVisible);

    root.dispatchEvent(new Event('scroll'));
    observers[0]!.fire([{ target: node, isIntersecting: true }]);
    vi.advanceTimersByTime(MEDIA_SETTLE_MS - 1);
    expect(onVisible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MEDIA_LOAD_THROTTLE_MS);
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('пролетевшее мимо не грузится', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const [passed, stayed] = tiles(2) as [HTMLElement, HTMLElement];
    const onPassed = vi.fn();
    const onStayed = vi.fn();
    scope.observeForLoading(passed, onPassed);
    scope.observeForLoading(stayed, onStayed);

    root.dispatchEvent(new Event('scroll'));
    observers[0]!.fire([
      { target: passed, isIntersecting: true },
      { target: stayed, isIntersecting: true },
    ]);
    observers[0]!.fire([{ target: passed, isIntersecting: false }]);
    vi.advanceTimersByTime(MEDIA_LOAD_THROTTLE_MS);

    expect(onPassed).not.toHaveBeenCalled();
    expect(onStayed).toHaveBeenCalledTimes(1);
  });

  it('остановка прокрутки грузит видимое, не дожидаясь троттла', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const node = document.createElement('div');
    const onVisible = vi.fn();
    scope.observeForLoading(node, onVisible);

    root.dispatchEvent(new Event('scroll'));
    observers[0]!.fire([{ target: node, isIntersecting: true }]);
    vi.advanceTimersByTime(MEDIA_SETTLE_MS);

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('сработавшая плитка снимается с наблюдения', () => {
    const scope = createMediaFeedScope(document.createElement('div'))!;
    const node = document.createElement('div');
    scope.observeForLoading(node, () => {});

    observers[0]!.fire([{ target: node, isIntersecting: true }]);

    expect(observers[0]!.unobserved).toEqual([node]);
  });

  it('отписка до срабатывания отменяет загрузку', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const node = document.createElement('div');
    const onVisible = vi.fn();
    const stop = scope.observeForLoading(node, onVisible);

    root.dispatchEvent(new Event('scroll'));
    observers[0]!.fire([{ target: node, isIntersecting: true }]);
    stop();
    vi.advanceTimersByTime(MEDIA_LOAD_THROTTLE_MS);

    expect(onVisible).not.toHaveBeenCalled();
  });
});

describe('остановка прокрутки', () => {
  it('движение держится, пока идут события прокрутки, и отпускает после паузы', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const settled = vi.fn();

    expect(scope.isMoving()).toBe(false);
    root.dispatchEvent(new Event('scroll'));
    expect(scope.isMoving()).toBe(true);

    scope.whenSettled(settled);
    vi.advanceTimersByTime(MEDIA_SETTLE_MS - 1);
    root.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(MEDIA_SETTLE_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    expect(scope.isMoving()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(scope.isMoving()).toBe(false);
  });

  it('отписанный слушатель не будит плитку', () => {
    const root = document.createElement('div');
    const scope = createMediaFeedScope(root)!;
    const settled = vi.fn();

    root.dispatchEvent(new Event('scroll'));
    const stop = scope.whenSettled(settled);
    stop();
    vi.advanceTimersByTime(MEDIA_SETTLE_MS);

    expect(settled).not.toHaveBeenCalled();
  });
});
