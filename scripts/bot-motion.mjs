// Cuts recordings of real play (made with ?record, src/lib/recorder.ts) into
// the room bots' motion library, src/data/botMotion.json: the pointer as a
// person moved it, in stretches the bots replay (src/bot/motion.ts):
//
// - card: picking a category, from the cards coming up to the click;
// - answer: a question, from its showing to the click on an answer;
// - next: a reveal, from its showing to the click on Next;
// - wait: someone else's turn (their card and question), clicks at
//   nothing and all;
// - lobby: waiting in the lobby, its clicks left out.
//
// Positions are kept relative to what was on screen (the cards, the answers
// and the art, the lobby's rows and modes: 0 to 1000 across and down them,
// beyond on either side), so they map onto any screen, with that frame's
// size in pixels (`size`) for how far off it a place beyond it lies; a
// click's spot relative to what it pressed. A click's stretch also keeps
// where its lead rested (`dwells`: from which sample to which, on which
// answer or card if any, and where on it) and which one it picked in the
// end (`pick`), so a bot can rest on its own. Sampled every STEP ms. The recordings
// themselves stay out of the repo: only these paths go in.
//
//   node scripts/bot-motion.mjs recording.json [more.json...]

import { readFileSync, writeFileSync } from 'node:fs';

const STEP = 50;
/** A pause, before a click's final reach (ms). */
const PAUSE_MS = 150;
/** A rest in a lead: the pointer still for this many samples or more. */
const REST_SAMPLES = 4;
const OUT = new URL('../src/data/botMotion.json', import.meta.url);

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/bot-motion.mjs recording.json [more.json...]');
  process.exit(2);
}

