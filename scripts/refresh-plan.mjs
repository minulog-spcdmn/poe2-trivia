// What a refresh (npm run fetch-data) changes, worked out from the items
// before and the items fetched, with nothing read or written: which items
// came, went, were renamed or changed, and whether the run may go on.
// scripts/fetch-data.mjs acts on it; tests/refreshPlan.test.ts tries it on
// made-up lists.

import { NEW_FADE_DAYS, NEW_HALF_DAYS, RELEASES, dayNumber } from '../src/lib/releases.ts';

/** @typedef {{ id: string, name: string, [field: string]: unknown }} Item */
/** @typedef {{ from: string, to: string, id: string }} Rename */

/**
 * The run's options: --shrink, and each --rename "Old=>New" and --drop "Name"
 * (also written --rename=Old=>New).
 * @param {string[]} argv
 */
export function refreshArgs(argv) {
  /** @type {[string, string][]} */
  const renames = [];
  /** @type {string[]} */
  const drops = [];
  let shrink = false;
  let early = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shrink') {
      shrink = true;
      continue;
    }
    if (a === '--early') {
      early = true;
      continue;
    }
    const m = /^--(rename|drop)(?:=(.*))?$/s.exec(a);
    if (!m) throw new Error(`Unknown option ${a}`);
    const value = m[2] ?? argv[++i];
    if (value === undefined) throw new Error(`--${m[1]} needs a name`);
    if (m[1] === 'drop') {
      drops.push(value.trim());
      continue;
    }
    const pair = value.split('=>');
    if (pair.length !== 2 || !pair[0].trim() || !pair[1].trim()) throw new Error(`--rename "${value}": write it as "Old=>New"`);
    renames.push([pair[0].trim(), pair[1].trim()]);
  }
  return { shrink, early, renames, drops };
}

/** @param {string} s */
const quote = (s) => `"${s.replace(/"/g, '\\"')}"`;

/**
 * Matches the items fetched (`after`) to those before (`before`, items.json),
 * by name. Each item there was before keeps its id from items.json, and a
 * renamed item takes the old one's, so codexes and achievements, which keep
 * ids, still know them; only a new item keeps the id it was fetched with
 * (its name's hash). `after` is changed to say so. An item that is gone with
 * no --rename or --drop to explain it, two items with one id, or an option
 * that doesn't fit the lists, throws before anything is written, saying how
 * to rerun.
 * @param {Item[]} before
 * @param {Item[]} after
 * @param {{ renames?: [string, string][], drops?: string[] }} [opts]
 * @returns {{ added: string[], renamed: Rename[], dropped: string[] }}
 */
