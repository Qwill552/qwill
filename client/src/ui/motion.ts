/** Читает длительность CSS-токена (`--dur-close`, `--dur-menu`, …) в миллисекундах —
 *  тот же источник правды, что и у CSS-переходов, поэтому `prefers-reduced-motion`
 *  (он схлопывает токены до 1ms) глушит и JS-таймеры watchdog'ов заодно.
 *
 *  Единицу измерения обязательно учитывать, а не отбрасывать: Lightning CSS (минификатор
 *  CSS в Vite 8) переписывает `700ms` в более короткое `.7s`, и голый parseFloat давал бы
 *  0.7 вместо 700 — в тысячу раз меньше. На дев-сервере этого не видно, минификация идёт
 *  только в сборке, ровно как с `backdrop-filter` (CLAUDE.md, незыблемое правило 8). */
export function cssDurationMs(varName: string): number {
  const declared = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const amount = Number.parseFloat(declared);
  if (!Number.isFinite(amount)) return 0;

  const alreadyMilliseconds = declared.endsWith('ms');
  return alreadyMilliseconds ? amount : amount * 1000;
}
