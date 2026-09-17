import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { Spinner } from '../ui/Spinner';
import styles from './UserLinkScreen.module.css';

export function UserLinkScreen() {
  const { username = '' } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const myUsername = useAuthStore((s) => s.user?.username);
  const startPrivateChat = useChatStore((s) => s.startPrivateChat);
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
    startPrivateChat(username)
      .then((chat) => {
        if (!cancelled) navigate(`/chats/${chat.id}/info`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username, myUsername, navigate, startPrivateChat]);

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
