import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneData, ENV_TONES, ENVIRONMENTS, lookErrors, motionErrors, stopsOf, type Backdrops, type Look, type ZoneBackdrop } from '../src/lib/backdropData.ts';
import { EFFECT_FLOOR } from '../src/lib/archetypes.ts';
import { generate, generateStratum, hsv, hueDistance, hueOf, pickTone, rng } from '../src/lib/backdropGen.ts';
import { archetypeAt, endgame, endgameAt, isPinned, likenessAt, SHIPPED, setBackdrops, seedAt, signatureAt, TRIES, VIVID, zones, zoneSignatures } from '../src/lib/backdrops.ts';
import { lookOf, STRATA } from '../src/lib/descent.ts';
import { PROFILE_NAMES } from '../src/lib/emberProfiles.ts';
import { colourDistance, difference, EFFECTS, lchOf, nearest, parts, signatureOf, toneDistance, UNLIKE, type Signature } from '../src/lib/likeness.ts';

/** Stratum `k` as generated from `seed` (its archetype, steered clear of the zones), not re-rolled. */
const made = (k: number, seed: number) => generateStratum(seed, endgame.settings, archetypeAt(k), { avoid: zoneSignatures(), vivid: VIVID });

const FIRST = STRATA.length;
/** The strata checked run from the first past the zones (k 10, stratum 11: depths 101 to 110) to k 1009 (depth 10100). */
const LAST = 1010;

/** Runs `f` with `data` shown in place of the file's (the tool's hook), then puts the file's back. */
function withBackdrops(data: Backdrops, f: () => void) {
  setBackdrops(data);
  try {
    f();
  } finally {
    setBackdrops(SHIPPED);
  }
}

/** The zones' signatures, worked out here from the zones as they are now (not the generator's own). */
const zoneSigs = () => zones.map((z) => signatureOf(z));

/** Every colour of a zone's look turned round the wheel by `deg`. */
function recoloured(z: ZoneBackdrop, deg: number): ZoneBackdrop {
  const turn = (c: readonly number[], scale = 255) => {
    const { hue, sat } = hueOf(c);
    return hsv(hue + deg, sat, Math.max(...c) / scale).map((v) => (scale === 255 ? Math.round(v * 255) : Math.round(v * 100) / 100)) as [number, number, number];
  };
  const look = cloneData(z.look);
  for (const k of ['smoke', 'smokeB', 'smokeHi', 'smokeHiB', 'floor', 'haze', 'glow', 'mist'] as const) look[k] = turn(look[k]);
  look.ember = turn(look.ember, 1);
  for (const t of Object.values(look.tones)) t!.colors = t!.colors.map((c) => turn(c));
  return { ...z, look };
}

test('the likeness measure: 0 for the same, symmetric, within 0 to 1, never NaN', () => {
  const sigs = zoneSigs();
  for (const a of sigs) {
    assert.ok(Math.abs(difference(a, a)) < 1e-12);
    for (const b of sigs) {
      const d = difference(a, b);
      assert.ok(Number.isFinite(d) && d >= 0 && d <= 1);
      assert.ok(Math.abs(d - difference(b, a)) < 1e-12, 'symmetric');
    }
  }
  // Colours: a grey has no chroma, so two greys differ by lightness alone;
  // a hue a half turn away counts as much as both colours are vivid.
  assert.ok(lchOf([90, 90, 90])[1] < 1e-3);
  assert.ok(Math.abs(colourDistance(lchOf([90, 90, 90]), lchOf([120, 120, 120])) - Math.abs(lchOf([90, 90, 90])[0] - lchOf([120, 120, 120])[0]) / 0.2) < 1e-9);
  const muted = colourDistance(lchOf([110, 95, 85]), lchOf([85, 95, 110]));
  const vivid = colourDistance(lchOf([160, 80, 30]), lchOf([30, 80, 160]));
  assert.ok(vivid > 2 * muted, `${vivid} against ${muted}`);
});

