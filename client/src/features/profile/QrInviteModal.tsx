import type { AvatarColor } from '@messenger/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { Avatar } from '../../ui/Avatar';
import { Modal } from '../groups/Modal';
import { inviteLinkFor } from './inviteLink';
import { qrMatrix } from './qr/qrMatrix';
import { useQrInviteStore } from './qrInviteStore';
import styles from './QrInviteModal.module.css';

const QUIET_ZONE = 3;
const COPIED_MS = 2000;

function drawing(link: string): { path: string; side: number } {
  const matrix = qrMatrix(link);
  const parts: string[] = [];
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (dark) parts.push(`M${columnIndex + QUIET_ZONE} ${rowIndex + QUIET_ZONE}h1v1h-1z`);
    });
  });
  return { path: parts.join(''), side: matrix.length + QUIET_ZONE * 2 };
}

export function QrInviteModal() {
  const open = useQrInviteStore((s) => s.open);
  const hide = useQrInviteStore((s) => s.hide);
  const user = useAuthStore((s) => s.user);

  if (!open || !user) return null;

  return (
    <QrInviteCard
      displayName={user.displayName}
      username={user.username}
      avatarUrl={user.avatarUrl}
      avatarColor={user.avatarColor}
      onClose={hide}
    />
  );
}

interface QrInviteCardProps {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarColor: AvatarColor;
  onClose: () => void;
}

function QrInviteCard({ displayName, username, avatarUrl, avatarColor, onClose }: QrInviteCardProps) {
  const link = useMemo(() => inviteLinkFor(username), [username]);
  const { path, side } = useMemo(() => drawing(link), [link]);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <Modal title="Мой QR-код" onClose={onClose}>
      <div className={styles.body}>
        <Avatar label={displayName} avatarUrl={avatarUrl} size={64} color={avatarColor} />
        <span className={styles.name}>{displayName}</span>

        <div className={styles.paper}>
          <svg
            className={styles.code}
            viewBox={`0 0 ${side} ${side}`}
            role="img"
            aria-label={`QR-код на ссылку ${link}`}
            shapeRendering="crispEdges"
          >
            <path d={path} fill="var(--qr-ink)" />
          </svg>
        </div>

        <span className={styles.username}>{`@${username}`}</span>
        <span className={styles.hint}>Наведите камеру, чтобы открыть этот профиль в Qwill</span>

        <button type="button" className={styles.share} onClick={() => void copyLink()}>
          {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </button>
      </div>
    </Modal>
  );
}
