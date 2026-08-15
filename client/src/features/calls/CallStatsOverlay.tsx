import { useEffect, useState } from 'react';

import { collectCallStats, formatCallStats, resetCallStats, type CallStatsSnapshot } from '../../calls/callStats';
import styles from './CallStatsOverlay.module.css';

const REFRESH_MS = 1000;
const COPIED_MS = 1500;

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
    <span className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${warn ? styles.warn : ''}`}>{value}</span>
    </span>
  );
}

export function CallStatsOverlay() {
  const [snapshot, setSnapshot] = useState<CallStatsSnapshot | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyStats = async (): Promise<void> => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(formatCallStats(snapshot));
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setCopied(false);
    }
  };

  if (!snapshot) return null;

  const transport = snapshot.transport;
  const relayed = transport?.protocol === 'TCP' || transport?.localCandidate.startsWith('relay');
  const qpLimit = qpThresholdFor(snapshot.codec);

  return (
    <button type="button" className={styles.overlay} title="Скопировать статистику" onClick={() => void copyStats()}>
      <Row label={`захват ${snapshot.captureLabel}`} value={`${snapshot.captureWidth}×${snapshot.captureHeight} @${snapshot.captureFps}`} />
      <Row label="трек" value={snapshot.captureTrack} />
      <Row label="максимум" value={snapshot.captureMax} />
      <Row label="кодек" value={snapshot.codec} />

      {transport && (
        <>
          <span className={styles.section}>сеть</span>
          <Row
            label="путь"
            value={`${transport.protocol} ${transport.localCandidate}→${transport.remoteCandidate}`}
            warn={relayed}
          />
          <Row label="rtt" value={`${transport.rttMs} мс`} warn={transport.rttMs > 150} />
          <Row label="полоса" value={`${transport.availableOutgoingKbps} кбит/с`} />
        </>
      )}

      {snapshot.outbound.length > 0 && <span className={styles.section}>отдача</span>}
      {snapshot.outbound.map((layer) => (
        <Row
          key={layer.layer}
          label={layer.layer}
          value={`${layer.width}×${layer.height} ${layer.fps}fps ${layer.kbps}k qp${layer.qp} ${layer.limitation}`}
          warn={(layer.limitation !== 'none' && layer.limitation !== '—') || layer.qp > qpLimit}
        />
      ))}
      {snapshot.outbound[0] && <Row label="энкодер" value={snapshot.outbound[0].encoder} />}

      {snapshot.inbound.length > 0 && <span className={styles.section}>приём</span>}
      {snapshot.inbound.map((stream, index) => (
        <Row
          key={`${stream.label}-${index}`}
          label={stream.label}
          value={`${stream.width}×${stream.height} ${stream.fps}fps ${stream.kbps}k потерь ${stream.packetsLost} фризов ${stream.freezes}`}
          warn={stream.freezes > 0}
        />
      ))}

      <span className={styles.section}>{copied ? 'скопировано' : 'тап — скопировать'}</span>
    </button>
  );
}
