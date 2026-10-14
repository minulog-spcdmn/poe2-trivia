// Cut 3's shots: hi-res, in-game sound, PoE2 NPCs as the players. `node shots3.mjs name ...`
import { openPage, done, BASE } from './rig.mjs';

const K = process.env.QUICK ? 2 : +(process.env.K || 12), DSF = process.env.QUICK ? 1 : +(process.env.DSF || 2.25);
const NPC = ['Alva', 'Gwennen', 'Zarka', 'Asala', 'Farrow', 'Rog', 'Una', 'Renly', 'Hilda', 'Tujen', 'Dannig', 'Doryani'];
const LAB_IDS = NPC.map((_, i) => `lab-${i + 1}`);

// ---- in-page helpers: the right answer, teammates' pointers (one at a time, or all wandering) ----
async function helpers(S) {
  await S.ev(async () => {
    const { peerCursors } = await import('/src/lib/peerCursors.svelte.ts');
    const { cursorKey } = await import('/src/lib/cursors.ts');
    const pos = {}, roam = {};
    const anchor = (x, y) => {
      const g = document.querySelector('[data-cursor="game"]').getBoundingClientRect();
      return [Math.round(((x - g.left) / g.width) * 1000), Math.round(((y - g.top) / innerHeight) * 1000)];
    };
    const send = (id, x, y, kind) => { const [ax, ay] = anchor(x, y); peerCursors.set(cursorKey(id), [0, ax, ay, kind]); };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const glide = (id, x, y, ms, lit) => new Promise((done) => {
      const p0 = pos[id] ?? [x + rnd(-300, 300), y + rnd(150, 400)];
      const t0 = performance.now(), bend = rnd(-0.25, 0.25);
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const dx = x - p0[0], dy = y - p0[1], arc = Math.sin(Math.PI * e) * bend;
        pos[id] = [p0[0] + dx * e - dy * arc, p0[1] + dy * e + dx * arc];
        send(id, pos[id][0], pos[id][1], lit && u > 0.6 ? 3 : 0);
        if (u < 1) setTimeout(step, 50); else done();
      };
      step();
    });
    const press = (id) => { const [x, y] = pos[id]; send(id, x, y, 5); setTimeout(() => send(id, x, y, 3), 160); };
    // Wander: each pointer drifts between the screen's anchors matching `sel`, pausing, sometimes pressing.
    const wander = (ids, sel) => {
      for (const id of ids) {
        roam[id] = true;
        const go = async () => {
          while (roam[id]) {
            const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.bottom > 0 && r.top < innerHeight; });
            if (els.length) {
              const r = els[Math.floor(Math.random() * els.length)].getBoundingClientRect();
              await glide(id, r.left + r.width * rnd(0.2, 0.8), r.top + r.height * rnd(0.25, 0.75), rnd(500, 1300), true);
              if (Math.random() < 0.25) press(id);
            }
            await new Promise((d) => setTimeout(d, rnd(250, 1400)));
          }
        };
        setTimeout(go, rnd(0, 600));
      }
    };
    window.__T = {
      rightIdx: () => { const q = window.__s.state.question; return q.options.indexOf(q.itemId); },
      wrongIdx: (k = 0) => { const q = window.__s.state.question; const w = q.options.map((_, i) => i).filter((i) => q.options[i] !== q.itemId); return w[k % w.length]; },
      peer: (id, x, y, ms, lit) => glide(id, x, y, ms, lit), press, wander,
      stop: (ids) => ids.forEach((id) => (roam[id] = false)),
      gone: (id) => peerCursors.set(cursorKey(id), null),
    };
  });
}
const wander = (S, ids, sel) => S.ev(([ids, sel]) => window.__T.wander(ids, sel), [ids, sel]);
const stopWander = (S, ids) => S.ev((ids) => window.__T.stop(ids), ids);
const opt = (i) => `[data-cursor="opt:${i}"]`;
const card = (i) => `[data-cursor="card:${i}"]`;
const answerRight = async (S, ms = 800) => { const i = await S.ev(() => window.__T.rightIdx()); await S.clickOn(opt(i), ms); };
const answerWrong = async (S, ms = 800, k = 0) => { const i = await S.ev((k) => window.__T.wrongIdx(k), k); await S.clickOn(opt(i), ms); };
const cardIdx = (S, re) => S.ev((re) => [...document.querySelectorAll('[data-cursor^="card:"]')].findIndex((e) => new RegExp(re, 'i').test(e.textContent)), re);
const gesture = async (S) => { await S.page.keyboard.press('Shift'); await S.page.mouse.click(3, 700); await S.wait(1500); };

const SEED_DELVE = async () => {
      const { storeKey } = await import('/src/lib/storage.ts');
      const { engine } = await import('/src/lib/session.svelte.ts');
      const { emptyCodex, record, serializeCodex } = await import('/src/lib/codex.ts');
      const { addRun, emptyRecords, serializeRecords, DELVE_RECORD_KEY } = await import('/src/lib/delveRecord.ts');
      const { DELVE_RULESET } = await import('/src/lib/delve.ts');
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const items = engine.items, pick = () => items[Math.floor(rnd() * items.length)].id;
      const ends = [8, 12, 15, 11, 19, 23, 17, 26, 31, 22, 34, 29, 38, 41, 27, 45, 52, 36, 58, 49, 63, 71, 55, 84, 92, 104];
      const day = 8.64e7, now = Date.now();
      let codex = emptyCodex(), recs = emptyRecords();
      ends.forEach((end, r) => {
        const id = now - (ends.length - r) * day * 1.3, together = r % 4 === 2;
        const losses = [Math.max(2, Math.round(end * (0.3 + rnd() * 0.25))), Math.max(3, Math.round(end * (0.6 + rnd() * 0.25))), end];
        let wards = 0, blasts = 0;
        for (let d = 1; d <= end; d++) {
          const at = id + d * 9000, lost = losses.includes(d);
          const find = d % 7 === 3 ? 'azurite' : d % 11 === 5 ? 'flare' : d % 13 === 8 ? 'dynamite' : undefined;
          const warded = !lost && !find && rnd() < 0.05; if (warded) wards++;
          const blasted = !find && rnd() < 0.04; if (blasted) blasts++;
          const ok = !lost && !warded;
          const delve = { depth: d, run: id, ...(find ? { find } : {}), ...(warded ? { warded: true } : {}), ...(blasted ? { blasted: true } : {}),
            ...(!find && rnd() < 0.06 ? { flared: true } : {}), ...(lost ? { lost: { lives: 1, wards: 0 } } : {}),
            ...(find && ok ? { gained: find === 'azurite' ? 'wards' : find === 'flare' ? 'flares' : 'dynamite' } : {}), ...(together ? { team: true } : {}) };
          const itemId = pick();
          codex = record(codex, { at, itemId, mode: rnd() < 0.7 ? 'name' : 'art', difficulty: 'merciless', race: false, delve, answer: { ok, pickedId: ok ? itemId : null, pickedLabel: null } });
        }
        const run = { id, at: id + end * 9000, depth: end, players: together ? 4 : 1, ruleset: DELVE_RULESET, mixed: false, losses: together ? losses.slice(0, 2) : losses, wards, blasts,
          ...(together ? { perished: [end], given: 1, revived: 1 } : {}) };
        recs = addRun(recs, run).records;
      });
      localStorage.setItem(storeKey('codex2'), serializeCodex(codex));
      localStorage.setItem(DELVE_RECORD_KEY, serializeRecords(recs));
    };

