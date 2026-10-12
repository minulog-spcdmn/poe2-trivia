// Delve's zone title card: what it says for every place (lib/zoneTitle.ts),
// when it says it in the plunge (lib/zoneTitleTiming.ts), and the sigil on
// its seal (lib/zoneSigils.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaLine, NEWS_MOST, SUBTITLE_MOST, SUBTITLES, TREATMENTS, subtitleAt, treatmentAt, zoneNews, zoneTitleAt, type Family } from '../src/lib/zoneTitle.ts';
import { T, drawPlan, glowAt, timeline } from '../src/lib/zoneTitleTiming.ts';
import { ARCHETYPES, composedNames, NAME_MOST } from '../src/lib/archetypes.ts';
import { biomeAt, emblemOf } from '../src/lib/backdrops.ts';
import { STRATA, stratumName } from '../src/lib/descent.ts';
import { opensZone, ZONE_DESCENT_MS } from '../src/lib/delve.ts';
import { sigilOf, sigilStrokes, SIGIL_NAMES, zoneAt } from '../src/lib/zoneSigils.ts';
import { roman } from '../src/lib/roman.ts';

/** The dash the house never uses (CLAUDE.md), made from its code so this file doesn't hold one. */
const DASH = String.fromCharCode(0x2014);

const PLACES = [...STRATA.map((s) => s.name), ...ARCHETYPES.map((a) => a.kind)];

test('every place has a treatment and a subtitle: every zone, and every kind of place past 100', () => {
  for (const p of PLACES) {
    assert.ok(TREATMENTS[p], `no treatment for ${p}`);
    assert.ok(SUBTITLES[p], `no subtitle for ${p}`);
  }
  for (let k = 0; k < 300; k++) {
    assert.ok(TREATMENTS[biomeAt(k)], `stratum ${k}`);
    assert.equal(treatmentAt(10 * k + 1), TREATMENTS[biomeAt(k)]);
    assert.equal(subtitleAt(10 * k + 5), SUBTITLES[biomeAt(k)]);
  }
  // Every family is someone's.
  const families: Family[] = ['ember', 'rime', 'spore', 'void', 'light', 'fume'];
  for (const f of families) assert.ok(Object.values(TREATMENTS).some((t) => t.family === f), f);
  // Fire burns, ice shatters, the void pulls; the rest drift.
  assert.equal(TREATMENTS['Magma Fissure'].tint, 'zoneBurn');
  assert.equal(TREATMENTS['Frozen Hollow'].tint, 'zoneShatter');
  assert.equal(TREATMENTS['Abyssal Depths'].tint, 'zoneVoid');
  assert.equal(TREATMENTS['Sulphur Vents'].tint, 'zoneDrift');
});

test('the subtitles are one short line each, without a full stop or an em dash', () => {
  for (const [place, line] of Object.entries(SUBTITLES)) {
    assert.ok(line.length >= 10 && line.length <= SUBTITLE_MOST, `${place}: ${line.length} characters`);
    assert.ok(!line.endsWith('.'), place);
    assert.ok(!line.includes(DASH), place);
    assert.equal(line[0], line[0].toUpperCase(), place);
  }
  assert.equal(SUBTITLE_MOST, 32);
});

test("the endgame's names are never longer than the card is made for", () => {
  const names = ARCHETYPES.flatMap((a) => [...a.names, ...composedNames(a)]);
  assert.ok(Math.max(...names.map((n) => n.length)) <= NAME_MOST);
  assert.equal(NAME_MOST, 20);
});

test('the meta line: the depth as players count it and the zone in numerals, or a new best', () => {
  assert.equal(metaLine(11), 'Depth 10 • Zone II');
  assert.equal(metaLine(91), 'Depth 90 • Zone X');
  assert.equal(metaLine(101), 'Depth 100 • Zone XI');
  assert.equal(metaLine(41, true), 'Depth 40 • Deeper than ever');
  assert.deepEqual([1, 4, 9, 14, 40, 90, 99, 400].map(roman), ['I', 'IV', 'IX', 'XIV', 'XL', 'XC', 'XCIX', 'CD']);
});