test('the measure reads a backdrop as a viewer does: recoloured a little or emptied of its effects, a zone is still itself; another zone is not', (t) => {
  const sigs = zoneSigs();
  zones.forEach((z, i) => {
    assert.ok(difference(signatureOf(recoloured(z, 15)), sigs[i]) < UNLIKE, `${z.name} recoloured by 15 degrees`);
    const bare = { look: { ...cloneData(z.look), env: z.look.env.map(() => 0) }, motion: z.motion };
    assert.ok(difference(signatureOf(bare), sigs[i]) < UNLIKE, `${z.name} without its effects`);
  });
  // The more it is recoloured, the less alike (on the whole).
  const mean = (deg: number) => zones.reduce((s, z, i) => s + difference(signatureOf(recoloured(z, deg)), sigs[i]), 0) / zones.length;
  assert.ok(mean(15) < mean(30) && mean(30) < mean(60) && mean(60) < mean(90));
  // The effect set is the strongest cue: it weighs most, and a zone's look
  // with its effects swapped for two it has none of differs by all of it,
  // more than recoloured by 15 degrees.
  zones.forEach((z, i) => {
    const swapped = cloneData(z.look);
    swapped.env = z.look.env.map(() => 0);
    const free = ENVIRONMENTS.map((_, j) => j).filter((j) => !(z.look.env[j] > 0));
    for (const j of free.slice(0, 2)) swapped.env[j] = 0.6;
    const sig = signatureOf({ look: swapped, motion: z.motion });
    assert.equal(parts(sig, sigs[i]).effects, 1);
    assert.ok(difference(sig, sigs[i]) >= EFFECTS - 1e-9);
    assert.ok(difference(sig, sigs[i]) > difference(signatureOf(recoloured(z, 15)), sigs[i]), `${z.name}: effects swapped`);
  });
  // A void's colour counts: the same effects in other colours share less.
  const abyss = zones.find((z) => z.name === 'Abyssal Depths')!;
  const green = cloneData(abyss.look);
  green.tones.void = { colors: [[200, 255, 190], [60, 220, 40], [20, 120, 30]], vary: 0.4 };
  assert.ok(parts(signatureOf({ look: green, motion: abyss.motion }), signatureOf(abyss)).effects > 0);
  let least = 1;
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) least = Math.min(least, difference(sigs[i], sigs[j]));
  t.diagnostic(`the two most alike zones differ by ${least.toFixed(3)} (the bar is ${UNLIKE})`);
});

test(`the endgame's strata, 101 to ${LAST}, are each clearly unlike every hand-made zone and the stratum before (the first, Primeval Ruins)`, (t) => {
  const sigs = zoneSigs();
  let rolled = 0;
  let most = 0;
  for (let k = FIRST; k < LAST; k++) {
    const g = endgameAt(k);
    const sig = signatureAt(g);
    const near = nearest(sig, sigs);
    assert.ok(near.difference >= UNLIKE, `stratum ${k + 1} is too like ${zones[near.index].name} (${near.difference.toFixed(3)})`);
    const before = k === FIRST ? sigs[FIRST - 1] : signatureAt(endgameAt(k - 1));
    const d = difference(sig, before);
    assert.ok(d >= UNLIKE, `stratum ${k + 1} is too like the one before (${d.toFixed(3)})`);
    assert.equal(likenessAt(k).before, d);
    if (g.rolled) rolled++;
    most = Math.max(most, g.rolled);
  }
  assert.ok(most < TRIES, 'every stratum found a seed unlike enough within its tries');
  t.diagnostic(`${rolled} of ${LAST - FIRST} strata re-rolled, at most ${most} seeds on`);
});

test('with the zones retuned (a draft where zones copy typical generated looks), the strata steer clear of the zones as they are now', () => {
  const draft = cloneData(SHIPPED);
  // Fungal Caverns becomes stratum 16's look as it is now, Primeval Ruins stratum 40's.
  const copy = (zi: number, k: number) => {
    const g = endgameAt(k);
    draft.zones[zi] = { ...draft.zones[zi], look: { ...cloneData(g.look), lightK: 1 }, motion: cloneData(g.motion), measured: false };
    return g;
  };
  const a = copy(3, 15);
  const b = copy(9, 39);
  withBackdrops(draft, () => {
    const sigs = zoneSigs();
    for (let k = FIRST; k < 400; k++) {
      const sig = signatureAt(endgameAt(k));
      const near = nearest(sig, sigs);
      assert.ok(near.difference >= UNLIKE, `stratum ${k + 1} too like the draft's ${zones[near.index].name} (${near.difference.toFixed(3)})`);
      const before = k === FIRST ? sigs[FIRST - 1] : signatureAt(endgameAt(k - 1));
      assert.ok(difference(sig, before) >= UNLIKE, `stratum ${k + 1} too like the one before`);
    }
    // The strata whose looks the zones took look otherwise now.
    assert.notDeepEqual(endgameAt(15).look, a.look);
    assert.notDeepEqual(endgameAt(39).look, b.look);
  });
});

