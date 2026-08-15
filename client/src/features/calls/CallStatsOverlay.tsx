import { useEffect, useState } from 'react';

import { collectCallStats, resetCallStats, type CallStatsSnapshot } from '../../calls/callStats';
import styles from './CallStatsOverlay.module.css';

const REFRESH_MS = 1000;

const QP_MUSH_THRESHOLD: Record<string, number> = {
  h264: 36,
  vp8: 60,
  vp9: 140,
  av1: 140,
};

function qpThresholdFor(codec: string): number {
  return QP_MUSH_THRESHOLD[codec.toLowerCase()] ?? 60;
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${warn ? styles.warn : ''}`}>{value}</span>
    </div>
  );
}

export function CallStatsOverlay() {
  const [snapshot, setSnapshot] = useState<CallStatsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    resetCallStats();

    const tick = async (): Promise<void> => {
      const next = await collectCallStats();
      if (!cancelled) setSnapshot(next);
    };

    void tick();
    const timer = setInterval(() => void tick(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      resetCallStats();
    };
  }, []);

  if (!snapshot) return null;

  const transport = snapshot.transport;
  const relayed = transport?.protocol === 'TCP' || transport?.localCandidate.startsWith('relay');
  const qpLimit = qpThresholdFor(snapshot.codec);

  return (
    <div className={styles.overlay}>
      <Row label="захват" value={`${snapshot.captureWidth}×${snapshot.captureHeight} @${snapshot.captureFps}`} />
      <Row label="максимум" value={snapshot.captureMax} />
      <Row label="кодек" value={snapshot.codec} />

      {transport && (
        <>
          <div className={styles.section}>сеть</div>
          <Row
            label="путь"
            value={`${transport.protocol} ${transport.localCandidate}→${transport.remoteCandidate}`}
            warn={relayed}
          />
          <Row label="rtt" value={`${transport.rttMs} мс`} warn={transport.rttMs > 150} />
          <Row label="полоса" value={`${transport.availableOutgoingKbps} кбит/с`} />
        </>
      )}

      {snapshot.outbound.length > 0 && <div className={styles.section}>отдача</div>}
      {snapshot.outbound.map((layer) => (
        <Row
          key={layer.layer}
          label={layer.layer}
          value={`${layer.width}×${layer.height} ${layer.fps}fps ${layer.kbps}k qp${layer.qp} ${layer.limitation}`}
          warn={(layer.limitation !== 'none' && layer.limitation !== '—') || layer.qp > qpLimit}
        />
      ))}
      {snapshot.outbound[0] && <Row label="энкодер" value={snapshot.outbound[0].encoder} />}

      {snapshot.inbound.length > 0 && <div className={styles.section}>приём</div>}
      {snapshot.inbound.map((stream, index) => (
        <Row
          key={index}
          label={`peer${index + 1}`}
          value={`${stream.width}×${stream.height} ${stream.fps}fps ${stream.kbps}k потерь ${stream.packetsLost} фризов ${stream.freezes}`}
          warn={stream.freezes > 0}
        />
      ))}
    </div>
  );
}
