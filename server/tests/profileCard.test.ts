import { describe, expect, it } from 'vitest';

import { buildCardCsp } from '../src/lib/cardCsp.js';
import { sanitizeProfileCard } from '../src/lib/sanitizeProfileCard.js';

describe('sanitizeProfileCard', () => {
  it('оставляет инлайновые скрипты — они разрешены осознанно', () => {
    const html = sanitizeProfileCard('<script>document.title = "привет"</script>');
    expect(html).toContain('document.title');
  });

  it('оставляет разметку и стили нетронутыми', () => {
    const html = sanitizeProfileCard('<h1 class="a">Заголовок</h1><style>h1{color:red}</style>');
    expect(html).toContain('<h1 class="a">Заголовок</h1>');
    expect(html).toContain('color:red');
  });

  it('вырезает meta целиком', () => {
    const html = sanitizeProfileCard('<meta http-equiv="Content-Security-Policy" content="default-src *"><p>a</p>');
    expect(html).not.toContain('meta');
    expect(html).toContain('<p>a</p>');
  });

  it('вырезает base', () => {
    expect(sanitizeProfileCard('<base href="http://evil.com/">')).not.toContain('base');
  });

  it('вырезает link, в том числе preconnect и dns-prefetch', () => {
    for (const rel of ['preconnect', 'dns-prefetch', 'prefetch', 'preload', 'stylesheet']) {
      const html = sanitizeProfileCard(`<link rel="${rel}" href="http://evil.com">`);
      expect(html, rel).toBe('');
    }
  });

  it('вырезает вложенный кадр, object, embed и form', () => {
    for (const tag of ['iframe', 'object', 'embed', 'form']) {
      const html = sanitizeProfileCard(`<${tag}></${tag}><p>ok</p>`);
      expect(html, tag).not.toContain(`<${tag}`);
      expect(html, tag).toContain('<p>ok</p>');
    }
  });

  it('вырезает поле пароля, обычный input оставляет', () => {
    expect(sanitizeProfileCard('<input type="password">')).toBe('');
    expect(sanitizeProfileCard('<input type="text">')).toContain('<input type="text">');
  });

  it('снимает href со схемой javascript:, в том числе разорванной табом', () => {
    expect(sanitizeProfileCard('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeProfileCard('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeProfileCard('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('снимает внешний src, но сам тег оставляет', () => {
    const html = sanitizeProfileCard('<img src="http://evil.com/1.png" onerror="alert(1)">');
    expect(html).not.toContain('evil.com');
    expect(html).toContain('onerror="alert(1)"');
  });

  it('снимает src у внешнего скрипта, инлайновый рядом не трогает', () => {
    expect(sanitizeProfileCard('<script src="//evil.com/x.js"></script>')).toBe('<script></script>');
  });

  it('пропускает свои картинки и data:, отклоняет чужие папки и абсолютные пути', () => {
    expect(sanitizeProfileCard('<img src="img/cat.png">')).toContain('src="img/cat.png"');
    expect(sanitizeProfileCard('<img src="data:image/gif;base64,R0lGOD">')).toContain('data:image/gif');
    expect(sanitizeProfileCard('<img src="img/../../3/img/a.png">')).not.toContain('src=');
    expect(sanitizeProfileCard('<img src="/etc/passwd">')).not.toContain('src=');
    expect(sanitizeProfileCard('<img src="../other/img/a.png">')).not.toContain('src=');
  });

  it('вычищает @import и внешний url() из стилей', () => {
    const inStyleTag = sanitizeProfileCard('<style>@import url(http://evil.com/a.css); body{background:url(http://evil.com/b.png)}</style>');
    expect(inStyleTag).not.toContain('evil.com');
    expect(inStyleTag).toContain('background:url()');

    const inAttribute = sanitizeProfileCard('<div style="background:url(https://evil.com/c.png)"></div>');
    expect(inAttribute).not.toContain('evil.com');
  });

  it('оставляет url() на свою картинку', () => {
    expect(sanitizeProfileCard('<div style="background:url(img/cat.png)"></div>')).toContain('url(img/cat.png)');
  });

  it('снимает autoplay у звука и видео', () => {
    expect(sanitizeProfileCard('<video autoplay src="img/a.mp4"></video>')).not.toContain('autoplay');
    expect(sanitizeProfileCard('<audio autoplay></audio>')).not.toContain('autoplay');
  });

  it('чистит srcset целиком, если хоть один источник внешний', () => {
    expect(sanitizeProfileCard('<img srcset="img/a.png 1x, http://evil.com/b.png 2x">')).not.toContain('srcset');
    expect(sanitizeProfileCard('<img srcset="img/a.png 1x, img/b.png 2x">')).toContain('srcset');
  });

  it('добирается до вложенных и битых тегов', () => {
    const html = sanitizeProfileCard('<div><span><b><meta content=x><a href="http://evil.com">t</a></b></span>');
    expect(html).not.toContain('meta');
    expect(html).not.toContain('evil.com');
    expect(html).toContain('t');
  });

  it('не ломается на пустой строке и на мусоре', () => {
    expect(sanitizeProfileCard('')).toBe('');
    expect(() => sanitizeProfileCard('<<<>>><p unclosed')).not.toThrow();
  });
});

describe('buildCardCsp', () => {
  const csp = buildCardCsp('user-1');

  it('запирает сеть и рамки', () => {
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('sandbox allow-scripts');
  });

  it('пускает картинки только в папку этого пользователя', () => {
    expect(csp).toContain('/c/user-1/img/');
    expect(buildCardCsp('user-2')).not.toContain('/c/user-1/img/');
  });
});