export function reconcile(before, after, { renames = [], drops = [] } = {}) {
  const was = new Map(before.map((it) => [it.name, it]));
  const now = new Map(after.map((it) => [it.name, it]));
  /** @type {string[]} */
  const errors = [];
  /** @type {Rename[]} */
  const renamed = [];
  const explained = new Set();
  const arrived = new Set();
  // An id is the name's hash only when the item is first fetched: a renamed one keeps its first name's from then on.
  for (const it of after) {
    const old = was.get(it.name);
    if (old) it.id = old.id;
  }
  for (const [from, to] of renames) {
    const old = was.get(from);
    const it = now.get(to);
    if (!old) errors.push(`--rename ${quote(`${from}=>${to}`)}: there was no ${from}`);
    else if (now.has(from)) errors.push(`--rename ${quote(`${from}=>${to}`)}: ${from} is still on poe2db`);
    else if (!it) errors.push(`--rename ${quote(`${from}=>${to}`)}: poe2db has no ${to}`);
    else if (was.has(to)) errors.push(`--rename ${quote(`${from}=>${to}`)}: there already was a ${to}`);
    else if (arrived.has(to) || explained.has(from)) errors.push(`--rename ${quote(`${from}=>${to}`)}: ${from} or ${to} is renamed twice`);
    else {
      it.id = old.id;
      renamed.push({ from, to, id: old.id });
      explained.add(from);
      arrived.add(to);
    }
  }
  /** @type {string[]} */
  const dropped = [];
  for (const name of drops) {
    if (!was.has(name)) errors.push(`--drop ${quote(name)}: there was no ${name}`);
    else if (now.has(name)) errors.push(`--drop ${quote(name)}: ${name} is still on poe2db`);
    else if (explained.has(name)) errors.push(`--drop ${quote(name)}: ${name} is renamed too`);
    else {
      dropped.push(name);
      explained.add(name);
    }
  }
  const gone = before.filter((it) => !now.has(it.name) && !explained.has(it.name)).map((it) => it.name);
  const added = after.filter((it) => !was.has(it.name) && !arrived.has(it.name)).map((it) => it.name);
  if (gone.length) {
    const lines = [`Gone from poe2db, unexplained: ${gone.join(', ')}`];
    if (added.length) lines.push(`New on poe2db: ${added.join(', ')}`);
    lines.push(
      'Nothing was written. Rerun with one of these for each gone item:',
      '  --rename "Old=>New"  it was renamed: it keeps its id, so codexes and achievements keep it, and takes the new name',
      '  --drop "Old"         it is really gone',
      `For example (check each before you run it): npm run fetch-data -- ${gone
        .map((name) => {
          const to = likelyRename(was.get(name), gone.map((n) => was.get(n)), added.map((n) => now.get(n)));
          return to ? `--rename ${quote(`${name}=>${to}`)}` : `--drop ${quote(name)}`;
        })
        .join(' ')}`,
    );
    errors.push(lines.join('\n'));
  }
  // A new item named as a renamed one once was would take its id.
  const ids = new Map();
  for (const it of after) {
    const other = ids.get(it.id);
    if (other) errors.push(`${other} and ${it.name} would both have the id ${it.id}`);
    else ids.set(it.id, it.name);
  }
  // `stop`: a refusal to go on, said in full, not a fault (fetch-data prints no stack for it).
  if (errors.length) throw Object.assign(new Error(errors.join('\n')), { stop: true });
  return { added, renamed, dropped };
}

/**
 * The new item a gone one was most likely renamed to: the one new item of its
 * kind, group and base, when no other gone item is of those too. Else none:
 * a guess that pairs it with an unrelated item would give that item its
 * codex history.
 * @param {Item | undefined} old
 * @param {(Item | undefined)[]} gone
 * @param {(Item | undefined)[]} added
 */
function likelyRename(old, gone, added) {
  if (!old) return null;
  /** @param {Item | undefined} it */
  const like = (it) => !!it && it.kind === old.kind && it.group === old.group && it.base === old.base;
  const to = added.filter(like);
  return to.length === 1 && gone.filter(like).length === 1 ? (to[0]?.name ?? null) : null;
}

/**
 * Which pictures (art-source/items/<id>.webp) to fetch and which to delete:
 * one not on disk yet is fetched, and a renamed item's (`renamedIds`), whose
 * art may have changed with its name; a file no item or variant has goes.
 * @param {string[]} ids every item's and variant's id
 * @param {string[]} files the files there now
 * @param {Set<string>} renamedIds
 */
export function artPlan(ids, files, renamedIds = new Set()) {
  const there = new Set(files);
  const keep = new Set(ids.map((id) => `${id}.webp`));
  return {
    fetch: ids.filter((id) => !there.has(`${id}.webp`) || renamedIds.has(id)),
    prune: files.filter((f) => !keep.has(f)),
  };
}

/**
 * Each item's first day, as the refreshes saw it: `added` in items.json, the
 * UTC day (YYYY-MM-DD) of the run that first listed it. An item keeps the
 * day it had, by id (so a renamed one keeps its own: it isn't new); one not
 * in `before` takes `day`; one listed before the stamps began has none. The
 * start page counts a release's new items by it (src/lib/releases.ts).
 * Returns `out` with the days set, in place.
 * @template {{ id: string, added?: string }} T
 * @param {{ id: string, added?: string }[]} before
 * @param {T[]} out
 * @param {string} day
 */
