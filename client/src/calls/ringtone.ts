const RINGTONE_PATTERN_MS = 3000;
const RINGTONE_NOTES: { freq: number; offsetMs: number; durationMs: number }[] = [
  { freq: 523.25, offsetMs: 0, durationMs: 140 },
  { freq: 659.25, offsetMs: 160, durationMs: 140 },
  { freq: 783.99, offsetMs: 320, durationMs: 140 },
  { freq: 1046.5, offsetMs: 480, durationMs: 220 },
];
const RINGTONE_GAIN = 0.4;
const VIBRATE_PATTERN = [1000, 500, 1000, 500];

const RINGBACK_PATTERN_MS = 2000;
const RINGBACK_GAIN = 0.22;
const RINGBACK_FREQ = 425;
const RINGBACK_TONE_MS = 600;

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
  if (canVibrate()) {
    navigator.vibrate(VIBRATE_PATTERN);
    ringtoneVibrateTimer = setInterval(() => navigator.vibrate(VIBRATE_PATTERN), RINGTONE_PATTERN_MS);
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
