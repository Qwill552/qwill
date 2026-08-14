const RINGTONE_PATTERN_MS = 4200;
const RINGTONE_NOTES: { freq: number; offsetMs: number; durationMs: number }[] = [
  { freq: 659.25, offsetMs: 0, durationMs: 500 },
  { freq: 880.0, offsetMs: 520, durationMs: 500 },
  { freq: 659.25, offsetMs: 1300, durationMs: 500 },
  { freq: 880.0, offsetMs: 1820, durationMs: 500 },
];
const RINGTONE_GAIN = 0.4;
const VIBRATE_PATTERN = [1000, 500, 1000, 500];
const CALL_VIBRATION_NOTIFICATION_TAG = 'incoming-call-vibration';

const RINGBACK_PATTERN_MS = 4000;
const RINGBACK_GAIN = 0.22;
const RINGBACK_FREQ = 425;
const RINGBACK_TONE_MS = 1200;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type NotificationOptionsWithVibrate = NotificationOptions & { vibrate?: number[]; renotify?: boolean };

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

function playTone(ctx: AudioContext, freq: number, startAt: number, durationMs: number, gain: number): void {
  const durationSec = durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.015);
  gainNode.gain.setValueAtTime(gain, startAt + durationSec - 0.02);
  gainNode.gain.linearRampToValueAtTime(0, startAt + durationSec);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec + 0.02);
}

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function nativeVibrate(pattern: number[] | number): boolean {
  if (!canVibrate()) return false;
  return navigator.vibrate(pattern);
}

async function showVibrationFallback(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const options: NotificationOptionsWithVibrate = {
      tag: CALL_VIBRATION_NOTIFICATION_TAG,
      requireInteraction: false,
      renotify: true,
      silent: false,
      vibrate: VIBRATE_PATTERN,
    };
    await registration.showNotification('Входящий звонок', options);
  } catch {
    return;
  }
}

async function hideVibrationFallback(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = (await registration?.getNotifications({ tag: CALL_VIBRATION_NOTIFICATION_TAG })) ?? [];
    for (const notification of notifications) notification.close();
  } catch {
    return;
  }
}

let ringtonePlaying = false;
let ringtoneTimer: ReturnType<typeof setTimeout> | null = null;
let ringtoneVibrateTimer: ReturnType<typeof setInterval> | null = null;

function scheduleRingtoneLoop(): void {
  if (!ringtonePlaying) return;
  const ctx = getAudioContext();
  if (ctx) {
    ctx.resume().catch(() => undefined);
    const now = ctx.currentTime;
    for (const note of RINGTONE_NOTES) {
      playTone(ctx, note.freq, now + note.offsetMs / 1000, note.durationMs, RINGTONE_GAIN);
    }
  }
  ringtoneTimer = setTimeout(scheduleRingtoneLoop, RINGTONE_PATTERN_MS);
}

export function startRingtone(): void {
  if (ringtonePlaying) return;
  ringtonePlaying = true;
  scheduleRingtoneLoop();
  if (nativeVibrate(VIBRATE_PATTERN)) {
    ringtoneVibrateTimer = setInterval(() => navigator.vibrate(VIBRATE_PATTERN), RINGTONE_PATTERN_MS);
  } else {
    void showVibrationFallback();
  }
}

export function stopRingtone(): void {
  ringtonePlaying = false;
  if (ringtoneTimer) {
    clearTimeout(ringtoneTimer);
    ringtoneTimer = null;
  }
  if (ringtoneVibrateTimer) {
    clearInterval(ringtoneVibrateTimer);
    ringtoneVibrateTimer = null;
  }
  if (canVibrate()) navigator.vibrate(0);
  void hideVibrationFallback();
}

let ringbackPlaying = false;
let ringbackTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRingbackLoop(): void {
  if (!ringbackPlaying) return;
  const ctx = getAudioContext();
  if (ctx) {
    ctx.resume().catch(() => undefined);
    playTone(ctx, RINGBACK_FREQ, ctx.currentTime, RINGBACK_TONE_MS, RINGBACK_GAIN);
  }
  ringbackTimer = setTimeout(scheduleRingbackLoop, RINGBACK_PATTERN_MS);
}

export function startRingback(): void {
  if (ringbackPlaying) return;
  ringbackPlaying = true;
  scheduleRingbackLoop();
}

export function stopRingback(): void {
  ringbackPlaying = false;
  if (ringbackTimer) {
    clearTimeout(ringbackTimer);
    ringbackTimer = null;
  }
}
