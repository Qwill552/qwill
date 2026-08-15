import { useState } from 'react';
import type { CallDto } from '@messenger/shared';

import type { CallParticipantState } from '../../calls/types';
import { withDirectory } from './callParticipants';
import { ParticipantTile } from './ParticipantTile';
import styles from './CallStage.module.css';

interface CallStageProps {
  participants: CallParticipantState[];
  call: CallDto | null;
}

export function CallStage({ participants, call }: CallStageProps) {
  const named = withDirectory(participants, call);
  const sharing = named.filter((p) => p.screenShareEnabled);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const accentUserId = sharing.some((p) => p.userId === selectedUserId) ? selectedUserId : (sharing[0]?.userId ?? null);
  const accent = sharing.find((p) => p.userId === accentUserId) ?? null;

  return (
    <div className={styles.stage}>
      <div className={styles.accent}>
        {accent && (
          <ParticipantTile
            userId={accent.userId}
            displayName={accent.displayName}
            avatarUrl={accent.avatarUrl}
            avatarColor={accent.avatarColor}
            micEnabled={accent.micEnabled}
            isSpeaking={accent.isSpeaking}
            cameraEnabled={accent.cameraEnabled}
            mirrored={accent.mirrored}
            variant="stage"
          />
        )}
      </div>

      <div className={styles.strip}>
        {named.map((p) =>
          p.screenShareEnabled ? (
            <button
              key={p.userId}
              type="button"
              className={`${styles.shareCell} ${p.userId === accentUserId ? styles.shareCellSelected : ''}`}
              aria-pressed={p.userId === accentUserId}
              aria-label={`Показать крупно: экран ${p.displayName}`}
              title={`Экран ${p.displayName}`}
              onClick={() => setSelectedUserId(p.userId)}
            >
              <ParticipantTile
                userId={p.userId}
                displayName={p.displayName}
                avatarUrl={p.avatarUrl}
                avatarColor={p.avatarColor}
                micEnabled={p.micEnabled}
                isSpeaking={p.isSpeaking}
                cameraEnabled={p.cameraEnabled}
                mirrored={p.mirrored}
                variant="screen"
              />
            </button>
          ) : (
            <div className={styles.personCell} key={p.userId}>
              <ParticipantTile
                userId={p.userId}
                displayName={p.displayName}
                avatarUrl={p.avatarUrl}
                avatarColor={p.avatarColor}
                micEnabled={p.micEnabled}
                isSpeaking={p.isSpeaking}
                cameraEnabled={p.cameraEnabled}
                mirrored={p.mirrored}
                variant="compact"
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
