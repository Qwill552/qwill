/** Читает длительность CSS-токена (`--dur-close`, `--dur-menu`, …) в миллисекундах —
 *  тот же источник правды, что и у CSS-переходов, поэтому `prefers-reduced-motion`
 *  (он схлопывает токены до 1ms) глушит и JS-таймеры watchdog'ов заодно. */
export function cssDurationMs(varName: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName)) || 0;
}