export function firstSeen(before, out, day) {
  const was = new Map(before.map((it) => [it.id, it]));
  for (const it of out) {
    const old = was.get(it.id);
    const added = old ? old.added : day;
    if (added) it.added = added;
    else delete it.added;
  }
  return out;
}

/** The fields of items.json an item is compared by (its name aside: a rename says that). */
const FIELDS = ['base', 'group', 'category', 'kind', 'w', 'h'];

/**
 * The items, by their (new) name, whose entry in items.json changed other
 * than its name, and how: each changed field, and "variants" when its
 * variants (their art, base or size) did. Matched by id, so a renamed item
 * is compared with what it was.
 * @param {Item[]} before
 * @param {Item[]} out
 */
export function changedItems(before, out) {
  const was = new Map(before.map((it) => [it.id, it]));
  /** @type {{ name: string, fields: string[] }[]} */
  const changed = [];
  for (const it of out) {
    const old = was.get(it.id);
    if (!old) continue;
    const fields = FIELDS.filter((f) => old[f] !== it[f]).map((f) => `${f} ${old[f]} => ${it[f]}`);
    if (JSON.stringify(old.variants ?? []) !== JSON.stringify(it.variants ?? [])) fields.push('variants');
    if (fields.length) changed.push({ name: it.name, fields });
  }
  return changed;
}

/**
 * The new items (`added` names) and new variants (ids not in `before`) that
 * have no tooltip (`missing`, ids): they are left out of this refresh, not
 * shipped bare. Returns the names left out and the variant ids left out.
 * @param {{ id: string, variants?: { id: string }[] }[]} before
 * @param {{ id: string, name: string, variants?: { id: string }[] }[]} items
 * @param {string[]} added
 * @param {string[]} missing
 */
export function withoutTooltip(before, items, added, missing) {
  const gone = new Set(missing);
  const isNew = new Set(added);
  const known = new Set(before.flatMap((it) => [it.id, ...(it.variants ?? []).map((v) => v.id)]));
  /** @type {string[]} */
  const names = [];
  /** @type {string[]} */
  const variants = [];
  for (const it of items) {
    if (isNew.has(it.name) && gone.has(it.id)) names.push(it.name);
    else for (const v of it.variants ?? []) if (!known.has(v.id) && gone.has(v.id)) variants.push(v.id);
  }
  return { items: names, variants };
}

/**
 * A release listed to start within the month after `day`, which items first
 * seen on `day` would never be counted with (their stamps stand): fetch-data
 * stops before it writes them, but with --early (they came before it).
 */
export const releaseAhead = (/** @type {string} */ day) => RELEASES.find((r) => r.from > day && dayNumber(r.from) - dayNumber(day) <= 30);

/**
 * The run's last words: what came, went, was renamed, changed and was left out.
 * An item added is stamped with the run's `day`: the start page counts it as
 * new with the newest release in src/lib/releases.ts whose day it is on or
 * after, so a new league's refresh adds that release first. A unique left
 * out for want of a picture (poe2db has it from the game's data before its
 * art) waits for a refresh that has one; one whose art folder no rule sorts
 * (a new weapon class) waits for its rule, `unsorted` (name and folder).
 * `categories`: how many items each category holds, which should stay
 * near alike (balanceLines). `stamps`: every item's `added` after the run,
 * so a release's lean counts from the first of its items, as the games'
 * does (releases.ts newestCame); without them, from the release's day.
 * @param {{ added?: string[], renamed?: Rename[], dropped?: string[], changed?: { name: string, fields: string[] }[], leftOut?: string[], noPicture?: string[], unsorted?: string[], newArt?: string[], day?: string, categories?: Record<string, number>, stamps?: string[] }} what
 */
