import type { ReactNode } from 'react';

import { Icon } from './Icon';
import { IconTile, type TileTint } from './IconTile';
import { Ripple } from './Ripple';
import type { IconName } from './icons/paths';
import styles from './Card.module.css';

interface CardProps {
  /** Подпись над карточкой цветом --primary, как в референсе. */
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}

interface CardRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Цветная плитка слева. Вместе с `tint` — иначе используйте `leading`. */
  icon?: IconName;
  tint?: TileTint;
  leading?: ReactNode;
  /** Значение справа обычным вторичным текстом. */
  value?: ReactNode;
  /** Свой элемент справа: переключатель, бейдж. Отменяет стрелку. */
  trailing?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  /** Надпись цветом --primary: строка-действие вроде «Обновить Qwill». */
  accent?: boolean;
  /** Стрелка «›» по умолчанию появляется сама у нажимаемой строки без своего `trailing` —
   *  так она не забывается и не дублируется. Явный `false` гасит её там, где референс
   *  стрелку не рисует вовсе (например, вход в поиск на вкладке «Контакты»). */
  chevron?: boolean;
  className?: string;
}

function CardRow({
  title,
  subtitle,
  icon,
  tint,
  leading,
  value,
  trailing,
  onClick,
  danger,
  accent,
  chevron,
  className,
}: CardRowProps) {
  const lead = leading ?? (icon && tint ? <IconTile icon={icon} tint={tint} /> : null);
  const showChevron = chevron ?? (Boolean(onClick) && trailing == null);

  const body = (
    <>
      {lead}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {subtitle != null && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
      {value != null && <span className={styles.value}>{value}</span>}
      {trailing}
      {showChevron && <Icon name="chevron-right" size={18} className={styles.chevron} />}
    </>
  );

  const classes = [
    styles.row,
    lead ? styles.withIcon : '',
    danger ? styles.danger : '',
    accent ? styles.accent : '',
    onClick ? styles.interactive : '',
    className ?? '',
  ].join(' ');

  // data-danger, а не только класс: по нему контейнер (десктопная карточка Настроек, где
  // плитка под иконкой прозрачная) перекрашивает и сам глиф — на цветной подложке он белый
  // и красным быть не должен. Хешированный класс модуля снаружи не адресуется.
  if (!onClick) return <div className={classes} data-danger={danger ? '' : undefined}>{body}</div>;

  return (
    <button type="button" className={classes} data-danger={danger ? '' : undefined} onClick={onClick}>
      {body}
      <Ripple />
    </button>
  );
}

/** Секция настроек и информации: подпись + вставная карточка со строками. */
export function Card({ caption, children, className }: CardProps) {
  return (
    <section className={`${styles.section} ${className ?? ''}`}>
      {caption != null && <h2 className={styles.caption}>{caption}</h2>}
      <div className={styles.card}>{children}</div>
    </section>
  );
}

Card.Row = CardRow;
