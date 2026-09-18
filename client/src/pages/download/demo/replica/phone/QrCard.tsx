import { Avatar, ChromeBar, GlassButton } from './Chrome';
import { PEOPLE, QR_PATTERN, QR_TEXT } from './demoData';
import styles from './QrCard.module.css';

export function QrCard() {
  const person = PEOPLE.grisha;
  const side = QR_PATTERN.length;

  return (
    <div className={styles.screen}>
      <div className={styles.body}>
        <Avatar label={person.name} colorKey={person.id} size={64} />
        <span className={styles.name}>{person.name}</span>

        <div className={styles.paper}>
          <div
            className={styles.code}
            style={{ gridTemplateColumns: `repeat(${side}, 1fr)` }}
          >
            {QR_PATTERN.flatMap((row, rowIndex) =>
              row.map((dark, colIndex) => (
                <span
                  key={`${rowIndex}-${colIndex}`}
                  className={dark ? styles.moduleDark : styles.moduleLight}
                />
              )),
            )}
          </div>
        </div>

        <span className={styles.username}>{person.username}</span>
        <span className={styles.hint}>{QR_TEXT.hint}</span>
        <span className={styles.share}>{QR_TEXT.button}</span>
      </div>

      <ChromeBar className={styles.header}>
        <GlassButton icon="back" />
        <span className={styles.title}>{QR_TEXT.title}</span>
      </ChromeBar>
    </div>
  );
}
