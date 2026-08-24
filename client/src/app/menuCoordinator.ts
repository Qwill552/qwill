let openId: string | null = null;
let openClose: (() => void) | null = null;

/**
 * Одновременно открытым может быть только одно всплывающее меню (ux-ui/14-desktop/04-main-menu.md,
 * пункт «Поведение»): на десктопе обе колонки монтированы разом, и ☰-меню списка чатов, и меню
 * «ещё» шапки чата — независимые React-деревья с собственным состоянием, так что взаимное
 * закрытие не появляется само по себе, а координируется этим модулем.
 */
export function registerMenuOpen(id: string, close: () => void): void {
  if (openId !== null && openId !== id) openClose?.();
  openId = id;
  openClose = close;
}

export function unregisterMenuOpen(id: string): void {
  if (openId === id) {
    openId = null;
    openClose = null;
  }
}