test('what is new in each zone: finds, rules starting or reaching every question, twins, steps and the clock, three at most', () => {
  const said = (d: number) => zoneNews(d).map((n) => ('count' in n.mark ? `${n.mark.count} ${n.label}` : n.label));
  assert.deepEqual(said(11), ['Dynamite Cache', '6 Options', 'Mirrored art']);
  assert.deepEqual(said(21), ['4 Turns of lockout', 'Art burns in', 'Azurite Vein']);
  assert.deepEqual(said(31), ['8 Options', '5 Turns of lockout', '11 Seconds to answer']);
  assert.deepEqual(said(41), ['Flare Cache', 'Art without colour', 'Look-alike art']);
  assert.deepEqual(said(51), ['Twin rings and gems', '7 Seconds to answer']);
  assert.deepEqual(said(61), ['Twin sceptres', '6 Turns of lockout', '10 Options']);
  assert.deepEqual(said(71), ['Twin rings', '6 Seconds to answer', 'All names look alike']);
  assert.deepEqual(said(81), ['All art mirrored', 'All art without colour']);
  assert.deepEqual(said(91), ['7 Turns of lockout', '5 Seconds to answer']);
  assert.deepEqual(said(101), ['Finds grow scarce', 'A fourth made-up name']);
  assert.deepEqual(said(111), ['All look-alikes by art']);
  assert.deepEqual(said(141), ['Always four made-up names']);
  assert.deepEqual(said(191), ['Finds at their scarcest']);
  // Past that, nothing changes any more.
  for (const d of [121, 131, 151, 161, 171, 181, 201, 251, 391]) assert.deepEqual(said(d), [], `depth ${d}`);
  for (let d = 11; d < 400; d += 10) {
    const news = zoneNews(d);
    assert.ok(news.length <= NEWS_MOST);
    // In the order they come, each within the zone.
    for (let i = 1; i < news.length; i++) assert.ok(news[i].depth >= news[i - 1].depth);
    for (const n of news) assert.ok(n.depth >= d && n.depth < d + 10, `${n.key} at ${n.depth}`);
  }
  // A rule that holds on every question from here gets the third ring.
  assert.ok(zoneNews(81).every((n) => n.all));
  assert.ok(!zoneNews(11).some((n) => n.all));
});

test('the whole card for a zone, as a screen reader is told it', () => {
  const t = zoneTitleAt(11);
  assert.equal(t.name, 'Magma Fissure');
  assert.equal(t.sigil, 'Magma Fissure');
  assert.equal(t.spoken, 'Depth 10: Magma Fissure. Stone that never set. New here: Dynamite Cache, 6 options, mirrored art.');
  assert.equal(zoneTitleAt(51).spoken, 'Depth 50: Abyssal Depths. Light stops short of the floor. New here: twin rings and gems side by side, 7 seconds to answer.');
  assert.ok(zoneTitleAt(41, true).spoken.startsWith('Depth 40: Vaal Outpost. Deeper than ever.'));
  for (let d = 11; d < 400; d += 10) {
    assert.ok(opensZone(d));
    const z = zoneTitleAt(d);
    assert.equal(z.name, stratumName((d - 1) / 10));
    assert.ok(!(z.spoken + z.meta).includes(DASH), `depth ${d}`);
  }
});

test('the timeline: the last letter settles as the name locks, ticks never too close, and all of it gone before the deal', () => {
  const budget = ZONE_DESCENT_MS;
  for (const letterMs of [220, 560, 620, 680, 760])
    for (let n = 2; n <= 24; n++) {
      const name = 'Abcdefghijklmnopqrstuvwxyz'.slice(0, n);
      const tl = timeline(name, budget, false, letterMs, 'zoneBurn')!;
      assert.equal(tl.mode, 'full');
      assert.equal(tl.lock, T.LOCK);
      assert.equal(tl.starts.at(-1)! + letterMs, T.LOCK, `${n} letters of ${letterMs} ms`);
      assert.ok(tl.starts[0] >= Math.min(T.FIRST, T.LOCK - letterMs - 40 * (n - 1)) - 1e-9);
      for (let i = 1; i < n; i++) {
        const gap = tl.starts[i] - tl.starts[i - 1];
        assert.ok(gap >= 20 - 1e-9 && gap <= 40 + 1e-9, `gap ${gap}`);
      }
      const ticks = tl.cues.filter((c) => c.sfx === 'zoneTick').map((c) => c.at);
      for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] - ticks[i - 1] >= T.TICK_GAP - 1e-9);
      // The last letter always ticks, and every tick comes before the lock.
      assert.equal(ticks.at(-1), tl.starts.at(-1)! + letterMs * 0.3);
      assert.ok(ticks.every((t) => t < T.LOCK - 100));
      assert.ok(tl.cues.some((c) => c.sfx === 'zoneLock' && c.at === T.LOCK_SFX));
      assert.ok(tl.cues.some((c) => c.sfx === 'zoneSting' && c.at === T.STING_SFX));
      assert.ok(tl.cues.some((c) => c.sfx === 'zoneBurn' && c.at === tl.exit));
      assert.equal(tl.exit, T.EXIT);
      assert.equal(tl.gone, 6500);
    }
  // Spaces take their turn but never tick; the letters tick every other one at most (they come closer than TICK_GAP).
  const spaced = timeline('A B C D', budget, false)!;
  const ticks = spaced.cues.filter((c) => c.sfx === 'zoneTick').map((c) => c.at);
  for (const i of [1, 3, 5]) assert.ok(!ticks.includes(spaced.starts[i] + T.LETTER * 0.3));
  assert.equal(ticks.length, 4);
});

