// What Analytics' charts share: round steps up the axis, and how numbers
// and days are written on them.

/** A round step for an axis that reaches `max` in about `ticks` steps. */
export function niceStep(max: number, ticks = 3): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
}

/** An axis up to a round top at or above `peak`, and its ticks from 0. */
export function axis(peak: number, ticks = 3): { top: number; ticks: number[] } {
  const step = niceStep(peak, ticks);
  const top = Math.max(step, Math.ceil(peak / step) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

export const fmt = (n: number) => n.toLocaleString('en');
/** A figure a day on average: one decimal under 10 ("2.5"), whole above. */
export const average = (v: number) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : fmt(Math.round(v)));
export const compact = (n: number) => (n >= 1000 ? new Intl.NumberFormat('en', { notation: 'compact' }).format(n) : String(n));

const at = (d: string) => new Date(`${d}T12:00:00Z`);
/** "Oct 9", for an axis. */
export const shortDay = (d: string) => at(d).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Fri, Oct 9", or "Week of Oct 9" for a week. */
export const longDay = (d: string, week = false) =>
  week ? `Week of ${shortDay(d)}` : at(d).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Which of `n` points get a date along an axis `width` wide: as many as fit, the last always among them. */
export function labelled(n: number, width: number, room = 66): number[] {
  if (!n || !width) return [];
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(width / room))));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= every) out.unshift(i);
  return out;
}