export function summaryLines({ added = [], renamed = [], dropped = [], changed = [], leftOut = [], noPicture = [], unsorted = [], newArt = [], day = '', categories, stamps = [] }) {
  const lines = ['Summary:'];
  /** @param {string} label @param {string[]} names */
  const list = (label, names) => lines.push(`  ${label} (${names.length})${names.length ? `: ${names.join(', ')}` : ''}`);
  list('Added', added);
  list('Renamed', renamed.map((r) => `${r.from} => ${r.to}`));
  list('Dropped', dropped);
  list('Changed', changed.map((c) => `${c.name} (${c.fields.join('; ')})`));
  list('New art for an item kept', newArt);
  list('Left out, no tooltip', leftOut);
  list('Left out, no picture yet', noPicture);
  list('Left out, no rule for its art folder (CATEGORY_RULES in scripts/fetch-data.mjs)', unsorted);
  if (added.length && day)
    lines.push(`  The ${added.length} added are first seen ${day}: the start page counts them as the newest release's in src/lib/releases.ts, if it starts on or before that day (a new league's refresh adds its release there first).`);
  // A release listed to start soon after: items first seen before its day are never its own.
  const next = added.length && day ? releaseAhead(day) : undefined;
  if (next)
    lines.push(`  ${next.name} starts ${next.from}, after this run's day: the ${added.length} added count as the release before's for good (no week of their own on Today's unique, no lean in the games). If they are ${next.name}'s, put the data back and run again on its day.`);
  // The release they count as: in its first weeks the games lean to its items, which a page from before it can't name; long after, a league not listed yet.
  const newest = added.length && day ? RELEASES.findLast((r) => r.from <= day) : undefined;
  const first = newest && (stamps.filter((s) => s >= newest.from).sort()[0] ?? newest.from);
  if (newest && first && dayNumber(day) - dayNumber(first) <= NEW_HALF_DAYS + NEW_FADE_DAYS)
    lines.push(`  The games lean to ${newest.name}'s items for now: bump PROTOCOL_VERSION (src/lib/protocol.ts), so a guest whose page came before them loads again rather than meet items it can't name.`);
  else if (newest)
    lines.push(`  They count as ${newest.name}'s, whose lean on new items is over: if they came with a new league, add its row to RELEASES (src/lib/releases.ts) and run again, or they get no week or lean of their own.`);
  if (categories) lines.push(...balanceLines(categories));
  return lines;
}

/**
 * How far apart the categories' sizes may grow: the largest this many times
 * the smallest. The cards come up alike, so each category is played about
 * as often as any, and an item of a small one comes up as many times as
 * often as one of a large one; a player who knows a small category is
 * safer on its card. Today's unique asks a category as often as it has
 * items. Before 1.0 it was 1.92 already (Body Armours 71, One-Handed
 * Weapons 37), past this.
 */
export const BALANCE_LIMIT = 1.5;

/**
 * The categories, largest first, and how many times the smallest the
 * largest is; past BALANCE_LIMIT, a warning (the categories are the game's
 * ten, each with its card: splitting them anew is a call for the owner).
 * @param {Record<string, number>} categories
 */
export function balanceLines(categories) {
  const sizes = Object.entries(categories).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  if (!sizes.length) return [];
  const [largest, smallest] = [sizes[0], sizes[sizes.length - 1]];
  const spread = largest[1] / smallest[1];
  const lines = [`  Categories, largest first: ${sizes.map(([c, n]) => `${c} ${n}`).join(', ')} (the largest ${spread.toFixed(2)} times the smallest)`];
  if (spread > BALANCE_LIMIT)
    lines.push(`  ${largest[0]} has grown past ${BALANCE_LIMIT} times ${smallest[0]}: worth asking the owner whether the categories should split differently (CATEGORY_RULES in scripts/fetch-data.mjs).`);
  return lines;
}
