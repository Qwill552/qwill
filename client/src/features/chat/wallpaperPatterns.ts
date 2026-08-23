export interface WallpaperPattern {
  id: string;
  title: string;
  src: string;
}

function pattern(id: string, title: string): WallpaperPattern {
  return { id, title, src: `/wallpaper/patterns/${id}.svg` };
}

const DEFAULT_PATTERN = pattern('free-time', 'Досуг');

export const WALLPAPER_PATTERNS: WallpaperPattern[] = [
  DEFAULT_PATTERN,
  pattern('sport', 'Спорт'),
  pattern('t-city', 'Город'),
  pattern('magic', 'Магия'),
  pattern('magic-2', 'Магия 2'),
  pattern('magic-potion', 'Зелья'),
  pattern('space', 'Космос'),
  pattern('space-cat', 'Космокот'),
  pattern('fun-space', 'Весёлый космос'),
  pattern('cartoon-space', 'Мульткосмос'),
  pattern('star-wars', 'Звёздные войны'),
  pattern('star-wars-2', 'Звёздные войны 2'),
  pattern('renovation', 'Ремонт'),
  pattern('food', 'Еда'),
  pattern('sweets', 'Сладости'),
  pattern('sweet-love', 'Сладкая любовь'),
  pattern('love', 'Любовь'),
  pattern('wizard-world', 'Волшебный мир'),
  pattern('unicorn', 'Единорог'),
  pattern('zoo', 'Зоопарк'),
  pattern('cats', 'Коты'),
  pattern('woodland', 'Лес'),
  pattern('sea-world', 'Подводный мир'),
  pattern('snowflakes', 'Снежинки'),
  pattern('christmas', 'Рождество'),
  pattern('halloween', 'Хэллоуин'),
  pattern('witch', 'Ведьма'),
  pattern('characters', 'Персонажи'),
  pattern('games', 'Игры'),
  pattern('games-2', 'Игры 2'),
  pattern('sightseeing', 'Путешествия'),
  pattern('richness', 'Богатство'),
];

export const DEFAULT_WALLPAPER_PATTERN_ID = DEFAULT_PATTERN.id;

export function wallpaperPatternById(id: string): WallpaperPattern {
  return WALLPAPER_PATTERNS.find((item) => item.id === id) ?? DEFAULT_PATTERN;
}
