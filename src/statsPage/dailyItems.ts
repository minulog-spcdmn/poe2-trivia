// Which item Today's unique asked on a day, worked out as the game does
// (lib/daily.ts): the same everywhere for the same day, from the items
// standing that day, so items added since leave a past day named as it was
// asked (daily.ts FIRST_DAYS). Loaded only when a
// view asks, as it brings the game's engine and every item with it; which
// days it asked at all is known without it (model.ts asked).

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

/** A day's item ("2026-10-14", taken as the UTC day the game asks by), or null before Today's unique began. */
export function dailyItems(): Promise<(day: string) => DailyItem | null> {
  loading ??= Promise.all([import('../lib/daily'), import('../data/items.json'), import('../data/fakes.json')]).then(([daily, items, fakes]) => {
    const list = items.default as import('../lib/game').Item[];
    const names = new Map(list.map((it) => [it.id, it.name]));
    const known = new Map<string, DailyItem | null>();
    return (day: string) => {
      const had = known.get(day);
      if (had !== undefined) return had;
      const at = Date.parse(`${day}T00:00:00Z`);
      const q = at < daily.DAILY_LAUNCH ? null : daily.dailyQuestion(list, fakes.default, Math.floor(at / DAY_MS));
      const item = q ? { name: names.get(q.itemId) ?? q.itemId, mode: q.mode } : null;
      known.set(day, item);
      return item;
    };
  });
  // A load that failed (the connection dropped) is tried again next time.
  loading.catch(() => (loading = null));
  return loading;
}
