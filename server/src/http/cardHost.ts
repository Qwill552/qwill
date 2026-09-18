import { createReadStream } from 'node:fs';

import { Router, type NextFunction, type Request, type Response } from 'express';

import { env } from '../config/env.js';
import { buildCardCsp, buildPreviewCardCsp } from '../lib/cardCsp.js';
import { getProfileFontFaceCss, resolveProfileFontPath } from '../lib/profileFonts.js';
import { findCardImageForServing } from '../services/cardImages.js';
import { findPreview, findVisibleCard } from '../services/profileCard.js';
import { cardAssetLimiter, cardViewLimiter } from './middleware/rateLimit.js';

/**
 * Домен песочницы визиток. Подключается по совпадению заголовка Host **до** cookie-parser,
 * CORS и всей цепочки аутентификации: маршруты отсюда не имеют доступа к сессии и не читают
 * куки. Соблазн «пусть визитка узнает, кто её смотрит» — ровно та дыра, которую вся
 * конструкция закрывает (R-30).
 */
export const cardHostRouter: Router = Router();

function isCardHostRequest(req: Request): boolean {
  const host = req.headers.host;
  return typeof host === 'string' && host.toLowerCase() === env.cardHost.toLowerCase();
}

/** Подключается первым в createApp: на чужом Host просто отходит в сторону. */
export function cardHostMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isCardHostRequest(req)) {
    next();
    return;
  }
  cardHostRouter(req, res, next);
}

/**
 * Отзыв «кадр жив». У непрозрачного origin `event.origin` равен строке "null", проверять
 * источник сообщения бессмысленно — поэтому родитель передаёт сюда порт `MessageChannel`
 * и слушает только свой конец. Через порт не ходит ничего, кроме этого сигнала: токены и
 * данные приложения внутрь кадра не передаются никогда (R-30, Граница 1).
 */
const READY_BOOTSTRAP =
  "addEventListener('message',function(e){" +
  "var p=e.ports&&e.ports[0];" +
  "if(p&&e.data&&e.data.type==='card-init')p.postMessage({type:'ready'});" +
  '});';

/** Документ собирается сервером вокруг пользовательского HTML — своим `<head>`, куда
 *  впоследствии встанет блок `@font-face`. Пользовательский код идёт телом и своих
 *  `<meta>`/`<base>` иметь не может: их вырезал санитайзер при сохранении. */
function renderCardDocument(html: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Оформление профиля</title>
<style>html,body{margin:0;padding:0;}${getProfileFontFaceCss(html)}</style>
<script>${READY_BOOTSTRAP}</script>
</head>
<body>
${html}
</body>
</html>
`;
}

function sendCardDocument(res: Response, csp: string, html: string, cacheable: boolean): void {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Адрес несёт версию (?v=…), поэтому пять минут кэша визитке не вредят; у пустого
  // документа версии нет, и он не кэшируется вовсе — иначе снятый рубильник не подействует.
  res.setHeader('Cache-Control', cacheable ? 'private, max-age=300' : 'no-store');
  res.status(200).send(renderCardDocument(html));
}

cardHostRouter.get('/c/preview/:token/', cardViewLimiter, (req, res, next) => {
  const preview = findPreview(String(req.params.token ?? ''));
  if (!preview) {
    next();
    return;
  }
  sendCardDocument(res, buildPreviewCardCsp(String(req.params.token ?? '')), preview.html, false);
});

cardHostRouter.get('/c/:userId/', cardViewLimiter, (req, res, next) => {
  const userId = String(req.params.userId ?? '');
  findVisibleCard(userId)
    .then((card) => sendCardDocument(res, buildCardCsp(userId), card?.html ?? '', card !== null))
    .catch(next);
});

/** Заголовки ставятся только после того, как файл действительно открылся: строка в базе
 *  без файла на диске иначе уходила бы с заголовками картинки и статусом 404. */
function sendAsset(
  res: Response,
  next: NextFunction,
  filePath: string,
  mime: string,
  cacheControl: string,
  cors = false,
): void {
  const stream = createReadStream(filePath);
  stream.on('error', () => next());
  stream.on('open', () => {
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', cacheControl);
    if (cors) res.setHeader('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  });
}

/**
 * Папка картинок этого пользователя. Никакой аутентификации здесь нет и быть не может —
 * документ визитки живёт в непрозрачном origin и куки не носит. Изоляция держится на CSP:
 * `img-src` документа указывает ровно на `/c/<его id>/img/`, и чужой адрес браузер не
 * запросит вовсе (R-30, Граница 2).
 */
cardHostRouter.get('/c/preview/:token/img/:name', cardAssetLimiter, (req, res, next) => {
  const preview = findPreview(String(req.params.token ?? ''));
  if (!preview) {
    next();
    return;
  }

  findCardImageForServing(preview.userId, String(req.params.name ?? ''))
    .then((image) => {
      if (!image) {
        next();
        return;
      }
      sendAsset(res, next, image.path, image.mime, 'no-store');
    })
    .catch(next);
});

cardHostRouter.get('/c/:userId/img/:name', cardAssetLimiter, (req, res, next) => {
  const userId = String(req.params.userId ?? '');
  const name = String(req.params.name ?? '');

  findCardImageForServing(userId, name)
    .then((image) => {
      if (!image) {
        next();
        return;
      }
      sendAsset(res, next, image.path, image.mime, 'public, max-age=300');
    })
    .catch(next);
});

/**
 * Шрифт — единственный ресурс визитки, которому нужен CORS-заголовок. Документ живёт в
 * песочнице без `allow-same-origin`, то есть его origin — «null», а браузер грузит шрифты
 * из `@font-face` всегда в режиме CORS (в отличие от картинок, которые идут no-CORS и
 * поэтому работали всегда). Запрос из «null» на этот же хост для браузера межсайтовый, и
 * без заголовка он отбрасывается уже после успешной проверки CSP — с невнятным
 * «A network error occurred» и без сообщения о нарушении политики.
 *
 * Звёздочка здесь безопасна: файлы шрифтов публичны, на домене песочницы нет ни API, ни
 * куки (роутер подключается до cookie-parser), а `*` вдобавок запрещает запросы с
 * учётными данными.
 */
cardHostRouter.get('/fonts/:file', cardAssetLimiter, (req, res, next) => {
  const filePath = resolveProfileFontPath(String(req.params.file ?? ''));
  if (!filePath) {
    next();
    return;
  }
  sendAsset(res, next, filePath, 'font/woff2', 'public, max-age=86400', true);
});

/** Всё остальное на этом домене — не существует. Отдаём простой текст, а не JSON API:
 *  на домене песочницы никакого API нет и быть не должно. */
cardHostRouter.use((_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(404).send('Not found');
});
