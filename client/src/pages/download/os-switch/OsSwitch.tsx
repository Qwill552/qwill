import { useRef, type KeyboardEvent } from 'react';

import { Icon } from '../../../ui/Icon';
import { CONTENT } from '../content';
import type { OsChoice } from '../useOsChoice';
import styles from './OsSwitch.module.css';

interface OsSwitchProps {
  os: OsChoice;
  onChange: (os: OsChoice) => void;
}

const OS_ORDER: OsChoice[] = ['android', 'windows'];

export function OsSwitch({ os, onChange }: OsSwitchProps) {
  const tabRefs = useRef(new Map<OsChoice, HTMLButtonElement>());
  const activeIndex = OS_ORDER.indexOf(os);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: OsChoice = os === 'android' ? 'windows' : 'android';
    onChange(next);
    tabRefs.current.get(next)?.focus();
  }

  return (
    <div
      className={styles.switch}
      role="tablist"
      aria-label={CONTENT.osSwitch.label}
      style={{ ['--os-index' as string]: activeIndex }}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {OS_ORDER.map((value) => (
        <button
          key={value}
          ref={(node) => {
            if (node) tabRefs.current.set(value, node);
            else tabRefs.current.delete(value);
          }}
          type="button"
          role="tab"
          aria-selected={os === value}
          tabIndex={os === value ? 0 : -1}
          className={`${styles.tab} ${os === value ? styles.tabActive : ''}`}
          onClick={() => onChange(value)}
          onKeyDown={handleKeyDown}
        >
          <Icon name={value === 'android' ? 'android' : 'windows-logo'} size={20} solid />
          {CONTENT.osSwitch[value]}
        </button>
      ))}
    </div>
  );
}