test("the endgame's strata are the same for everyone, whichever is asked for first", () => {
  setBackdrops(SHIPPED);
  const ks = [FIRST, FIRST + 1, FIRST + 2, 57, 58, 333, 334, 999];
  const down = [...ks].reverse().map((k) => JSON.stringify(endgameAt(k)));
  setBackdrops(SHIPPED);
  for (let k = FIRST; k < 1000; k++) endgameAt(k);
  const up = [...ks].reverse().map((k) => JSON.stringify(endgameAt(k)));
  assert.deepEqual(down, up);
  // And as generated from its seed, by anyone.
  for (const k of ks) {
    const g = endgameAt(k);
    assert.deepEqual(g, { ...made(k, g.seed), rolled: g.rolled });
  }
});

test('a pinned seed is never re-rolled, even too like a zone: the tool only warns of it, and its neighbours steer clear', () => {
  // A stratum and a seed that comes out too like a zone there.
  let k = 20;
  let bad = -1;
  for (; k < 80 && bad < 0; k += 2) {
    for (let s = 0; s < 400 && bad < 0; s++) {
      const sig = signatureOf(made(k, s));
      if (nearest(sig, zoneSignatures()).difference < UNLIKE) bad = s;
    }
  }
  k -= 2;
  assert.ok(bad >= 0, 'a seed too like a zone exists');
  const draft = cloneData(SHIPPED);
  draft.endgame.pinned[String(k + 1)] = bad;
  draft.endgame.pinned[String(k + 3)] = 4242;
  draft.endgame.pinned[String(k + 4)] = 4243;
  withBackdrops(draft, () => {
    for (const [j, seed] of [[k, bad], [k + 2, 4242], [k + 3, 4243]]) {
      assert.ok(isPinned(j));
      const g = endgameAt(j);
      assert.equal(g.seed, seed);
      assert.equal(g.rolled, 0);
      assert.deepEqual(g, made(j, seed));
    }
    // Its likeness says so (the tool's warning).
    assert.ok(likenessAt(k).difference < UNLIKE);
    // The unpinned strata round the pins keep clear of them.
    for (const j of [k - 1, k + 1, k + 4]) {
      const sig = signatureAt(endgameAt(j));
      if (isPinned(j - 1)) assert.ok(difference(sig, signatureAt(endgameAt(j - 1))) >= UNLIKE, `stratum ${j + 1} too like the pinned one before`);
      if (isPinned(j + 1)) assert.ok(difference(sig, signatureAt(endgameAt(j + 1))) >= UNLIKE, `stratum ${j + 1} too like the pinned one after`);
    }
    // A seed tried in the tool is shown as it comes, never re-rolled.
    const tried = endgameAt(30, bad);
    assert.equal(tried.seed, bad);
    assert.equal(tried.rolled, 0);
  });
  // Unpinned again, it is its own.
  assert.equal(seedAt(k), (endgameAt(k).seed - endgameAt(k).rolled) >>> 0);
});

test('no NaNs: every generated look, motion and signature is whole', () => {
  for (let k = FIRST; k < LAST; k += 7) {
    const g = endgameAt(k);
    assert.deepEqual(lookErrors(g.look), [], `stratum ${k + 1}`);
    assert.deepEqual(motionErrors(g.motion, PROFILE_NAMES), [], `stratum ${k + 1}`);
    assert.deepEqual(lookErrors(lookOf(k)), []);
    const sig: Signature = signatureAt(g);
    const tones = sig.fxTone.flatMap((t) => (t ? t.flat() : []));
    for (const v of [...sig.dominant, ...sig.palette.flat(), ...sig.fx, ...tones, ...sig.ember, ...sig.motion, sig.bright, sig.wheel, sig.chroma]) assert.ok(Number.isFinite(v), `stratum ${k + 1}: ${v}`);
    const l = likenessAt(k);
    assert.ok([l.difference, l.before, l.after].every(Number.isFinite));
  }
  for (const k of [1e5 + 7, 1e8 + 3]) assert.ok(Number.isFinite(likenessAt(k).difference));
});

