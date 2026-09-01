import styles from './AmbientBlobs.module.css';

/** Канвас вкладок: сплошная заливка --bg плюс три размытых цветных пятна. Единственное
 *  место, которое красит фон авторизованной части приложения — экраны в ScreenStack и их
 *  обёртки нарочно прозрачны (см. комментарий в ScreenStack.module.css), иначе капли были
 *  бы не видны ни на одной вкладке. Аватар чата (ChatScreen) поверх своих обоев — исключение,
 *  капли под ними не нужны. */
export function AmbientBlobs() {
  return (
    <div className={styles.layer} aria-hidden="true">
      <span className={`${styles.blob} ${styles.blobBlue}`} />
      <span className={`${styles.blob} ${styles.blobViolet}`} />
      <span className={`${styles.blob} ${styles.blobTeal}`} />
    </div>
  );
}
