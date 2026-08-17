import { matchPath } from 'react-router-dom';

/** Корневые маршруты вкладок таб-бара — в этом порядке они и рисуются. */
export const TAB_ROOTS = ['/chats', '/contacts', '/settings', '/profile'] as const;
export type TabRoot = (typeof TAB_ROOTS)[number];

/** Хвостовой слэш для react-router — не различие: `<Route path="/chats">` матчит и `/chats/`,
 *  то есть `/chats/` рисует ровно тот же экран списка. А вот сравнения по строкам ниже
 *  (`parentPathOf(from) === to`) на нём спотыкались: `/chats/` не равен `/chats`, родитель у
 *  него не находился, и возврат из чата на такой адрес классифицировался как переход «вглубь»
 *  — список въезжал справа поверх чата, а чат уезжал влево и притемнялся (баг «выход по
 *  аппаратной кнопке “назад” анимируется как вход»). Нормализуем на входе во все функции. */
function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Вложенные маршруты и их «родитель» — на этом держится и свайп «назад», и подсказка
 *  ScreenStack, в какую сторону анимировать переход. Список соответствует карте маршрутов
 *  из ux-ui/02-shell.md; экраны, которых ещё нет, всё равно должны здесь фигурировать. */
function staticParent(pathname: string): string | null {
  if (pathname === '/settings/appearance') return '/settings';
  if (pathname === '/settings/developer') return '/settings';
  if (pathname === '/settings/developer/call-trace') return '/settings/developer';
  return null;
}

/** Родительский путь для вложенного экрана, или null для корня вкладки/несвязанного пути. */
export function parentPathOf(pathname: string): string | null {
  const path = normalize(pathname);

  const chatInfo = matchPath('/chats/:chatId/info', path);
  if (chatInfo) return `/chats/${chatInfo.params.chatId}`;

  const chat = matchPath('/chats/:chatId', path);
  if (chat) return '/chats';

  const contact = matchPath('/contacts/:userId', path);
  if (contact) return '/contacts';

  return staticParent(path);
}

/** Лента одного чата — единственный экран, где полоса свайпа «назад» у левого края
 *  (ScreenStack) отдаёт разбор жеста строке сообщения вместо того, чтобы владеть им
 *  безусловно (ux-ui.md, журнал, этап 6: арбитраж по направлению первого движения). */
export function isChatFeedPath(pathname: string): boolean {
  return matchPath('/chats/:chatId', normalize(pathname)) !== null;
}

/** Первый сегмент пути — вкладка, которой принадлежит экран. */
export function tabOf(pathname: string): string {
  return normalize(pathname).split('/')[1] ?? '';
}

export function isTabRoot(pathname: string): boolean {
  return (TAB_ROOTS as readonly string[]).includes(normalize(pathname));
}

export type TransitionKind = 'push' | 'pop' | 'tab-forward' | 'tab-back';

/** Буквально из референса (Pulse Messenger.dc.html, renderVals/pick): смена вкладки —
 *  боковой сдвиг на 76px, направление — по порядку вкладок в таб-баре; переход к
 *  вложенному экрану — «вглубь» (rootShift + chatIn), возврат — зеркально.
 *
 *  `ambiguous` — чем разрешать пару, в которой родство не читается по самим путям (ни один
 *  не родитель другого). Форма пути про это ничего не знает, а вот навигация знает: шаг по
 *  истории назад (аппаратная кнопка «назад», popstate) — это всегда «наружу», сколько бы
 *  сегментов ни было в адресе. Раньше здесь стояло безусловное `push`, и любой такой шаг
 *  назад проигрывался как вход вглубь: приходящий экран наезжал справа, уходящий сдвигался
 *  влево и притемнялся — то есть ровно наоборот. */
export function transitionKind(from: string, to: string, ambiguous: 'push' | 'pop'): TransitionKind {
  const fromPath = normalize(from);
  const toPath = normalize(to);
  const fromTab = tabOf(fromPath);
  const toTab = tabOf(toPath);
  if (fromTab !== toTab) {
    const fromIndex = (TAB_ROOTS as readonly string[]).indexOf(`/${fromTab}`);
    const toIndex = (TAB_ROOTS as readonly string[]).indexOf(`/${toTab}`);
    return toIndex > fromIndex ? 'tab-forward' : 'tab-back';
  }
  if (parentPathOf(toPath) === fromPath) return 'push';
  if (parentPathOf(fromPath) === toPath) return 'pop';
  return ambiguous;
}
