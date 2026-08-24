import { ICON_PATHS, type IconName } from './icons/paths';

interface IconProps {
  name: IconName;
  /** Сетка иконки — 24; другой размер только масштабирует, штрих остаётся пропорциональным. */
  size?: number;
  className?: string;
  solid?: boolean;
  /** Задан — иконка становится картинкой с подписью; не задан — она декоративная и скрыта от скринридера. */
  title?: string;
}

export function Icon({ name, size = 24, className, solid, title }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export type { IconName };
