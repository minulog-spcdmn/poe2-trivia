// Chrome on an emulator, driven through its DevTools Protocol, which
// pool.mjs forwards to localhost:<9333 + k> for instance k (docs/android.md).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A DevTools session on a websocket: send(method, params) and ev(expression) for the page's value. */
export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (m) => {
    const j = JSON.parse(m.data);
    if (j.id && waiting.has(j.id)) {
      waiting.get(j.id)(j);
      waiting.delete(j.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiting.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  const close = () => ws.close();
  return new Promise((r, no) => {
    ws.addEventListener('open', () => r({ send, ev, close }), { once: true });
    ws.addEventListener('error', () => no(new Error(`no DevTools at ${wsUrl}`)), { once: true });
  });
}

/** The browser's own session, for what isn't a page's (SystemInfo). */
export async function browser(port) {
  const v = await (await fetch(`http://localhost:${port}/json/version`)).json();
  return { version: v.Browser, ...(await connect(v.webSocketDebuggerUrl)) };
}

/** The first page tab's session. */
export async function page(port) {
  const tabs = await (await fetch(`http://localhost:${port}/json`)).json();
  const tab = tabs.find((t) => t.type === 'page');
  if (!tab) throw new Error(`no page open in the Chrome on localhost:${port}`);
  return connect(tab.webSocketDebuggerUrl);
}
