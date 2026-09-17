import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getUserProfileByUsernameRequest } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { Spinner } from '../ui/Spinner';
import styles from './UserLinkScreen.module.css';

export function UserLinkScreen() {
  const { username = '' } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const myUsername = useAuthStore((s) => s.user?.username);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!username) {
      navigate('/chats', { replace: true });
      return;
    }
    if (username.toLowerCase() === myUsername?.toLowerCase()) {
      navigate('/profile', { replace: true });
      return;
    }

    let cancelled = false;
    getUserProfileByUsernameRequest(username)
      .then((profile) => {
        if (!cancelled) navigate(`/contacts/${profile.id}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username, myUsername, navigate]);

  return (
    <main className={styles.screen}>
      {failed ? (
        <>
          <p className={styles.title}>{`Пользователь @${username} не найден`}</p>
          <button type="button" className={styles.action} onClick={() => navigate('/chats', { replace: true })}>
            К чатам
          </button>
        </>
      ) : (
        <Spinner size={32} label="Открываем профиль" />
      )}
    </main>
  );
}