// The cards' art is drawn through a mask made at the icon's own (small) size, which a 4x capture
// stretches into blocks. Each mask is redrawn here at 4x, smoothly, its edge firmed back up, and swapped in.
export const HI_MASKS = () => {
  const done = new Map(), mine = new Set();
  const hi = (url) => new Promise((res) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const k = Math.min(4, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.filter = `blur(${(0.45 * k).toFixed(2)}px)`; g.drawImage(img, 0, 0, w, h); g.filter = 'none';
      const d = g.getImageData(0, 0, w, h);
      for (let i = 3; i < d.data.length; i += 4) {
        const t = Math.min(1, Math.max(0, (d.data[i] / 255 - 0.3) / 0.4));
        d.data[i - 3] = d.data[i - 2] = d.data[i - 1] = 255; d.data[i] = Math.round(t * t * (3 - 2 * t) * 255);
      }
      g.putImageData(d, 0, 0);
      c.toBlob((b) => { const u = b ? URL.createObjectURL(b) : null; if (u) mine.add(u); res(u); });
    };
    img.onerror = () => res(null);
    img.src = url;
  });
  setInterval(() => {
    for (const el of document.querySelectorAll('.glyph')) {
      const m = /url\(['"]?([^'")]+)['"]?\)/.exec(el.style.getPropertyValue('--src') || '');
      if (!m || mine.has(m[1])) continue;
      const url = m[1];
      if (!done.has(url)) { done.set(url, null); hi(url).then((b) => done.set(url, b)); }
      const b = done.get(url);
      if (b) el.style.setProperty('--src', `url('${b}')`);
    }
  }, 30);
};

/** The lab with NPC names; n players at depth d. */
async function lab(n = 1, depth = 1, extra) {
  const S = await openPage({ url: '/lab.html', K, dsf: DSF });
  await S.wait(3500);
  await gesture(S);
  await S.ev(([names, ids]) => { window.__lab.NAMES.splice(0, window.__lab.NAMES.length, ...names); window.__lab.IDS.splice(0, window.__lab.IDS.length, ...ids); }, [NPC, LAB_IDS]);
  await S.lab('newRun', n, depth);
  await S.wait(2000);
  await helpers(S);
  if (extra) await extra(S);
  return S;
}
/** A roomless host with 12 seated players, in any phase built by `build(s, engine)`. */
async function room12(mode, build) {
  const VW = +(process.env.VW || 1280), VH = Math.round(VW * 9 / 16);
  const S = await openPage({ url: '/lab.html', K, dsf: (process.env.DSF ? 5120 : 2880) / VW, w: VW, h: VH });
  await S.wait(3500);
  await gesture(S);
  await S.ev(async ([NPC, mode, build]) => {
    const { createGame, DEFAULT_SETTINGS } = await import('/src/lib/game.ts');
    const { engine, session } = await import('/src/lib/session.svelte.ts');
    const ids = NPC.map((_, i) => `p${String(i + 1).padStart(2, '0')}-npc`);
    let s = createGame(ids[0], { ...DEFAULT_SETTINGS, mode, timer: 32, targetScore: 10, difficulty: 'merciless' });
    for (let i = 0; i < 12; i++) s = engine.apply(s, { type: 'join', playerId: ids[i], name: NPC[i] }, null);
    if (build) s = new Function('s', 'engine', 'ids', build)(s, engine, ids) ?? s;
    session.startLocal(s); session.labCoop(ids[0]);
    session.scheduleAutoNext = () => {};
    window.__ids = ids;
  }, [NPC, mode, build ? build.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, '') : null]);
  await S.wait(2500);
  await helpers(S);
  return S;
}
const IDS12 = NPC.map((_, i) => `p${String(i + 1).padStart(2, '0')}-npc`);

