import { afterEach, describe, expect, it } from 'vitest';

import { scrollParentOf } from './scrollParent';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('поиск прокручиваемого предка', () => {
  it('находит ближайший скроллер, а не первого попавшегося предка', () => {
    const host = mount('<div id="outer"><div id="inner"><span id="target"></span></div></div>');
    const outer = host.querySelector<HTMLElement>('#outer')!;
    const inner = host.querySelector<HTMLElement>('#inner')!;
    outer.style.overflowY = 'auto';
    inner.style.overflowY = 'auto';

    expect(scrollParentOf(host.querySelector('#target'))).toBe(inner);
  });

  it('пропускает предков с обрезкой без прокрутки', () => {
    const host = mount('<div id="scroller"><div id="clip"><span id="target"></span></div></div>');
    const scroller = host.querySelector<HTMLElement>('#scroller')!;
    host.querySelector<HTMLElement>('#clip')!.style.overflow = 'hidden';
    scroller.style.overflowY = 'scroll';

    expect(scrollParentOf(host.querySelector('#target'))).toBe(scroller);
  });

  it('без своего скроллера отдаёт null — наблюдатель работает от вьюпорта', () => {
    const host = mount('<div><span id="target"></span></div>');

    expect(scrollParentOf(host.querySelector('#target'))).toBeNull();
  });

  it('body и html скроллером не считаются', () => {
    const host = mount('<span id="target"></span>');
    document.body.style.overflowY = 'auto';

    expect(scrollParentOf(host.querySelector('#target'))).toBeNull();
    document.body.style.overflowY = '';
  });

  it('без узла отдаёт null', () => {
    expect(scrollParentOf(null)).toBeNull();
  });
});
