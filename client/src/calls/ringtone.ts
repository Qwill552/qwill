const RINGTONE_PATTERN_MS = 4200;
const RINGTONE_NOTES: { freq: number; offsetMs: number; durationMs: number }[] = [
  { freq: 659.25, offsetMs: 0, durationMs: 500 },
  { freq: 880.0, offsetMs: 520, durationMs: 500 },
  { freq: 659.25, offsetMs: 1300, durationMs: 500 },
  { freq: 880.0, offsetMs: 1820, durationMs: 500 },
];
const RINGTONE_GAIN = 0.4;
const VIBRATE_PATTERN = [1000, 500, 1000, 500];

const RINGBACK_PATTERN_MS = 4000;
const RINGBACK_GAIN = 0.22;
const RINGBACK_FREQ = 425;
const RINGBACK_TONE_MS = 1200;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

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

let ringtonePlaying = false;
let ringtoneTimer: ReturnType<typeof setTimeout> | null = null;
let ringtoneVibrateTimer: ReturnType<typeof setInterval> | null = null;
let detachGestureRetry: (() => void) | null = null;

function pulseVibration(): void {
  if (!ringtonePlaying) return;
  nativeVibrate(VIBRATE_PATTERN);
}

function retryOnFirstGesture(): void {
  if (typeof window === 'undefined' || detachGestureRetry) return;

  const onGesture = () => {
    detachGestureRetry?.();
    getAudioContext()?.resume().catch(() => undefined);
    pulseVibration();
  };

  detachGestureRetry = () => {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
    detachGestureRetry = null;
  };

  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);
}

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
  pulseVibration();
  ringtoneVibrateTimer = setInterval(pulseVibration, RINGTONE_PATTERN_MS);
  retryOnFirstGesture();
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
  detachGestureRetry?.();
  if (canVibrate()) navigator.vibrate(0);
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

const ENDED_TONE_FREQ = 480;
const ENDED_TONE_MS = 250;
const ENDED_TONE_GAP_MS = 200;

let endedTonePlaying = false;

export function playCallEndedTone(): void {
  if (endedTonePlaying) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  endedTonePlaying = true;
  ctx.resume().catch(() => undefined);
  const now = ctx.currentTime;
  playTone(ctx, ENDED_TONE_FREQ, now, ENDED_TONE_MS, RINGBACK_GAIN);
  playTone(ctx, ENDED_TONE_FREQ, now + (ENDED_TONE_MS + ENDED_TONE_GAP_MS) / 1000, ENDED_TONE_MS, RINGBACK_GAIN);
  setTimeout(() => {
    endedTonePlaying = false;
  }, ENDED_TONE_MS * 2 + ENDED_TONE_GAP_MS);
}
