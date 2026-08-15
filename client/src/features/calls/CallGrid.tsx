import type { CallDto } from '@messenger/shared';

import { GROUP_CALL_GRID_MAX_PARTICIPANTS, GROUP_CALL_GRID_ROW_MAX } from '../../calls/types';
import type { CallParticipantState } from '../../calls/types';
import { withDirectory } from './callParticipants';
import type { NamedCallParticipant } from './callParticipants';
import { ParticipantTile } from './ParticipantTile';
import styles from './CallGrid.module.css';

interface CallGridProps {
  participants: CallParticipantState[];
  call: CallDto | null;
  activeSpeakerId: string | null;
}

function chunkRows(participants: NamedCallParticipant[]): NamedCallParticipant[][] {
  const rows: NamedCallParticipant[][] = [];
  for (let i = 0; i < participants.length; i += GROUP_CALL_GRID_ROW_MAX) {
    rows.push(participants.slice(i, i + GROUP_CALL_GRID_ROW_MAX));
  }
  return rows;
}

export function CallGrid({ participants, call, activeSpeakerId }: CallGridProps) {
  const grid = withDirectory(participants, call);

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
