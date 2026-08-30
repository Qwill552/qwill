import type { CardFontDto } from '@messenger/shared';
import { useEffect, useMemo, useState } from 'react';

import { ApiError } from '../../api/client';
import { listCardFontsRequest } from '../../api/users';
import styles from './CardFontList.module.css';

const COPIED_FLASH_MS = 1600;
const SEARCH_FROM = 8;

const WEIGHT_LABELS: Record<number, string> = {
  100: 'тонкий',
  200: 'сверхсветлый',
  300: 'светлый',
  400: 'обычный',
  500: 'средний',
  600: 'полужирный',
  700: 'жирный',
  800: 'сверхжирный',
  900: 'чёрный',
};

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** До трёх весов перечисляем словами, дальше — счётом: у семейства с девятью начертаниями
 *  перечисление занимает три строки и наезжает на соседние. */
function describe(font: CardFontDto): string {
  const base =
    font.weights.length <= 3
      ? font.weights.map((weight) => WEIGHT_LABELS[weight] ?? String(weight)).join(', ')
      : `${font.weights.length} ${plural(font.weights.length, 'начертание', 'начертания', 'начертаний')}`;
  return font.hasItalic ? `${base} · курсив` : base;
}

export function CardFontList() {
  const [fonts, setFonts] = useState<CardFontDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    listCardFontsRequest()
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Не удалось загрузить список шрифтов');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(family: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(`font-family: "${family}";`);
      setCopied(family);
      window.setTimeout(() => setCopied((current) => (current === family ? null : current)), COPIED_FLASH_MS);
    } catch {
      setError('Браузер не дал скопировать — впишите название вручную');
    }
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === '' ? fonts : fonts.filter((font) => font.family.toLowerCase().includes(needle));
  }, [fonts, query]);

  return (
    <section className={styles.panel} aria-label="Шрифты">
      {error && <p className={styles.error}>{error}</p>}

      {fonts.length >= SEARCH_FROM && (
        <input
          className={styles.search}
          type="search"
          value={query}
          placeholder={`Поиск среди ${fonts.length}`}
          aria-label="Поиск шрифта"
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      {loading ? (
        <p className={styles.empty}>Загружаем список…</p>
      ) : fonts.length === 0 ? (
        <p className={styles.empty}>Шрифтов на сервере пока нет — визитка рисуется системными.</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>Ничего не нашлось.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((font) => (
            <li key={font.family} className={styles.row}>
              <span className={styles.family}>{font.family}</span>
              <span className={styles.weights}>{describe(font)}</span>
              <button type="button" className={styles.copy} onClick={() => void copy(font.family)}>
                {copied === font.family ? 'Скопировано' : 'Копировать'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.hint}>
        Писать <code>@font-face</code> не нужно — сервер подставляет его сам. Достаточно указать{' '}
        <code>font-family</code>.
      </p>
    </section>
  );
}