test("the endgame is more colourful than the zones' generator, still within each effect's colour rules and the start page's style", (t) => {
  const chroma = (l: Look) => [l.smoke, l.smokeB, l.smokeHi, l.smokeHiB].reduce((s, c) => s + lchOf(c)[1], 0) / 4;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const steered: number[] = [];
  const plain: number[] = [];
  const hue = (c: readonly number[]) => hueOf(c).hue;
  for (let k = FIRST; k < 600; k++) {
    const g = endgameAt(k);
    const l = g.look;
    steered.push(chroma(l));
    plain.push(chroma(generate(g.seed, endgame.settings).look));
    // The smoke's low drifts and its high right one a few neighbouring hues, as on the start page; the rest may take the accents. Muted values.
    for (const c of [l.smoke, l.smokeB, l.smokeHi]) {
      const { hue: h, sat } = hueOf(c);
      if (sat > 0.15) assert.ok(hueDistance(h, g.hue) <= 60, `stratum ${k + 1}: ${c} off the hue`);
    }
    for (const c of [l.smoke, l.smokeB, l.smokeHi, l.smokeHiB, l.floor, l.haze, l.glow]) assert.ok(hueOf(c).sat <= 0.96 && Math.max(...c) <= 200, `stratum ${k + 1}: ${c} too bright`);
    // One or two effects, each clearly there but quiet, no trunks, in their kinds' colours.
    const details = l.env.filter((v) => v > 0);
    assert.ok(details.length >= 1 && details.length <= 2 && details.every((v) => v >= EFFECT_FLOOR && v <= 0.65));
    assert.ok(l.env[ENVIRONMENTS.indexOf('mist')] < 0.45);
    l.env.forEach((e, i) => {
      if (!(e > 0)) return;
      const name = ENVIRONMENTS[i];
      const tone = l.tones[name]!;
      const rule = ENV_TONES[name];
      const own = stopsOf(rule.tone);
      assert.ok(hueDistance(hue(tone.colors[1]), hue(own[1])) <= Math.max(-rule.turn[0], rule.turn[1]) + 3, `stratum ${k + 1}: ${name} turned too far`);
      assert.ok(tone.vary >= rule.vary[0] - 1e-9 && tone.vary <= rule.vary[1] + 1e-9);
      tone.colors.forEach((c, s) => assert.ok(Math.abs(Math.max(...c) - Math.max(...own[s])) <= 1));
      if (name === 'magma' || name === 'heat') for (const c of tone.colors) assert.ok(hueDistance(hue(c), 15) <= 45);
      if (name === 'frost') for (const c of tone.colors) assert.ok(hueOf(c).sat < 0.12 || hueDistance(hue(c), 215) <= 35);
    });
  }
  assert.ok(mean(steered) > 1.1 * mean(plain), `the endgame's smoke ${mean(steered).toFixed(3)} against ${mean(plain).toFixed(3)} from the zones' generator`);
  t.diagnostic(`smoke chroma (OKLCh): the endgame's ${mean(steered).toFixed(3)}, the zones' generator's ${mean(plain).toFixed(3)}, the zones' ${mean(zones.map((z) => chroma(z.look))).toFixed(3)}`);
});

test("an effect a zone shows is coloured unlike that zone's, near the colours its archetype has for it", () => {
  let steered = 0;
  let plain = 0;
  let n = 0;
  const sigs = zoneSignatures();
  for (let k = FIRST; k < 400; k++) {
    const g = endgameAt(k);
    g.look.env.forEach((e, i) => {
      if (!(e > 0)) return;
      const theirs = sigs.filter((z) => z.fx[i] > 0).map((z) => z.fxTone[i]!);
      if (!theirs.length) return;
      const name = ENVIRONMENTS[i];
      const far = (tone: { colors: number[][] }) => Math.min(...theirs.map((z) => toneDistance(i, tone.colors.map((c) => lchOf(c)), z)));
      // The same colours picked without a zone to keep from (the same stream of numbers, so the same aim).
      const hueNow = hueOf(stopsOf(g.look.tones[name]!)[1]).hue;
      const free = pickTone(name, hueNow, rng(1234 + k), { avoid: [], sat: [0.4, 0.9], bold: VIVID });
      const kept = pickTone(name, hueNow, rng(1234 + k), { avoid: sigs, sat: [0.4, 0.9], bold: VIVID });
      steered += far(kept);
      plain += far(free);
      n++;
    });
  }
  assert.ok(n > 50, `${n} effects a zone shows`);
  assert.ok(steered > plain, `kept from the zones' colours by ${(steered / n).toFixed(3)} against ${(plain / n).toFixed(3)}`);
});

test('the generator stays cheap: 1000 strata, steered and re-rolled where needed', (t) => {
  setBackdrops(SHIPPED);
  const start = performance.now();
  for (let k = FIRST; k < FIRST + 1000; k++) endgameAt(k);
  const ms = performance.now() - start;
  t.diagnostic(`1000 strata in ${ms.toFixed(0)} ms (${ms.toFixed(0)} µs a stratum)`);
  assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
});
