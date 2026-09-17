import { CONTENT } from '../content';
import { Logo } from './Logo';
import styles from './PageHeader.module.css';
import { ThemeToggle } from './ThemeToggle';

export function PageHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Logo />
        <div className={styles.titles}>
          <h1 className={styles.title}>{CONTENT.title}</h1>
          <p className={styles.subtitle}>{CONTENT.subtitle}</p>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}
