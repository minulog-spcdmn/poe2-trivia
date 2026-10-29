// What a refresh (npm run fetch-data) changes, worked out from the items
// before and the items fetched, with nothing read or written: which items
// came, went, were renamed or changed, and whether the run may go on.
// scripts/fetch-data.mjs acts on it; tests/refreshPlan.test.ts tries it on
// made-up lists.

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
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shrink') {
      shrink = true;
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
  return { shrink, renames, drops };
}

/** @param {string} s */
const quote = (s) => `"${s.replace(/"/g, '\\"')}"`;

/**
 * Matches the items fetched (`after`) to those before (`before`, items.json),
 * by name. A renamed item takes the old one's id, so codexes and
 * achievements, which keep ids, still know it: `after` is changed to say so.
 * An item that is gone with no --rename or --drop to explain it, or an
 * option that doesn't fit the lists, throws before anything is written,
 * saying how to rerun.
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
      `For example: npm run fetch-data -- ${gone
        .map((name, i) => (added[i] ? `--rename ${quote(`${name}=>${added[i]}`)}` : `--drop ${quote(name)}`))
        .join(' ')}`,
    );
    errors.push(lines.join('\n'));
  }
  // `stop`: a refusal to go on, said in full, not a fault (fetch-data prints no stack for it).
  if (errors.length) throw Object.assign(new Error(errors.join('\n')), { stop: true });
  return { added, renamed, dropped };
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
 * The run's last words: what came, went, was renamed, changed and was left out.
 * @param {{ added?: string[], renamed?: Rename[], dropped?: string[], changed?: { name: string, fields: string[] }[], leftOut?: string[], newArt?: string[] }} what
 */
export function summaryLines({ added = [], renamed = [], dropped = [], changed = [], leftOut = [], newArt = [] }) {
  const lines = ['Summary:'];
  /** @param {string} label @param {string[]} names */
  const list = (label, names) => lines.push(`  ${label} (${names.length})${names.length ? `: ${names.join(', ')}` : ''}`);
  list('Added', added);
  list('Renamed', renamed.map((r) => `${r.from} => ${r.to}`));
  list('Dropped', dropped);
  list('Changed', changed.map((c) => `${c.name} (${c.fields.join('; ')})`));
  list('New art for an item kept', newArt);
  list('Left out, no tooltip', leftOut);
  return lines;
}
