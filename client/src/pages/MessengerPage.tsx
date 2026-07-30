import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';
import styles from './MessengerPage.module.css';

/** Заглушка этапа 1. Список чатов, лента и сокет-слой появляются на этапе 2 (секция 10). */
export function MessengerPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Привет, {user?.displayName}!</h1>
        <p className={styles.subtitle}>@{user?.username} — чаты появятся на следующем этапе</p>
        <button type="button" className={styles.logout} onClick={() => void handleLogout()}>
          Выйти
        </button>
      </div>
    </div>
  );
}
