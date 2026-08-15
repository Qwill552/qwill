import type { AvatarColor, CallDto } from '@messenger/shared';

import { GROUP_CALL_GRID_MAX_PARTICIPANTS, GROUP_CALL_GRID_ROW_MAX } from '../../calls/types';
import type { CallParticipantState } from '../../calls/types';
import { ParticipantTile } from './ParticipantTile';
import styles from './CallGrid.module.css';

interface CallGridProps {
  participants: CallParticipantState[];
  call: CallDto | null;
  activeSpeakerId: string | null;
}

interface GridParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor?: AvatarColor;
  micEnabled: boolean;
  isSpeaking: boolean;
  cameraEnabled: boolean;
  mirrored: boolean;
}

function toGridParticipants(participants: CallParticipantState[], call: CallDto | null): GridParticipant[] {
  const directory = new Map(call?.participants.map((p) => [p.user.id, p.user] as const));
  return participants.map((p) => {
    const member = directory.get(p.userId);
    return {
      userId: p.userId,
      displayName: member?.displayName ?? p.displayName,
      avatarUrl: member?.avatarUrl ?? p.avatarUrl,
      avatarColor: member?.avatarColor,
      micEnabled: p.micEnabled,
      isSpeaking: p.isSpeaking,
      cameraEnabled: p.cameraEnabled,
      mirrored: p.mirrored,
    };
  });
}

function chunkRows(participants: GridParticipant[]): GridParticipant[][] {
  const rows: GridParticipant[][] = [];
  for (let i = 0; i < participants.length; i += GROUP_CALL_GRID_ROW_MAX) {
    rows.push(participants.slice(i, i + GROUP_CALL_GRID_ROW_MAX));
  }
  return rows;
}

export function CallGrid({ participants, call, activeSpeakerId }: CallGridProps) {
  const grid = toGridParticipants(participants, call);

  if (grid.length > GROUP_CALL_GRID_MAX_PARTICIPANTS) {
    const speaker = grid.find((p) => p.userId === activeSpeakerId) ?? grid[0] ?? null;
    const others = grid.filter((p) => p.userId !== speaker?.userId);
    return (
      <div className={styles.speakerLayout}>
        {speaker && (
          <div className={styles.speakerSlot}>
            <ParticipantTile
              userId={speaker.userId}
              displayName={speaker.displayName}
              avatarUrl={speaker.avatarUrl}
              avatarColor={speaker.avatarColor}
              micEnabled={speaker.micEnabled}
              isSpeaking={speaker.isSpeaking}
              cameraEnabled={speaker.cameraEnabled}
              mirrored={speaker.mirrored}
              variant="featured"
            />
          </div>
        )}
        <div className={styles.strip}>
          {others.map((p) => (
            <div className={styles.stripCell} key={p.userId}>
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
          ))}
        </div>
      </div>
    );
  }

  const rows = chunkRows(grid);
  return (
    <div className={styles.grid}>
      {rows.map((row, index) => (
        <div className={styles.row} key={index}>
          {row.map((p) => (
            <div className={styles.cell} key={p.userId}>
              <ParticipantTile
                userId={p.userId}
                displayName={p.displayName}
                avatarUrl={p.avatarUrl}
                avatarColor={p.avatarColor}
                micEnabled={p.micEnabled}
                isSpeaking={p.isSpeaking}
                cameraEnabled={p.cameraEnabled}
                mirrored={p.mirrored}
                variant="tile"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
