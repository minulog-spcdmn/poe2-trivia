// How the PeerJS server says nobody holds an id, which the room list's pings
// lean on (lib/rooms.ts REPING_MS; signal/worker.js does the same): a message
// for an id nobody holds waits for it, and once the first to wait has waited
// its time, everyone who sent one is told EXPIRE, each once. So a free slot's
// word reaches every start page that asked, however many ask at once; none
// is left to take silence for a room. Checked against the PeerJS server
// installed (the one the free cloud is taken to run), run here on this
// machine with its waits cut short, in a process of its own: it has no way
// to stop its timers, and would keep the test's from ending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const EXPIRE_MS = 1500;
const LOOK_MS = 100;

/** A peer's socket on the server at `port`, once it's told OPEN, with every message it's handed and when. */
async function peer(port: number, id: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/peerjs?key=peerjs&id=${id}&token=t-${id}&version=1.5.5`);
  const heard: { type: string; src?: string; at: number }[] = [];
  await new Promise<void>((open, fail) => {
    ws.addEventListener('error', () => fail(new Error(`${id} couldn't connect`)));
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data)) as { type: string; src?: string };
      if (m.type === 'OPEN') open();
      else heard.push({ ...m, at: Date.now() });
    });
  });
  const ask = (dst: string) => ws.send(JSON.stringify({ type: 'CANDIDATE', dst, payload: { type: 'data', connectionId: `dc_${id}`, candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, probe: 'x' } }));
  return { ws, heard, ask };
}
type Asker = Awaited<ReturnType<typeof peer>>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits for `ok()` to hold, `ms` at most: whether it came to. (Looked for, not waited out: a busy machine stretches a wait.) */
async function until(ok: () => boolean, ms: number) {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await wait(10);
  return ok();
}

test('everyone who asks after a free id is told so, at once, when the first to ask has waited the time', async () => {
  // On this machine alone: left to itself the server listens on every interface.
  const serve = `require('peer').PeerServer({ host: '127.0.0.1', port: 0, path: '/', expire_timeout: ${EXPIRE_MS}, cleanup_out_msgs: ${LOOK_MS} }, (s) => console.log(s.address().port))`;
  const server = spawn(process.execPath, ['-e', serve], { cwd: join(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'] });
  const askers: Asker[] = [];
  try {
    const gone = once(server, 'exit').then(() => {
      throw new Error("the PeerJS server didn't start");
    });
    const port = Number(String((await Promise.race([once(server.stdout, 'data'), gone]))[0]));
    for (const id of ['a', 'b', 'c']) askers.push(await peer(port, id));
    const [a, b, c] = askers;
    // The first asks; the others, one of them twice, with a third of its time gone.
    let dst = '';
    let began = 0;
    let last = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      dst = `nobody-${attempt}`;
      began = Date.now();
      a.ask(dst);
      await wait(EXPIRE_MS / 3);
      b.ask(dst);
      b.ask(dst);
      c.ask(dst);
      last = Date.now();
      // (A machine too busy to get there before most of the first's time was gone: once more, after another id.)
      if (last - began < (EXPIRE_MS * 2) / 3) break;
    }
    const told = (p: Asker) => p.heard.filter((m) => m.src === dst);
    assert.ok(await until(() => askers.every((p) => told(p).length > 0), 4 * EXPIRE_MS), 'all of them told');
    await wait(3 * LOOK_MS);
    for (const p of askers) assert.deepEqual(told(p).map((m) => m.type), ['EXPIRE'], 'told once');
    // Timed from the first to ask, for all of them: the others waited that much less than the time.
    const first = told(a)[0].at - began;
    assert.ok(first >= EXPIRE_MS - 50, `${first} ms after the first asked`);
    for (const p of [b, c]) assert.ok(told(p)[0].at - last <= first - EXPIRE_MS / 4, `${told(p)[0].at - last} ms after the others asked, ${first} after the first`);
    // The time begins anew with the next to ask.
    const again = Date.now();
    c.ask(dst);
    assert.ok(await until(() => told(c).length > 1, 4 * EXPIRE_MS), 'told again');
    assert.ok(told(c)[1].at - again >= EXPIRE_MS - 50);
    await wait(3 * LOOK_MS);
    assert.equal(told(c).length, 2);
    assert.equal(told(a).length, 1);
  } finally {
    for (const p of askers) p.ws.close();
    server.kill();
  }
});

test('the server waits five seconds, and looks once a second', () => {
  const code = readFileSync(join(import.meta.dirname, '..', 'node_modules/peer/dist/index.cjs'), 'utf8');
  assert.match(code, /expire_timeout: 5000,/);
  assert.match(code, /cleanup_out_msgs: 1000,/);
});
