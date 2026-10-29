// Which item Today's unique asked on a day, read from its row
// (lib/dailyRows.ts), under the name it had that day. Loaded only when a view
// asks, as the rows are a year's questions; which days it asked at all is
// known without them (model.ts asked).

export interface DailyItem {
  name: string;
  /** Name the item from its art, or find the art for a name. */
  mode: 'name' | 'art';
}

const DAY_MS = 86_400_000;
let loading: Promise<(day: string) => DailyItem | null> | null = null;

/** `got` the days' items once they've loaded (a load that fails leaves them unnamed). */
export function withDailyItems(got: (itemOf: (day: string) => DailyItem | null) => void) {
  dailyItems()
    .then(got)
    .catch(() => undefined);
}

/**
 * A day's item ("2026-10-14", taken as the UTC day the game asks by), or
 * null for a day with no row: before Today's unique began, or past the rows
 * (they reach a year past the last deal).
 */
export function dailyItems(): Promise<(day: string) => DailyItem | null> {
  loading ??= import('../lib/dailyRows').then(({ dailyRow }) => (day: string) => {
    const q = dailyRow(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
    if (!q) return null;
    const name = q.mode === 'art' ? q.prompt : q.labels[q.options.indexOf(q.itemId)];
    return { name: name ?? q.itemId, mode: q.mode };
  });
  // A load that failed (the connection dropped) is tried again next time.
  loading.catch(() => (loading = null));
  return loading;
}
