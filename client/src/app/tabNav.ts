import { tabOf } from './routing';

/** Самый глубокий путь, посещённый в каждой вкладке — «стек» вкладки переживает переключение
 *  на другую вкладку и обратно (ux-ui/02-shell.md: «переключение вкладки её стек не сбрасывает»). */
const lastPathByTab = new Map<string, string>();

export function rememberTabPath(pathname: string): void {
  const tab = tabOf(pathname);
  if (tab) lastPathByTab.set(tab, pathname);
}

export function lastPathForTab(tabRoot: string): string {
  return lastPathByTab.get(tabOf(tabRoot)) ?? tabRoot;
}

type ReactivateListener = () => void;

/** Повторный тап по уже активной вкладке — сигнал её экрану, а не изменение маршрута. */
const reactivateListeners = new Map<string, Set<ReactivateListener>>();

export function onTabReactivate(tabRoot: string, listener: ReactivateListener): () => void {
  const key = tabOf(tabRoot);
  let set = reactivateListeners.get(key);
  if (!set) {
    set = new Set();
    reactivateListeners.set(key, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

export function emitTabReactivate(tabRoot: string): void {
  reactivateListeners.get(tabOf(tabRoot))?.forEach((fn) => fn());
}
