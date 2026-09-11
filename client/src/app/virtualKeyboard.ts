type NavigatorWithVirtualKeyboard = Navigator & {
  virtualKeyboard?: { overlaysContent: boolean };
};

function keyboardHeight(viewport: VisualViewport): number {
  return Math.max(0, window.innerHeight - viewport.height * viewport.scale);
}

function occludedEditable(height: number): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  const editable =
    active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  if (!editable) return null;
  return active.getBoundingClientRect().bottom > window.innerHeight - height ? active : null;
}

export function initVirtualKeyboard(): void {
  const keyboard = (navigator as NavigatorWithVirtualKeyboard).virtualKeyboard;
  if (keyboard) keyboard.overlaysContent = true;

  const viewport = window.visualViewport;
  if (!viewport) return;

  let published = -1;
  const publish = (): void => {
    const height = Math.round(keyboardHeight(viewport));
    if (height === published) return;
    published = height;
    document.documentElement.style.setProperty('--keyboard-h', `${height}px`);
    if (height === 0) return;
    window.scrollTo(0, 0);
    occludedEditable(height)?.scrollIntoView({ block: 'center' });
  };

  viewport.addEventListener('resize', publish);
  viewport.addEventListener('scroll', publish);
  publish();
}