const episodes = [];
for (const file of files) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const T = [];
  const X = [];
  const Y = [];
  for (let i = 0; i < r.moves.length; i += 3) {
    T.push(r.moves[i]);
    X.push(r.moves[i + 1]);
    Y.push(r.moves[i + 2]);
  }
  const lastIndex = (arr, t) => {
    let lo = 0;
    let hi = arr.length - 1;
    if (!arr.length || arr[0] > t) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const at = (t) => {
    const i = Math.max(0, lastIndex(T, t));
    return [X[i], Y[i]];
  };
  const layouts = r.layouts;
  const LT = layouts.map((l) => l.t);
  const scenes = r.scenes;
  const downs = r.happenings.filter((h) => h[1] === 'down' && h[2] === 0);
  const ups = r.happenings.filter((h) => h[1] === 'up' && h[2] === 0);
  const holdOf = (t) => {
    const u = ups.find((h) => h[0] >= t);
    return u ? Math.min(300, Math.max(40, Math.round(u[0] - t))) : 90;
  };

  /** The union of the boxes `pick` takes, in the latest layout from..to that has any. */
  const frame = (from, to, pick) => {
    for (let i = lastIndex(LT, to); i >= 0 && LT[i] >= from - 50; i--) {
      const bs = Object.entries(layouts[i].boxes).filter(([k]) => pick(k)).map(([, b]) => b);
      if (bs.length) return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
    }
    return null;
  };
  const boxAt = (t, x, y, prefix) => {
    const l = layouts[Math.max(0, lastIndex(LT, t))];
    return Object.entries(l.boxes).find(([k, b]) => k.startsWith(prefix) && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) ?? null;
  };
  const isCard = (k) => k.startsWith('card:');
  const isAnswer = (k) => k.startsWith('opt:') || k === 'art';
  const isLobby = (k) => k.startsWith('row:') || k.startsWith('card:');
  const rel = (x, y, f) => [Math.round(((x - f[0]) / (f[2] - f[0])) * 1000), Math.round(((y - f[1]) / (f[3] - f[1])) * 1000)];
  const sizeOf = (f) => [Math.round(f[2] - f[0]), Math.round(f[3] - f[1])];
  /** The pointer from..to every STEP ms, relative to `frameAt(t)`. */
  const path = (from, to, frameAt) => {
    const out = [];
    for (let t = from; t <= to + 1e-6; t += STEP) {
      const f = frameAt(t);
      if (!f) return null;
      out.push(...rel(...at(t), f));
    }
    return out;
  };

  // The scenes as stretches: a phase, whose turn, from when to when.
  const spans = [];
  scenes.forEach((s, i) => {
    const end = scenes[i + 1]?.t ?? T.at(-1);
    const last = spans.at(-1);
    if (last && last.phase === s.phase && last.round === s.round && last.turn === s.turn) last.end = end;
    else spans.push({ phase: s.phase, round: s.round, turn: s.turn, mine: s.mine, players: s.players, mode: s.question?.mode, n: s.question?.labels.length ?? s.offered.length, t: s.t, end });
  });

  /** Own turn: from the stretch's start to the first click on `prefix`, cut at its final reach. */
  const clicked = (span, kind, prefix, framed, extra = {}) => {
    const d = downs.find((h) => h[0] >= span.t && h[0] <= span.end + 300 && (prefix ? boxAt(h[0], h[3], h[4], prefix) : true));
    if (!d) return;
    const f = frame(span.t, d[0] + 1500, framed);
    if (!f) return;
    // The final reach: from the last pause before the click.
    let i = lastIndex(T, d[0]);
    while (i > 0 && T[i] - T[i - 1] < PAUSE_MS && d[0] - T[i - 1] < 2500) i--;
    const reachAt = Math.max(span.t, Math.min(T[Math.max(0, i)], d[0] - 120));
    const lead = path(span.t, reachAt, () => f);
    const reach = path(reachAt, d[0], () => f);
    if (!lead || !reach) return;
    const hit = prefix ? boxAt(d[0], d[3], d[4], prefix) : null;
    const aim = hit ? rel(d[3], d[4], hit[1]) : rel(d[3], d[4], f);
    // Where the lead rested: [first sample, last sample, on which (its index; -1: none), where on it across, down].
    const dwells = [];
    const n = lead.length / 2;
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && lead[2 * j + 2] === lead[2 * i] && lead[2 * j + 3] === lead[2 * i + 1]) j++;
      if (j - i + 1 >= REST_SAMPLES) {
        const t = span.t + i * STEP;
        const [x, y] = at(t);
        const on = prefix ? boxAt(t + 400, x, y, prefix) : null;
        const [ru, rv] = on ? rel(x, y, on[1]) : [0, 0];
        dwells.push(i, j, on ? Number(on[0].split(':')[1]) : -1, ru, rv);
      }
      i = j + 1;
    }
    episodes.push({ kind, ...extra, size: sizeOf(f), lead, reach, aim, hold: holdOf(d[0]), dwells, pick: hit ? Number(hit[0].split(':')[1]) : -1 });
  };

  for (const span of spans) {
    if (!span.mine || span.end - span.t < 300) continue;
    if (span.phase === 'choosing') clicked(span, 'card', 'card:', isCard, { n: span.n });
    else if (span.phase === 'question') clicked(span, 'answer', 'opt:', isAnswer, { mode: span.mode, n: span.n });
    else if (span.phase === 'reveal') {
      // Next: the first click in a reveal off the answers.
      const d = downs.find((h) => h[0] >= span.t && h[0] <= span.end + 300 && !boxAt(h[0], h[3], h[4], 'opt:'));
      if (d) clicked({ ...span, end: d[0] }, 'next', null, isAnswer);
    }
  }

  // Someone else's turn: their card and their question, as one stretch, with its clicks at nothing.
  for (let i = 0; i < spans.length; i++) {
    const a = spans[i];
    if (a.mine || a.players < 2 || a.phase !== 'choosing') continue;
    const b = spans[i + 1]?.phase === 'question' && !spans[i + 1].mine ? spans[i + 1] : a;
    const from = a.t + 300;
    const to = b.end;
    if (to - from < 2000) continue;
    const cards = frame(a.t, b === a ? a.end : b.t, isCard);
    const answers = b === a ? null : frame(b.t, b.end, isAnswer);
    const frameAt = (t) => (t < b.t || !answers ? cards : answers);
    const p = path(from, to, frameAt);
    if (!p) continue;
    const presses = downs.filter((h) => h[0] >= from && h[0] <= to).map((h) => Math.round(h[0] - from));
    // Its frame, and from which sample on the second one (the answers) if it changes.
    const switchAt = answers ? Math.max(0, Math.ceil((b.t - from) / STEP)) : p.length / 2;
    episodes.push({ kind: 'wait', size: sizeOf(cards), ...(answers ? { then: sizeOf(answers), switchAt } : {}), path: p, presses });
  }

  // The lobby: in stretches between its clicks.
  for (const span of spans) {
    if (span.phase !== 'lobby' || span.end - span.t < 5000) continue;
    const f = frame(span.t, span.end, isLobby);
    if (!f) continue;
    const cuts = [span.t + 500, ...downs.filter((h) => h[0] > span.t && h[0] < span.end).map((h) => h[0]), span.end];
    for (let i = 1; i < cuts.length; i++) {
      // Clicks left out: a little before and after each.
      const from = cuts[i - 1] + (i > 1 ? 400 : 0);
      const to = cuts[i] - 600;
      if (to - from < 3000) continue;
      const p = path(from, to, () => f);
      if (p) episodes.push({ kind: 'lobby', size: sizeOf(f), path: p });
    }
  }
}

const count = (kind) => episodes.filter((e) => e.kind === kind).length;
writeFileSync(OUT, JSON.stringify({ v: 1, step: STEP, episodes }) + '\n');
console.log(`${episodes.length} stretches: ${['card', 'answer', 'next', 'wait', 'lobby'].map((k) => `${count(k)} ${k}`).join(', ')}`);
