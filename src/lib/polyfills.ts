// The few built-ins the game calls that browsers still in use can lack: an
// old Chromium inside a browser shell (Chrome 92, say, as browsers in China
// often are) has none of them, and the game wouldn't start there
// (Object.hasOwn reading the saved settings). Filled in where missing, before
// any module runs: built into an inline script at the top of every page with
// the game's code (vite.config.ts polyfillsFirst), so it imports and exports
// nothing; the workers call none of them. tests/polyfills.test.ts fails when
// the game calls a newer one not filled in.

const fill = (on: object, name: string, value: unknown) => {
  if (!(name in on)) Object.defineProperty(on, name, { value, writable: true, configurable: true });
};

// Chrome 93, Safari 15.4.
fill(Object, 'hasOwn', (o: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(o, key));

// Chrome 97, Safari 15.4.
fill(Array.prototype, 'findLastIndex', function <T>(this: T[], test: (v: T, i: number, a: T[]) => unknown, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
  return -1;
});
fill(Array.prototype, 'findLast', function <T>(this: T[], test: (v: T, i: number, a: T[]) => unknown, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
  return undefined;
});

// Chrome 110, Safari 16.
fill(Array.prototype, 'toSorted', function <T>(this: T[], order?: (a: T, b: T) => number) {
  return Array.prototype.slice.call(this).sort(order);
});

// Chrome 98, Safari 15.4: what the game clones is its state, plain data.
// What can't be cloned throws as the real one does (Svelte's $state.snapshot
// counts on it); other built-in objects than these aren't expected.
const uncloneable = (v: unknown) => new DOMException(`${String(v).slice(0, 40)} could not be cloned.`, 'DataCloneError');
const clone = (v: unknown, seen: Map<object, unknown>): unknown => {
  if (typeof v === 'function' || typeof v === 'symbol') throw uncloneable(v);
  if (typeof v !== 'object' || v === null) return v;
  if (seen.has(v)) return seen.get(v);
  if (typeof Node !== 'undefined' && v instanceof Node) throw uncloneable(v);
  const kept = <T>(out: T) => (seen.set(v, out), out);
  if (v instanceof Date) return kept(new Date(v.getTime()));
  if (v instanceof RegExp) return kept(new RegExp(v.source, v.flags));
  if (v instanceof ArrayBuffer) return kept(v.slice(0));
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return kept((v as unknown as Uint8Array).slice());
  if (v instanceof Map) {
    const out = kept(new Map());
    v.forEach((x, k) => out.set(clone(k, seen), clone(x, seen)));
    return out;
  }
  if (v instanceof Set) {
    const out = kept(new Set());
    v.forEach((x) => out.add(clone(x, seen)));
    return out;
  }
  const out = kept((Array.isArray(v) ? new Array(v.length) : {}) as Record<string, unknown>);
  for (const k of Object.keys(v)) {
    const x = clone((v as Record<string, unknown>)[k], seen);
    // (A "__proto__" key, as JSON.parse makes from a peer's message, stays a key, not the copy's prototype.)
    if (k === '__proto__') Object.defineProperty(out, k, { value: x, enumerable: true, writable: true, configurable: true });
    else out[k] = x;
  }
  return out;
};
fill(globalThis, 'structuredClone', (v: unknown) => clone(v, new Map()));

// Chrome 100, Safari 15.4. (Before Chrome 98 a signal has no reason: an AbortError stands in.)
if (typeof AbortSignal !== 'undefined')
  fill(AbortSignal.prototype, 'throwIfAborted', function (this: AbortSignal) {
    if (this.aborted) throw this.reason ?? new DOMException('This operation was aborted', 'AbortError');
  });
