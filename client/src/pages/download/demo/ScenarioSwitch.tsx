import { Icon } from '../../../ui/Icon';
import { CONTENT } from '../content';
import styles from './ScenarioSwitch.module.css';

interface ScenarioSwitchProps {
  activeIndex: number;
  count: number;
  disabled: boolean;
  onSwitch: () => void;
}

export function ScenarioSwitch({ activeIndex, count, disabled, onSwitch }: ScenarioSwitchProps) {
  return (
    <>
      <button
        type="button"
        className={styles.arrow}
        onClick={onSwitch}
        disabled={disabled}
        aria-label={CONTENT.scenarioSwitch.label}
      >
        <Icon name="chevron-right" size={22} />
      </button>

      <span className={styles.dots} style={{ ['--scenario-index' as string]: activeIndex }} aria-hidden="true">
        <span className={styles.dotFill} />
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={index === activeIndex ? `${styles.dot} ${styles.dotActive}` : styles.dot}
          />
        ))}
      </span>
    </>
  );
}
