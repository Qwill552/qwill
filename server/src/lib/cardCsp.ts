import { env } from '../config/env.js';

/**
 * CSP документа визитки. Собирается под каждого пользователя отдельно: `img-src` и `media-src`
 * указывают на путь его собственной папки, и браузер отказывает в загрузке чужой картинки
 * ещё до запроса. Это принудительная изоляция папок, а не договорённость (R-30, Граница 2).
 *
 * `sandbox allow-scripts` в самом заголовке дублирует атрибут `<iframe sandbox>` — он и
 * защищает от прямого открытия адреса визитки в отдельной вкладке, где никакого атрибута нет.
 * Внешних доменов в списке нет ни одного: автор визитки физически не может узнать IP зрителя.
 */
export function buildCardCsp(userId: string): string {
  return cspWithImages(`${env.CARD_ORIGIN}/c/${userId}/img/`);
}

/**
 * Предпросмотр живёт по адресу `/c/preview/<токен>/`, и относительный `img/кот.png` внутри
 * него разрешается в `/c/preview/<токен>/img/кот.png`, а не в папку автора. Поэтому и CSP,
 * и маршрут раздачи у предпросмотра свои — иначе картинки не покажутся именно там, где их
 * и проверяют перед сохранением (R-30C).
 */
export function buildPreviewCardCsp(token: string): string {
  return cspWithImages(`${env.CARD_ORIGIN}/c/preview/${token}/img/`);
}

function cspWithImages(ownImages: string): string {
  return [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'unsafe-inline'",
    `img-src ${ownImages} data: blob:`,
    `media-src ${ownImages} data: blob:`,
    `font-src ${env.CARD_ORIGIN}/fonts/`,
    "connect-src 'none'",
    'worker-src blob:',
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    `frame-ancestors ${env.APP_ORIGIN}`,
  ].join('; ');
}