const DAY = 20740;   // Headhunter is Today's unique
const SHOTS = {
  async home() {
    const S = await openPage({ K, dsf: DSF, startSlow: true, dateAt: DAY * 86400000 + 13 * 3600000,
      storage: { 'poe2trivia.local.daily': JSON.stringify({ day: DAY - 1, picked: 1, ok: true, streak: 4, ended: 0 }) } });
    S.mx = 1150; S.my = 760;
    await S.page.goto(BASE + '/');
    await S.slow(1); await S.wait(2500); await gesture(S); await S.page.mouse.move(1150, 760);
    await S.slow();
    const r = S.record('home3');
    await S.wait(4200);
    await S.move(1180, 575, 1300);
    await S.wait(600);
    await S.clickOn('button.option >> nth=3', 900);
    await S.wait(5500);
    await r.stop(); await S.close();
  },
  async home4() {
    const S = await openPage({ K, dsf: DSF, startSlow: true, dateAt: DAY * 86400000 + 13 * 3600000,
      storage: { 'poe2trivia.local.daily': JSON.stringify({ day: DAY - 1, picked: 1, ok: true, streak: 4, ended: 0 }) } });
    S.mx = 1150; S.my = 760;
    await S.page.goto(BASE + '/');
    await S.slow(1); await S.wait(2500); await gesture(S); await S.page.mouse.move(1150, 760);
    await S.ev(() => { const st = document.createElement('style'); st.textContent = '.option .name { overflow: visible !important; }'; document.head.append(st); });
    await S.slow();
    const r = S.record('home4');
    await S.wait(2500);
    // drawn to Mageblood first...
    const mb = await S.page.locator('button.option').nth(1).boundingBox();
    await S.move(mb.x + mb.width * 0.55, mb.y + mb.height * 0.6, 1300);
    await S.wait(500);
    await S.move(mb.x + mb.width * 0.45, mb.y + mb.height * 0.5, 350);
    await S.wait(450);
    await S.move(mb.x + mb.width * 0.5, mb.y + mb.height * 0.55, 250);
    await S.wait(350);
    // ...then thinks better of it
    const hh = await S.page.locator('button.option').nth(3).boundingBox();
    await S.move(hh.x + hh.width * 0.45, hh.y + hh.height * 0.5, 900);
    await S.wait(250);
    await S.click();
    await S.wait(5000);
    await r.stop(); await S.close();
  },
  async race4() {
    const S = await room12('race', function (s, engine, ids) {
      s = engine.apply(s, { type: 'start' }, null);
      s.players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      s.players.forEach((p, i) => { p.score = [6, 7, 5, 5, 4, 4, 3, 2, 2, 1, 1, 0][i]; p.streak = i === 1 ? 4 : 0; });
      s.question.deadline = Date.now() + 60000; s.version++;
      return s;
    });
    S.mx = 900; S.my = 700;
    await S.slow();
    const r = S.record('race4');
    const wrong = (pid, k) => S.ev(([pid, k]) => { const s = window.__s, q = s.state.question; const w = q.options.map((_, i) => i).filter((i) => q.options[i] !== q.itemId); try { s.labAct({ type: 'answer', index: w[k % w.length], askedAt: q.askedAt }, pid); } catch (e) {} }, [pid, k]);
    await S.wait(2200);
    await wrong(IDS12[1], 0);          // Gwennen, alone first: a clear miss
    await S.wait(1600);
    await wrong(IDS12[4], 2); await S.wait(500);
    await wrong(IDS12[5], 1); await S.wait(500);
    await wrong(IDS12[7], 3); await S.wait(400);
    await answerRight(S, 700);
    await S.wait(4000);
    await r.stop(); await S.close();
  },
  async streaks4() {
    const DEP = { 2: 8, 19: 24, 29: 33, 39: 44, 59: 63, 79: 84, 99: 104 };
    const list = (process.env.SN || '2,19,29,39,59,79,99').split(',').map(Number);
    const S = await lab(1, DEP[list[0]]);
    for (const n of list) {
      await S.slow(1);
      await S.lab('setDepth', DEP[n]); await S.wait(2500);
      await S.ev((n) => window.__lab.setStreak('lab-1', n), n); await S.wait(600);
      await S.lab('ask'); await S.wait(2600);
      S.mx = 900; S.my = 760; await S.page.mouse.move(S.mx, S.my);
      await S.slow();
      const r = S.record(`streak4_${n + 1}`);
      await S.wait(300);
      await answerRight(S, 700);
      await S.wait(3400);
      await r.stop();
    }
    await S.close();
  },
  async auspex() {
    const S = await lab(1, 35);
    await S.ev(async () => {
      const { engine } = await import('/src/lib/session.svelte.ts');
      const orig = engine.makeQuestion.bind(engine);
      engine.makeQuestion = (s, cat, o) => {
        for (let i = 0; i < 2000; i++) {
          const n = structuredClone(s); n.used = n.used.filter((id) => id !== '32407fc0f1e9');
          const q = orig(n, 'Body Armours', o);
          if (q.itemId === '32407fc0f1e9' && q.mode === 'name') { s.used = n.used; return q; }
        }
        return orig(s, cat, o);
      };
      const o = window.__lab.opts; o.mode = 'name'; o.veil = 'on'; o.mirrored = 'off'; window.__lab.setGrayscale('off');
    });
    await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); });
    S.mx = 1150; S.my = 700; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    const r = S.record(process.env.AUS_NAME || 'art_auspex');
    await S.lab('ask');
    await S.wait(4300);
    if (process.env.AUS_NAME) { await answerRight(S, 700); await S.wait(2600); } else await S.wait(1200);
    await r.stop(); await S.close();
  },
  async fuse() {
    const S = await lab(1, 34, async (S) => { await S.ev(() => window.__lab.setItem('lab-1', 'dynamite', 2)); await S.wait(300); await S.lab('ask'); await S.wait(2500); await S.lab('setTimeLeft', 1500); });
    S.mx = 1400; S.my = 900;
    await S.slow();
    const r = S.record('fuse');
    await S.wait(4500);
    await r.stop(); await S.close();
  },
  async detpress() {
    const S = await lab(1, 34, async (S) => { await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); window.__lab.setItem('lab-1', 'dynamite', 2); }); await S.wait(300); await S.lab('ask'); await S.wait(2500); });
    S.mx = 1100; S.my = 640;
    await S.slow();
    const r = S.record('detpress');
    await S.moveTo('button:has-text("Detonate")', 1400); await S.wait(500);
    await S.page.mouse.down(); await S.wait(160); await S.page.mouse.up();
    S.ev(() => window.__lab.dynamite());
    await S.wait(2500);
    await r.stop(); await S.close();
  },
  async detreach() {
    const S = await lab(1, 34, async (S) => { await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); window.__lab.setItem('lab-1', 'dynamite', 2); const o = window.__lab.opts; o.mode = 'name'; o.veil = 'off'; o.mirrored = 'off'; }); await S.wait(300); });
    S.mx = 330; S.my = 420; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    await S.lab('ask'); await S.wait(1600);   // asked in slowed time, so its expiry timer is too
    const r = S.record('detreach');
    await S.wait(600);
    const o1 = await S.page.locator('[data-cursor="opt:0"]').boundingBox(), o4 = await S.page.locator('[data-cursor="opt:5"]').boundingBox();
    await S.move(o1.x + o1.width * 0.6, o1.y + o1.height * 0.5, 1100, 0.08);
    await S.wait(250);
    await S.move(o4.x + o4.width * 0.5, o4.y + o4.height * 0.6, 900, -0.1);
    await S.wait(200);
    const bb = await S.page.locator('button:visible:has-text("Detonate")').last().boundingBox();
    await S.move(bb.x + bb.width * 0.3, bb.y - 30, 700, -0.1);
    await S.wait(350);
    await S.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.55, 450);
    await S.wait(250);
    await S.page.mouse.down(); await S.wait(160); await S.page.mouse.up();
    S.ev(() => window.__lab.dynamite());
    await S.wait(2600);
    await r.stop(); await S.close();
  },
  // One question, start to blast: the clock runs out, a flare burns (6 s more), the cursor weighs the
  // options, the fuse lights for the last 1.8 s, Detonate pressed just before 0 (in deeper slow motion).
  async flaredet() {
    const S = await lab(1, 34, async (S) => { await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); window.__lab.setItem('lab-1', 'flares', 1); window.__lab.setItem('lab-1', 'dynamite', 2); const o = window.__lab.opts; o.mode = 'name'; o.veil = 'off'; o.mirrored = 'off'; }); await S.wait(300); });
    S.mx = 1250; S.my = 640; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    await S.lab('ask'); await S.wait(1600);
    await S.lab('setTimeLeft', 3400);
    await S.ev(() => { window.__left = () => { const q = window.__s.state.question; return q && q.deadline ? q.deadline - Date.now() : -1; }; window.__flared = () => !!window.__s.state.question?.flared; });
    const until = async (f, arg) => { while (!(await S.ev(f, arg))) await new Promise((r) => setTimeout(r, 25)); };
    const r = S.record(process.env.FD_NAME || 'flaredet');
    const box = async (i) => S.page.locator(`[data-cursor="opt:${i}"]`).boundingBox();
    const at = async (i, fx, fy, ms, c) => { const b = await box(i); await S.move(b.x + b.width * fx, b.y + b.height * fy, ms, c); };
    await S.wait(300);
    await at(1, 0.55, 0.5, 900, 0.1); await S.wait(300);
    await at(4, 0.45, 0.55, 800, -0.12);
    await until(() => window.__flared());           // the clock hits 0: the flare burns
    await S.wait(250);
    await at(3, 0.6, 0.45, 420, 0.1); await S.wait(160);
    await at(0, 0.4, 0.55, 380, -0.1); await S.wait(120);
    await at(5, 0.5, 0.5, 400, 0.08); await S.wait(140);
    await at(2, 0.55, 0.5, 360, -0.1); await S.wait(130);
    await at(7, 0.45, 0.5, 420, 0.1); await S.wait(160);
    await at(4, 0.5, 0.55, 380, -0.08); await S.wait(120);
    const bb = await S.page.locator('button:visible:has-text("Detonate")').last().boundingBox();
    await until(() => window.__left() < 1900);       // the fuse lights
    await S.move(bb.x + bb.width * 0.3, bb.y - 40, 800, -0.1);
    await S.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.55, 450);
    await until(() => window.__left() < 420);
    await S.slow(96);
    await S.page.mouse.down(); await S.wait(160); await S.page.mouse.up();
    S.ev(() => window.__lab.dynamite());
    await S.wait(2600);
    await r.stop(); await S.close();
  },
  async lobby12() {
    const S = await room12('delve');
    S.mx = 640; S.my = 760; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    const r = S.record('lobby12');
    wander(S, IDS12.slice(1), '[data-cursor^="row:"], [data-cursor="modes"], [data-cursor="descent"], [data-cursor="begin"], [data-cursor="party"]');
    await S.wait(3800);
    await S.clickOn('[data-cursor="begin"]', 1100);
    await stopWander(S, IDS12.slice(1));
    await S.wait(7500);
    await r.stop(); await S.close();
  },
  async coop12() {
    const S = await lab(12, 41);
    S.mx = 640; S.my = 760;
    await S.slow();
    const r = S.record('coop12');
    await S.lab('dealCards');
    await S.wait(1200);
    wander(S, LAB_IDS.slice(1), '[data-cursor^="card:"]');
    await S.wait(2600);
    for (const [k, id] of LAB_IDS.slice(1, 8).entries()) { await S.ev((id) => window.__lab.setActor(id), id); await S.lab('voteFor', [1, 2, 1, 0, 1, 2, 1][k]); await S.wait(220); }
    await S.clickOn(card(1), 700, 0.45, 0.6);
    await S.wait(3000);
    await stopWander(S, LAB_IDS.slice(1));
    wander(S, LAB_IDS.slice(1), '[data-cursor^="opt:"]');
    await S.wait(2500);
    await answerRight(S, 800);
    await S.wait(3000);
    await r.stop(); await S.close();
  },
  async race12() {
    const S = await room12('race', function (s, engine, ids) {
      s = engine.apply(s, { type: 'start' }, null);
      s.players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      s.players.forEach((p, i) => { p.score = [6, 7, 5, 5, 4, 4, 3, 2, 2, 1, 1, 0][i]; p.streak = i === 1 ? 4 : 0; });
      s.question.deadline = Date.now() + 60000; s.version++;
      return s;
    });
    S.mx = 900; S.my = 700;
    await S.slow();
    const r = S.record('race12');
    await S.wait(2600);
    const others = IDS12.slice(1);
    const order = [3, 7, 1, 10, 5, 8, 2];
    for (const k of order) {
      await S.ev((pid) => { const s = window.__s, q = s.state.question; const wrong = q.options.map((_, i) => i).filter((i) => q.options[i] !== q.itemId); const i = wrong[Math.floor(Math.random() * wrong.length)]; try { s.labAct({ type: 'answer', index: i, askedAt: q.askedAt }, pid); } catch (e) {} }, others[k - 1]);
      await S.wait(380);
    }
    await answerRight(S, 700);
    await S.wait(4500);
    await r.stop(); await S.close();
  },
  async over12() {
    const S = await room12('race', function (s, engine, ids) {
      s = engine.apply(s, { type: 'start' }, null);
      s.players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      s.players.forEach((p, i) => { p.score = [10, 9, 8, 8, 7, 6, 5, 5, 4, 3, 2, 1][i]; });
      s.phase = 'over'; s.winners = [ids[0]]; s.question = null; s.reveal = null; s.version++;
      return s;
    });
    S.mx = 640; S.my = 760;
    await S.slow();
    const r = S.record('over12');
    wander(S, IDS12.slice(1), '[data-cursor^="row:"], [data-cursor="game"]');
    await S.wait(7000);
    await r.stop(); await S.close();
  },
  async ward() {
    const S = await lab(1, 33, async (S) => { await S.ev(() => window.__lab.setItem('lab-1', 'wards', 2)); await S.wait(500); await S.lab('ask'); await S.wait(2500); });
    S.mx = 900; S.my = 760;
    await S.slow();
    const r = S.record('ward3');
    await S.wait(400);
    await answerWrong(S, 900);
    await S.wait(4000);
    await r.stop(); await S.close();
  },
  async revive() {
    const S = await lab(4, 37, async (S) => { await S.lab('dealCards'); await S.wait(2500); await S.ev(() => window.__lab.setLives('lab-2', 0)); await S.wait(1500); });
    S.mx = 900; S.my = 760;
    await S.slow();
    const r = S.record('revive3');
    wander(S, ['lab-3', 'lab-4'], '[data-cursor^="card:"]');
    await S.wait(800);
    await S.clickOn('li.revivable .revive', 1000);
    await S.wait(900);
    const btn = S.page.getByRole('button', { name: /give a life/i }).first();
    const bb = await btn.boundingBox();
    if (bb) { await S.move(bb.x + bb.width / 2, bb.y + bb.height / 2, 700); await S.wait(150); await S.click(); }
    else console.log('no give-a-life button');
    await S.wait(4500);
    await r.stop(); await S.close();
  },
  async streaks() {
    const S = await lab(1, 44);
    for (const n of [2, 19, 29, 39, 59, 79, 99]) {
      await S.slow(1);
      await S.ev((n) => window.__lab.setStreak('lab-1', n), n); await S.wait(600);
      await S.lab('ask'); await S.wait(2600);
      S.mx = 900; S.my = 760; await S.page.mouse.move(S.mx, S.my);
      await S.slow();
      const r = S.record(`streak_${n + 1}`);
      await S.wait(300);
      await answerRight(S, 700);
      await S.wait(2600);
      await r.stop();
    }
    await S.close();
  },
  // The codex's Delve page over a history of runs, written through the app's own record functions.
  async codexdelve() {
    const S = await openPage({ K, dsf: DSF, url: '/' });
    await S.wait(3000);
    await S.ev(SEED_DELVE);
    await S.page.goto(BASE + '/#codex'); await S.wait(3500); await gesture(S);
    await S.page.locator('[role="tab"]:has-text("Delve"), button:has-text("Delve")').first().click(); await S.wait(2500);
    await S.page.screenshot({ path: '../codexdelve_probe.png', scale: 'css', fullPage: true });
    const scrollTo = (y, ms) => S.ev(([y, ms]) => new Promise((done) => { const y0 = scrollY, t0 = performance.now();
      const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        scrollTo(0, y0 + (y - y0) * e); if (u < 1) setTimeout(step, 16); else done(); }; step(); }), [y, ms]);
    S.mx = 1215; S.my = 330; await S.page.mouse.move(S.mx, S.my);
    await S.page.evaluate(() => scrollTo(0, 0));
    await S.slow();
    const r = S.record('codexdelve');
    await S.wait(1200);
    await scrollTo(900, 2600);
    await S.wait(600);
    await r.stop(); await S.close();
  },
  // The codex as a sequence: the Delve tab clicked, its page in, then what kills you, then finds and zones.
  async codexseq() {
    const S = await openPage({ K, dsf: DSF, url: '/' });
    await S.wait(3000);
    await S.ev(SEED_DELVE);
    await S.page.goto(BASE + '/#codex'); await S.wait(3500); await gesture(S);
    const scrollTo = (y, ms) => S.ev(([y, ms]) => new Promise((done) => { const y0 = scrollY, t0 = performance.now();
      const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        scrollTo(0, y0 + (y - y0) * e); if (u < 1) setTimeout(step, 16); else done(); }; step(); }), [y, ms]);
    await S.page.evaluate(() => scrollTo(0, 0));
    S.mx = 900; S.my = 330; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    const r = S.record('codexseq');
    await S.wait(500);
    const tab = S.page.locator('[role="tab"]:has-text("Delve"), button:has-text("Delve")').first();
    const tb = await tab.boundingBox();
    await S.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.6, 700, 0.12); await S.wait(120);
    await S.click(); r.mark('tab');
    await S.wait(300);
    await S.move(1215, 330, 900, -0.1);
    await S.wait(1500);
    const y1 = await S.ev(() => { const h = [...document.querySelectorAll('h2, h3, .title, header')].find((e) => /what kills you/i.test(e.textContent)); return h ? h.getBoundingClientRect().top + scrollY - 90 : 560; });
    r.mark('kills'); await scrollTo(y1, 1300);
    await S.wait(2200);
    const y2 = await S.ev(() => { const h = [...document.querySelectorAll('h2, h3, .title, header')].find((e) => /zones reached/i.test(e.textContent)); return h ? h.getBoundingClientRect().top + scrollY - 90 : 1250; });
    r.mark('zones'); await scrollTo(y2, 1300);
    await S.wait(2000);
    await r.stop(); await S.close();
  },
  // The codex, everything it keeps: the collection (its ring, then the grid of items), the Delve page
  // (the deepest, what kills you, the zones reached), the achievements. Holds only, jumps between them.
  async codextour() {
    const S = await openPage({ K, dsf: DSF, url: '/' });
    await S.wait(3000);
    await S.ev(SEED_DELVE);
    await S.ev(async () => {
      const { storeKey } = await import('/src/lib/storage.ts');
      const now = Date.now();
      const earn = ['prima-materia', 'first-victory', 'depth-10', 'roped-together', 'streak-25', 'saving-grace', 'hubris', 'deathmatch', 'chain-reaction', 'twofold', 'depth-50', 'selfless', 'mercurial', 'by-a-thread', 'great-work', 'streak-100', 'untouched', 'quicksilver', 'deep-company'];
      localStorage.setItem(storeKey('achievements'), JSON.stringify({ v: 1, earned: Object.fromEntries(earn.map((id, k) => [id, now - k * 8.64e7])) }));
    });
    await S.page.goto(BASE + '/'); await S.wait(2500); await gesture(S);
    S.mx = 1215; S.my = 300; await S.page.mouse.move(S.mx, S.my);
    const jump = (y) => S.ev((y) => scrollTo(0, y), y);
    const topOf = (re, sel = 'h2, h3, header, .title, p') => S.ev(([re, sel]) => { const h = [...document.querySelectorAll(sel)].find((e) => new RegExp(re, 'i').test(e.textContent.trim())); return h ? h.getBoundingClientRect().top + scrollY : null; }, [re, sel]);
    const tab = (re) => S.page.locator(`[role="tab"]:has-text("${re}"), button:has-text("${re}")`).first();
    await S.slow();
    const r = S.record('codextour');
    await S.ev(() => { location.hash = '#codex'; });
    r.mark('collection'); await S.wait(2200);
    const g = await S.ev(() => { const e = document.querySelector('ul.grid'); return e ? e.getBoundingClientRect().top + scrollY - 40 : 900; });
    await jump(g); r.mark('grid'); await S.wait(1800);
    await jump(0); await S.wait(200);
    const tb = await tab('Delve').boundingBox();
    await S.move(tb.x + tb.width * 0.5, tb.y + tb.height * 0.6, 500, 0.1); await S.wait(100);
    await S.click(); r.mark('delve');
    await S.move(1215, 300, 600, -0.1); await S.wait(1600);
    const k = await topOf('^what kills you', 'h2, h3, header, .title, span, div'); await jump((k ?? 560) - 70); r.mark('kills'); await S.wait(1600);
    const z = await topOf('^zones reached', 'h2, h3, header, .title, span, div'); await jump((z ?? 1250) - 70); r.mark('zones'); await S.wait(1600);
    await jump(0); await S.wait(200);
    const ab = await tab('Achievements').boundingBox();
    await S.move(ab.x + ab.width * 0.5, ab.y + ab.height * 0.6, 500, 0.1); await S.wait(100);
    await S.click(); r.mark('ach');
    await S.move(1215, 300, 600, -0.1); await S.wait(2400);
    await r.stop(); await S.close();
  },
  // The trailer's own title card (trailer/capture/title): PoE2.Quest presents, the circle, Delve.
  async presents() {
    const S = await openPage({ url: '/trailer/capture/title/title.html', K, dsf: DSF });
    await S.wait(3000);
    S.mx = -60; S.my = -60; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    const r = S.record('presents');
    await S.wait(400);
    r.mark('p1'); await S.ev(() => window.__phase(1)); await S.wait(1000);
    r.mark('p2'); await S.ev(() => window.__phase(2)); await S.wait(600);
    r.mark('p3'); await S.ev(() => window.__phase(3)); await S.wait(3800);
    await r.stop(); await S.close();
  },
  // The last life: deep, nothing in the pack, the clock running down as the darkness closes in, a wrong
  // answer, the end screen; then the achievements it earned.
  async lastlife() {
    const S = await lab(1, 57, async (S) => { await S.ev(() => { const st = document.createElement('style'); st.id = 'notoast'; st.textContent = '.toasts { display: none !important; }'; document.head.append(st); for (const k of ['flares', 'dynamite', 'wards']) window.__lab.setItem('lab-1', k, 0); window.__lab.setLives('lab-1', 1); const o = window.__lab.opts; o.mode = 'name'; o.veil = 'off'; o.mirrored = 'off'; }); await S.wait(400); });
    S.mx = 1250; S.my = 640; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    await S.lab('ask'); await S.wait(1600);
    await S.lab('setTimeLeft', 4200);
    await S.ev(() => { window.__left = () => { const q = window.__s.state.question; return q && q.deadline ? q.deadline - Date.now() : -1; }; });
    const until = async (f) => { while (!(await S.ev(f))) await new Promise((r) => setTimeout(r, 25)); };
    const r = S.record('lastlife');
    const at = async (i, fx, fy, ms, c) => { const b = await S.page.locator(`[data-cursor="opt:${i}"]`).boundingBox(); await S.move(b.x + b.width * fx, b.y + b.height * fy, ms, c); };
    await S.wait(300);
    await at(2, 0.5, 0.5, 700, 0.1); await S.wait(350);
    await at(5, 0.45, 0.55, 600, -0.1); await S.wait(250);
    await at(1, 0.55, 0.5, 550, 0.08); await S.wait(200);
    await until(() => window.__left() < 1150);
    r.mark('wrong'); await answerWrong(S, 260);
    await S.wait(1300);
    const res = await S.page.locator('button:visible:has-text("Results")').last().boundingBox();
    await S.move(res.x + res.width * 0.5, res.y + res.height * 0.55, 420, 0.08); await S.wait(80);
    r.mark('results'); await S.click();
    await until(() => !!document.querySelector('.over'));
    r.mark('over');
    await S.wait(1000);
    await S.ev(async () => {
      const { toasts } = await import('/src/lib/toasts.svelte.ts'); const { ACHIEVEMENTS } = await import('/src/lib/achievements.ts');
      for (const t of [...toasts.list]) toasts.dismiss(t.id);
      await new Promise((r) => setTimeout(r, 400));
      document.getElementById('notoast')?.remove();
      const show = (id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); if (a) toasts.show(a.title, 'info', { title: 'Achievement earned', seal: { sign: a.sign, tier: a.tier } }); };
      show('depth-50'); setTimeout(() => show('by-a-thread'), 420); setTimeout(() => show('streak-25'), 840);
    });
    r.mark('toasts');
    await S.wait(3200);
    await r.stop(); await S.close();
  },
  // The game's own transition sounds, each played once through its sound engine and recorded.
  async sfxbank() {
    const S = await openPage({ url: '/lab.html', K: 1, dsf: 1 });
    await S.wait(3500); await gesture(S);
    const names = ['plunge', 'zoneLock', 'zoneSting', 'zoneDrift', 'zoneShatter', 'zoneVoid', 'zoneBurn', 'turn', 'reveal', 'select', 'lifeLost', 'defeat', 'flare', 'blast'];
    await S.ev(() => import('/src/lib/sound.ts').then((m) => m.sfx('click')));
    await S.wait(1500);
    const r = S.record('sfxbank');
    for (const n of names) { r.mark(n); await S.ev((n) => import('/src/lib/sound.ts').then((m) => { m.sfx(n); }), n); await S.wait(3500); }
    await r.stop(); await S.close();
  },
  // The cold open: the last life, deep in the endless zones, an empty pack; nobody answers. The clock
  // counts down (marks at 3, 2, 1, 0) and the darkness takes you.
  async coldopen() {
    const S = await lab(1, 120, async (S) => { await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); for (const k of ['flares', 'dynamite', 'wards']) window.__lab.setItem('lab-1', k, 0); window.__lab.setLives('lab-1', 1); const o = window.__lab.opts; o.mode = 'name'; o.veil = 'off'; o.mirrored = 'off'; }); await S.wait(400); });
    S.mx = -80; S.my = -80; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    await S.lab('ask'); await S.wait(1600);
    await S.lab('setTimeLeft', 4600);
    await S.ev(() => { window.__left = () => { const q = window.__s.state.question; return q && q.deadline ? q.deadline - Date.now() : -1; }; });
    const r = S.record('coldopen');
    for (const n of [4, 3, 2, 1, 0]) {
      while ((await S.ev(() => window.__left())) > n * 1000) await new Promise((res) => setTimeout(res, 20));
      r.mark('at' + n);
    }
    await S.wait(3500);
    await r.stop(); await S.close();
  },
  async codex() {
    const S = await openPage({ K, dsf: DSF, url: '/' });
    await S.wait(3000);
    await S.ev(async () => {
      const { storeKey } = await import('/src/lib/storage.ts');
      const { engine } = await import('/src/lib/session.svelte.ts');
      const now = Date.now(), items = {}, log = [];
      engine.items.forEach((it, i) => { if (i % 5 === 4) return;
        const n = 1 + (i % 4), ok = Math.max(0, n - (i % 3 === 0 ? 1 : 0)), t = now - (i + 1) * 3.6e6;
        items[it.id] = { seen: n + 1, first: t - 8.64e7, last: t, name: { n, ok }, art: { n: 0, ok: 0 }, mixed: {} };
        log.push({ t, id: it.id, mode: 'name', ok: ok === n, difficulty: 'merciless', race: false, ms: 2500 + (i % 7) * 400 }); });
      localStorage.setItem(storeKey('codex2'), JSON.stringify({ v: 1, items, log: log.sort((a, b) => a.t - b.t).slice(-2000),
        byDifficulty: { merciless: { n: 900, ok: 760 } }, fooled: {}, streak: 12, best: 41, fastest: { ms: 1430, id: engine.items[0].id }, byDepth: {} }));
      const earn = ['prima-materia', 'first-victory', 'depth-10', 'roped-together', 'streak-25', 'saving-grace', 'hubris', 'deathmatch', 'chain-reaction', 'twofold', 'depth-50', 'selfless', 'mercurial', 'by-a-thread', 'great-work', 'streak-100', 'untouched', 'quicksilver', 'deep-company'];
      localStorage.setItem(storeKey('achievements'), JSON.stringify({ v: 1, earned: Object.fromEntries(earn.map((id, k) => [id, now - k * 8.64e7])) }));
    });
    await S.page.goto(BASE + '/#codex'); await S.wait(3500); await gesture(S);
    const scrollTo = (y, ms) => S.ev(([y, ms]) => new Promise((done) => { const y0 = scrollY, t0 = performance.now();
      const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        scrollTo(0, y0 + (y - y0) * e); if (u < 1) setTimeout(step, 16); else done(); }; step(); }), [y, ms]);
    S.mx = 640; S.my = 600; await S.page.mouse.move(S.mx, S.my);
    await S.slow();
    const r = S.record('codex3');
    await S.wait(1600);
    await scrollTo(1250, 1800);
    await S.wait(300);
    await S.move(380, 420, 900); await S.wait(300);
    await S.move(760, 470, 900); await S.wait(300);
    const t = S.page.locator('button.tile').nth(3); const bb = await t.boundingBox();
    await S.move(bb.x + bb.width / 2, bb.y + bb.height / 2, 700); await S.wait(200); await S.click();
    await S.wait(3400);
    await S.page.keyboard.press('Escape'); await S.wait(700);
    await scrollTo(0, 1400);
    await S.clickOn('#codex-tab-feats', 800); await S.wait(2600);
    await scrollTo(380, 1500); await S.wait(300);
    await S.move(640, 520, 1000); await S.wait(1600);
    await r.stop(); await S.close();
  },
  async toasts() {
    const S = await lab(1, 58);
    S.mx = 1400; S.my = 900;
    await S.slow();
    const r = S.record('toasts3');
    S.ev(() => window.__lab.endSolo(true));
    await S.wait(2200);
    await S.ev(async () => {
      const { toasts } = await import('/src/lib/toasts.svelte.ts'); const { ACHIEVEMENTS } = await import('/src/lib/achievements.ts');
      const show = (id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); toasts.show(a.title, 'info', { title: 'Achievement earned', seal: { sign: a.sign, tier: a.tier } }); };
      show('depth-50'); setTimeout(() => show('untouched'), 700); setTimeout(() => show('streak-25'), 1400);
    });
    await S.wait(4500);
    await r.stop(); await S.close();
  },
  async vein() {
    const S = await lab(1, 27, async (S) => { await S.ev(() => { window.__lab.opts.cardFind = 'azurite'; }); });
    // The card's hover tilts toward the cursor in 3D (perspective); Chrome rasters a layer in such a transition
    // coarsely, and at a 4x capture it shows in blocks. Lifted in 2D here: the same rise and scale.
    await S.ev(() => { const st = document.createElement('style'); st.textContent = '.card.mine:not(.down):hover .frame, .card.mine:not(.down):focus-visible .frame { transform: translateY(-10px) scale(1.04) !important; }'; document.head.append(st); });
    await S.ev(() => { const st = document.createElement('style'); st.textContent = '.toasts { display: none !important; }'; document.head.append(st); });
    S.mx = 640; S.my = 760;
    await S.slow();
    const r = S.record('vein3');
    await S.lab('dealCards'); await S.wait(2200);
    const i = await cardIdx(S, 'Azurite');
    await S.clickOn(card(i), 1000); await S.wait(3200);
    await answerRight(S, 800); await S.wait(3500);
    await S.clickOn('[data-cursor="next"]', 800); await S.wait(3500);
    const dd = await cardIdx(S, 'Deeper'); if (dd >= 0) { await S.moveTo(card(dd), 800); await S.wait(900); }
    const out = await cardIdx(S, 'Light'); if (out >= 0) await S.clickOn(card(out), 900);
    await S.wait(5500);
    await r.stop(); await S.close();
  },
  async cavein() {
    const S = await lab(1, 27, async (S) => { await S.ev(() => window.__lab.setItem('lab-1', 'wards', 0)); await S.lab('dealDig', 2, 4.6); await S.wait(2500); });
    S.mx = 640; S.my = 760;
    await S.slow();
    const r = S.record('cavein3');
    const dd = await cardIdx(S, 'Deeper');
    await S.clickOn(card(Math.max(0, dd)), 1000); await S.wait(2800);
    await answerWrong(S, 700); await S.wait(5000);
    await r.stop(); await S.close();
  },
  async flare() {
    const S = await lab(1, 52, async (S) => { await S.ev(() => window.__lab.setItem('lab-1', 'flares', 2)); await S.wait(300); await S.lab('ask'); await S.wait(2500); await S.lab('setTimeLeft', 2200); });
    S.mx = 1400; S.my = 900;
    await S.slow();
    const r = S.record('flare3');
    await S.wait(6000);
    await r.stop(); await S.close();
  },
  async dynamite() {
    const S = await lab(1, 34, async (S) => { await S.ev(() => window.__lab.setItem('lab-1', 'dynamite', 2)); await S.wait(300); await S.lab('ask'); await S.wait(2500); });
    S.mx = 900; S.my = 760;
    await S.slow();
    const r = S.record('dynamite3');
    await S.wait(300);
    await S.moveTo('button:has-text("Detonate")', 1000); await S.wait(150);
    await S.page.mouse.down(); await S.wait(110); await S.page.mouse.up();
    S.ev(() => window.__lab.dynamite());
    await S.wait(4500);
    await r.stop(); await S.close();
  },
  async tooltip() {
    const S = await lab(1, 6, async (S) => {
      await S.ev(async () => {
        const { engine } = await import('/src/lib/session.svelte.ts');
        const want = engine.items.find((it) => it.name === 'The Sunken Vessel')?.id;
        const orig = engine.makeQuestion.bind(engine);
        engine.makeQuestion = (s, cat, o) => {
          for (let i = 0; want && i < 3000; i++) {
            const n = structuredClone(s); n.used = n.used.filter((id) => id !== want);
            const q = orig(n, 'Body Armours', o);
            if (q.itemId === want && q.mode === 'name') { s.used = n.used; return q; }
          }
          return orig(s, cat, o);
        };
        const o = window.__lab.opts; o.mode = 'name'; o.veil = 'off'; o.mirrored = 'off';
      });
      await S.lab('ask'); await S.wait(2500); await answerRight(S, 300); await S.wait(2500);
    });
    S.mx = 900; S.my = 700;
    await S.slow();
    const r = S.record('tooltip3');
    await S.clickOn('button.details', 900); await S.wait(4500);
    await r.stop(); await S.close();
  },
  async end() {
    const S = await lab(1, 58);
    S.mx = 1400; S.my = 900;
    await S.slow();
    const r = S.record('end3');
    S.ev(() => window.__lab.endSolo(true));
    await S.wait(6500);
    await r.stop(); await S.close();
  },
  async zones() {
    const S = await openPage({ url: '/lab.html', K: process.env.DSF ? K : 8, dsf: +(process.env.DSF || 1.5) });
    await S.wait(3500); await gesture(S);
    await S.ev(() => document.documentElement.classList.add('clean'));
    for (const z of (process.env.ZL ? process.env.ZL.split(',').map(Number) : [11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 111, 121, 131, 141])) {
      await S.lab('setDepth', z - 1); await S.wait(3000);
      await S.slow(process.env.DSF ? K : 8); const r = S.record(`szone_${z}`); await S.wait(300); S.lab('nextZone'); await S.wait(process.env.DSF ? 5200 : 8000); await r.stop(); await S.slow(1); await S.wait(2500);
    }
    await S.close();
  },
  async title() {
    const S = await openPage({ url: '/zones.html?stage', K: process.env.DSF ? 20 : 10, dsf: +(process.env.DSF || 2.25) });
    await S.page.waitForFunction(() => window.__zb?.ready, null, { timeout: 30000 });
    await S.wait(3000); await gesture(S);
    await S.ev(() => document.documentElement.classList.add('clean', 'titlecard'));
    await S.lab('setDepth', 90); await S.wait(3000);
    await S.slow();
    const r = S.record('stitle');
    await S.wait(300);
    S.ev(() => window.__zb.card({ depth: 91, name: 'Delve', hold: true }));
    for (let i = 0; i < 40; i++) { await S.wait(50); const ok = await S.ev(() => { const m = document.querySelector('.zc .meta-text'); if (m) { m.textContent = 'PoE2.Quest'; return true; } return false; }); if (ok) break; }
    await S.wait(7000);
    await r.stop(); await S.close();
  },
};

const list = process.argv.slice(2);
for (const name of list) {
  const t = Date.now();
  try { await SHOTS[name](); } catch (e) { console.log(`!! ${name}:`, e.message.split('\n')[0]); }
  console.log(`-- ${name} took ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
await done();
