import { Icon, type IconName } from './Icon';
import styles from './IconTile.module.css';

/** Тона плиток. Все восемь на одной светлоте и насыщенности — ряд читается набором,
 *  а не радугой (ux-ui/design-system.md). */
export type TileTint =
  | 'blue'
  | 'violet'
  | 'orange'
  | 'green'
  | 'red'
  | 'teal'
  | 'pink'
  | 'indigo';

interface IconTileProps {
  icon: IconName;
  tint: TileTint;
  className?: string;
}

export function IconTile({ icon, tint, className }: IconTileProps) {
  return (
    <span
      className={`${styles.tile} ${className ?? ''}`}
      style={{ ['--tile-tint' as string]: `var(--tint-${tint})` }}
    >
      <Icon name={icon} size={18} />
    </span>
  );
}
