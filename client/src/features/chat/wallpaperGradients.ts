export interface WallpaperGradient {
  id: string;
  title: string;
}

const DEFAULT_GRADIENT: WallpaperGradient = { id: 'default', title: 'По теме' };

export const WALLPAPER_GRADIENTS: WallpaperGradient[] = [
  DEFAULT_GRADIENT,
  { id: 'summer', title: 'Лето' },
];

export const DEFAULT_WALLPAPER_GRADIENT_ID = DEFAULT_GRADIENT.id;

export function wallpaperGradientById(id: string): WallpaperGradient {
  return WALLPAPER_GRADIENTS.find((item) => item.id === id) ?? DEFAULT_GRADIENT;
}

export function wallpaperGradientValue(id: string): string {
  return `var(--wallpaper-${wallpaperGradientById(id).id})`;
}