test('a card for whatever time is left: held still, compact for a late screen, none with too little', () => {
  const still = timeline('Magma Fissure', ZONE_DESCENT_MS, true, 560, 'zoneBurn')!;
  assert.equal(still.mode, 'still');
  assert.deepEqual(still.starts, []);
  assert.ok(!still.cues.some((c) => c.sfx === 'zoneTick' || c.sfx === 'zoneBurn'));
  assert.ok(still.cues.some((c) => c.sfx === 'zoneLock'));
  for (let budget = T.LEAST; budget <= 9000; budget += 50) {
    const tl = timeline('Magma Fissure', budget, false)!;
    assert.equal(tl.mode, budget < T.FULL ? 'compact' : 'full', `budget ${budget}`);
    assert.ok(tl.gone <= budget - 400, `gone at ${tl.gone} with ${budget} to the deal`);
    assert.ok(tl.exit < tl.gone && tl.showAt < tl.exit);
    for (const c of tl.cues) assert.ok(c.at < tl.exit, `${c.sfx} at ${c.at}`);
  }
  assert.equal(timeline('Magma Fissure', T.LEAST - 1, false), null);
  assert.equal(timeline('Magma Fissure', Number.NaN, false), null);
});

test('the light the card casts: kindled with the sigil, a burst at the lock, out after the exit', () => {
  const tl = { lock: T.LOCK, exit: T.EXIT };
  let peak = 0;
  for (let ms = 0; ms <= 7000; ms += 10) {
    const k = glowAt(ms, tl);
    assert.ok(k >= 0 && k <= 0.42 + 1e-9, `${k} at ${ms}`);
    peak = Math.max(peak, k);
  }
  assert.equal(glowAt(500, tl), 0);
  assert.ok(glowAt(T.LOCK + 80, tl) > 0.4);
  assert.ok(glowAt(T.EXIT - 100, tl) > 0.2);
  assert.equal(glowAt(T.EXIT + 800, tl), 0);
  assert.ok(peak > 0.41);
});

test('a broken line is drawn by one pen: its pieces in turn, quick to start and slow to end, never going back', () => {
  const plan = drawPlan([10, 30, 20, 40], 1000, 1000);
  assert.equal(plan[0].delay, 1000);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].delay >= plan[i - 1].delay + plan[i - 1].dur - 1e-9);
  const end = plan.at(-1)!;
  assert.ok(Math.abs(end.delay + end.dur - 2000) < 1e-6);
  // The first tenth of the line takes less than a tenth of the time.
  assert.ok(plan[0].dur < 100);
});

test("a sigil's strokes, split to draw themselves, are the sigil's own, nearest the centre first", () => {
  const pieces = (d: string) =>
    d
      .split(/(?=M)/)
      .map((p) => p.trim())
      .filter(Boolean)
      .sort();
  for (const name of SIGIL_NAMES) {
    const s = sigilOf(name);
    const parts = sigilStrokes(name);
    assert.deepEqual([...parts.lines].sort(), pieces(s.lines), name);
    assert.deepEqual([...parts.fine].sort(), pieces(s.fine), name);
    assert.equal(parts.shade, s.shade ?? '');
    const r = (p: string) => Math.hypot(...(p.match(/-?[\d.]+/g)!.slice(0, 2).map(Number) as [number, number]));
    for (let i = 1; i < parts.lines.length; i++) assert.ok(r(parts.lines[i]) >= r(parts.lines[i - 1]) - 1e-9, name);
  }
});

/** Every point a path's data names (of an arc, its end). */
const points = (d: string) =>
  [...d.matchAll(/([MLA])([^MLAZ]*)/g)].flatMap(([, cmd, args]) => {
    const n = args.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const step = cmd === 'A' ? 7 : 2;
    return Array.from({ length: n.length / step }, (_, i) => [n[i * step + step - 2], n[i * step + step - 1]] as [number, number]);
  });

test('every biome has a sigil of its own, within its seal', () => {
  for (const s of STRATA) assert.ok(SIGIL_NAMES.includes(s.name), s.name);
  // Past depth 100 each stratum has a name of its own, and bears its archetype's zone's emblem.
  for (let k = 10; k < 30; k++) assert.ok(SIGIL_NAMES.includes(emblemOf(stratumName(k))!), stratumName(k));
  for (const a of ARCHETYPES) assert.ok(SIGIL_NAMES.includes(a.emblem), a.kind);
  for (let k = 10; k < 30; k++) assert.deepEqual(sigilOf(stratumName(k)), sigilOf(emblemOf(stratumName(k))!));
  for (const name of SIGIL_NAMES) {
    const { lines, fine } = sigilOf(name);
    assert.ok(lines.length > 20, name);
    for (const [x, y] of points(lines + fine)) assert.ok(Math.hypot(x, y) <= 10.6, `${name} reaches ${Math.hypot(x, y).toFixed(1)}`);
  }
});

test('the zone a depth is in', () => {
  assert.equal(zoneAt(1), 'The Mines');
  assert.equal(zoneAt(10), 'The Mines');
  assert.equal(zoneAt(11), 'Magma Fissure');
  assert.equal(zoneAt(21), 'Frozen Hollow');
  assert.equal(zoneAt(100), 'Primeval Ruins');
  for (let d = 1; d <= 100; d++) assert.ok(SIGIL_NAMES.includes(zoneAt(d)), `depth ${d}`);
  // Past 100 the stratum's own name, which bears its archetype's zone's emblem.
  for (let d = 101; d < 400; d++) assert.ok(SIGIL_NAMES.includes(emblemOf(zoneAt(d))!), `depth ${d}: ${zoneAt(d)}`);
});
