/** Тактильная отдача — на пороге любого жеста и при постановке реакции (ux-ui/gestures.md,
 *  «Общие правила», п.1). На вебе — navigator.vibrate; после перехода на Capacitor
 *  подменяется нативной реализацией в этом одном месте. */
export function haptic(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(10);
}
