import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type ChildNode = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];

/** Теги, которые вырезаются вместе с содержимым: каждый из них — либо способ переопределить
 *  политику документа, либо способ втащить внутрь ещё один контекст исполнения. */
const FORBIDDEN_TAGS = new Set([
  'meta',
  'base',
  'link',
  'iframe',
  'object',
  'embed',
  'frame',
  'frameset',
  'portal',
  'form',
  'applet',
]);

/** Атрибуты, значение которых браузер разрешает по адресу. Схема в них проверяется отдельно. */
const URL_ATTRIBUTES = new Set([
  'src',
  'href',
  'action',
  'formaction',
  'data',
  'poster',
  'background',
  'cite',
  'ping',
  'longdesc',
  'usemap',
  'xlink:href',
]);

const IMAGE_PATH_PREFIX = 'img/';

/** Пробельные, управляющие и невидимые символы внутри адреса браузер выбрасывает сам:
 *  `java\tscript:` он читает как `javascript:`. Поэтому и сравнение идёт по строке, из
 *  которой они выброшены, — иначе проверка схемы обходится одним табом. */
function isIgnorableUrlChar(code: number): boolean {
  if (code <= 0x20 || code === 0x7f) return true;
  if (code >= 0x200b && code <= 0x200d) return true;
  return code === 0xfeff;
}

function normalizeUrlValue(rawValue: string): string {
  let normalized = '';
  for (const char of rawValue) {
    if (!isIgnorableUrlChar(char.codePointAt(0) ?? 0)) normalized += char;
  }
  return normalized.toLowerCase();
}

/** Относительный путь разрешён только внутрь своей папки картинок. Ни ведущего слэша,
 *  ни `..` — иначе визитка Васи полезет в папку Пети, и полагаться на одну лишь CSP
 *  в этом месте не хочется. */
function isOwnImagePath(value: string): boolean {
  if (!value.startsWith(IMAGE_PATH_PREFIX)) return false;
  return !value.split('/').includes('..');
}

function isAllowedUrlValue(rawValue: string): boolean {
  const value = normalizeUrlValue(rawValue);
  if (value === '') return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('data:')) return true;
  // Всё, что не data:, но имеет схему или начинается с `//`, ведёт наружу.
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/.test(value)) return false;
  return isOwnImagePath(value);
}

/** `srcset` — список источников через запятую, каждый со своим дескриптором. Достаточно
 *  одного внешнего адреса, чтобы выбросить атрибут целиком: чинить его по частям значит
 *  писать разбор запятых внутри `data:`-адресов, чего эта задача не стоит. */
function isAllowedSrcset(rawValue: string): boolean {
  const candidates = rawValue
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
  return candidates.length > 0 && candidates.every(isAllowedUrlValue);
}

/** `url(...)` внутри стиля — тот же выход наружу, только записанный иначе; `@import` —
 *  он же, но ещё и с приоритетом над остальными правилами. Разбирается и инлайновый
 *  `style=`, и содержимое `<style>`. */
function sanitizeCss(css: string): string {
  const withoutImports = css.replace(/@import[^;{}]*(?:;|(?=\{))/gi, '');
  return withoutImports.replace(
    /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi,
    (match: string, _quote: string, url: string) => (isAllowedUrlValue(url) ? match : 'url()'),
  );
}

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node;
}

function hasChildren(node: ChildNode): node is ChildNode & ParentNode {
  return 'childNodes' in node;
}

function removeNode(node: ChildNode): void {
  const parent = node.parentNode;
  if (!parent) return;
  parent.childNodes = parent.childNodes.filter((child) => child !== node);
  node.parentNode = null;
}

function sanitizeElement(element: Element): void {
  const tagName = element.tagName.toLowerCase();

  if (FORBIDDEN_TAGS.has(tagName)) {
    removeNode(element);
    return;
  }

  if (tagName === 'input') {
    const type = element.attrs.find((attr) => attr.name.toLowerCase() === 'type');
    if (type && normalizeUrlValue(type.value) === 'password') {
      removeNode(element);
      return;
    }
  }

  element.attrs = element.attrs.filter((attr) => {
    const name = attr.name.toLowerCase();

    // Автостарт звука при открытии чужого профиля — не безопасность, а уважение к зрителю.
    if (name === 'autoplay' && (tagName === 'audio' || tagName === 'video')) return false;

    if (name === 'style') {
      attr.value = sanitizeCss(attr.value);
      return true;
    }

    if (name === 'srcset' || name === 'imagesrcset') return isAllowedSrcset(attr.value);
    // Внешний скрипт — единственный вид скрипта, который вырезается: инлайновые разрешены.
    if (URL_ATTRIBUTES.has(name)) return isAllowedUrlValue(attr.value);

    return true;
  });

  if (tagName === 'style') {
    for (const child of element.childNodes) {
      if ('value' in child && typeof child.value === 'string') child.value = sanitizeCss(child.value);
    }
  }
}

function walk(node: ParentNode): void {
  // Копия списка: sanitizeElement умеет удалить сам узел из childNodes родителя.
  for (const child of [...node.childNodes]) {
    if (isElement(child)) sanitizeElement(child);
    if (child.parentNode && hasChildren(child)) walk(child);
  }
}

/**
 * Разбирает HTML настоящим парсером и возвращает его же, очищенным. Регулярками эту работу
 * делать нельзя: они ломаются на первом хитро составленном атрибуте, а это ровно тот класс
 * дыр, ради которых вся конструкция и затевалась (R-30, Граница 3).
 *
 * Скрипты остаются намеренно — это решение пользователя. Изоляцию обеспечивают отдельный
 * домен, `<iframe sandbox>` без `allow-same-origin` и CSP-заголовок при отдаче.
 */
export function sanitizeProfileCard(html: string): string {
  const fragment = parseFragment(html);
  walk(fragment);
  return serialize(fragment);
}
