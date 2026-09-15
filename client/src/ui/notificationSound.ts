const TONES = [
  { frequency: 880, start: 0, duration: 0.05 },
  { frequency: 1320, start: 0.055, duration: 0.07 },
];
const PEAK_GAIN = 0.16;
const ATTACK_S = 0.008;
const SILENCE = 0.0001;
const MIN_INTERVAL_MS = 1000;

let context: AudioContext | null = null;
let lastPlayedAt = 0;

function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  context = new AudioContext();
  return context;
}

function tone(target: AudioContext, startAt: number, frequency: number, duration: number): void {
  const oscillator = target.createOscillator();
  const gain = target.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(SILENCE, startAt);
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startAt + ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(SILENCE, startAt + duration);

  oscillator.connect(gain);
  gain.connect(target.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/** Пачка сообщений не должна превращаться в очередь из звуков: на пришедшие подряд
 *  уведомления играет один, как в Telegram. */
export function playNotificationSound(): void {
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
  lastPlayedAt = now;

  const target = audioContext();
  if (!target) return;

  void target.resume().catch(() => undefined);

  const now = target.currentTime;
  for (const { frequency, start, duration } of TONES) tone(target, now + start, frequency, duration);
}
