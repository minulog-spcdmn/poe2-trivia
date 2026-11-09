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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('everyone who asks after a free id is told so, at once, when the first to ask has waited the time', async () => {
  const serve = `require('peer').PeerServer({ port: 0, path: '/', expire_timeout: ${EXPIRE_MS}, cleanup_out_msgs: ${LOOK_MS} }, (s) => console.log(s.address().port))`;
  const server = spawn(process.execPath, ['-e', serve], { cwd: join(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'] });
  const gone = once(server, 'exit').then(() => {
    throw new Error("the PeerJS server didn't start");
  });
  const port = Number(String((await Promise.race([once(server.stdout, 'data'), gone]))[0]));
  const askers = await Promise.all(['a', 'b', 'c'].map((id) => peer(port, id)));
  try {
    const [a, b, c] = askers;
    const began = Date.now();
    a.ask('nobody');
    await wait(EXPIRE_MS / 2);
    // Asked twice by one, and by another only just before the first's time is up.
    b.ask('nobody');
    b.ask('nobody');
    await wait(EXPIRE_MS / 3);
    const last = Date.now();
    c.ask('nobody');
    await wait(EXPIRE_MS / 6 + 5 * LOOK_MS);
    for (const p of askers) assert.deepEqual(p.heard.map((m) => `${m.type} ${m.src}`), ['EXPIRE nobody'], 'told once');
    // Timed from the first to ask, for all of them: the last waited a fraction of the time.
    for (const p of askers) assert.ok(p.heard[0].at - began >= EXPIRE_MS - 50, `${p.heard[0].at - began} ms after the first asked`);
    assert.ok(c.heard[0].at - last < EXPIRE_MS / 2, `${c.heard[0].at - last} ms after the last asked`);
    // The time begins anew with the next to ask.
    const again = Date.now();
    c.ask('nobody');
    await wait(EXPIRE_MS + 5 * LOOK_MS);
    assert.equal(c.heard.length, 2);
    assert.ok(c.heard[1].at - again >= EXPIRE_MS - 50);
    assert.equal(a.heard.length, 1);
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
