// The art lane: a second data channel next to PeerJS's own, on the same
// connection, host to guest only, for a question's pictures (MediaMsg).
// PeerJS's channel is reliable and ordered, so a picture of up to a few
// hundred KB on it held up everything sent after it (the state, pings,
// cursors) and one lost packet held them all until it came again. On a
// stream of its own the art only waits for the art. Kept free of PeerJS
// and Svelte so it can be tested on its own (tests/artLane.test.ts).

/** The lane's stream id, agreed on both sides (`negotiated`), clear of PeerJS's own channel (the first id or two). */
export const ART_LANE_ID = 6;

/** Bytes per frame, as PeerJS chunks its own (a size every browser takes). */
export const LANE_FRAME_BYTES = 16 * 1024;
/** Frame head: message number, its whole length, where this frame starts (32 bits each). */
const HEAD_BYTES = 12;

/**
 * The lane's own send buffer is kept under this, the rest waiting here:
 * whatever order the browser sends its streams in, a message on PeerJS's
 * channel never waits behind more of the art than that.
 */
export const LANE_HIGH_BYTES = 64 * 1024;
/** Sending goes on once the buffer is down to this. */
export const LANE_LOW_BYTES = 32 * 1024;

/** A lane not open by then never will be (ms): it is closed, and what waits on it goes on the main channel instead. */
export const LANE_OPEN_MS = 10_000;

/** The largest message a guest takes: a veiled picture's labels (1 MB at most) and the picture. */
export const MAX_LANE_MESSAGE = 6 * 1024 * 1024;
/** A message's own description (everything but its bytes) is small. */
const MAX_HEADER_BYTES = 4096;

/** What the lane needs of an RTCDataChannel (a fake one in tests). */
export interface LaneChannel {
  readonly readyState: string;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: string;
  send(data: Uint8Array<ArrayBuffer>): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'bufferedamountlow' | 'message', listener: (e: { data?: unknown }) => void): void;
}

/** The lane on a connection, or null where it can't be opened (the guest then takes the art on PeerJS's channel). */
export function openLane(pc: RTCPeerConnection | null | undefined): RTCDataChannel | null {
  if (!pc || pc.connectionState === 'closed') return null;
  try {
    const dc = pc.createDataChannel('art', { negotiated: true, id: ART_LANE_ID, ordered: true });
    dc.binaryType = 'arraybuffer';
    return dc;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A message as bytes: its fields as JSON (each binary field named in `$bin`
 * with its length), then the binary fields' bytes in that order.
 */
export function encodeLaneMsg(msg: Record<string, unknown>): Uint8Array<ArrayBuffer> {
  const fields: Record<string, unknown> = {};
  const parts: Uint8Array[] = [];
  const bin: [string, number][] = [];
  for (const [k, v] of Object.entries(msg)) {
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
      const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      parts.push(bytes);
      bin.push([k, bytes.byteLength]);
    } else if (v !== undefined) fields[k] = v;
  }
  const head = encoder.encode(JSON.stringify({ ...fields, $bin: bin }));
  const out = new Uint8Array(4 + head.byteLength + parts.reduce((n, p) => n + p.byteLength, 0));
  new DataView(out.buffer).setUint32(0, head.byteLength);
  out.set(head, 4);
  let at = 4 + head.byteLength;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** A message from its bytes (encodeLaneMsg), its binary fields as ArrayBuffers of their own; null if it isn't one. */
export function decodeLaneMsg(bytes: Uint8Array): Record<string, unknown> | null {
  if (bytes.byteLength < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headLen = view.getUint32(0);
  if (headLen > MAX_HEADER_BYTES || 4 + headLen > bytes.byteLength) return null;
  let head: unknown;
  try {
    head = JSON.parse(decoder.decode(bytes.subarray(4, 4 + headLen)));
  } catch {
    return null;
  }
  if (typeof head !== 'object' || head === null || Array.isArray(head)) return null;
  const { $bin, ...fields } = head as Record<string, unknown>;
  if (!Array.isArray($bin) || $bin.length > 4) return null;
  let at = 4 + headLen;
  const out: Record<string, unknown> = fields;
  for (const entry of $bin) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Number.isInteger(entry[1]) || entry[1] < 0) return null;
    const [key, len] = entry as [string, number];
    if (key === '__proto__' || at + len > bytes.byteLength) return null;
    out[key] = bytes.slice(at, at + len).buffer;
    at += len;
  }
  return at === bytes.byteLength ? out : null;
}

/**
 * Development only: a far link played on a near one (the `fakeLink` setting,
 * "<round trip ms>,<KB/s>", e.g. "350,40"): what the host sends arrives half
 * the round trip late, and the art lane no faster than that rate.
 */
export interface FakeLink {
  delayMs: number;
  bytesPerSec: number;
}

export function parseFakeLink(v: string | null | undefined): FakeLink | null {
  const m = /^\s*(\d{1,5})\s*,\s*(\d{1,6})\s*$/.exec(v ?? '');
  if (!m || !Number(m[2])) return null;
  return { delayMs: Number(m[1]) / 2, bytesPerSec: Number(m[2]) * 1024 };
}

/** Host: sends messages down a guest's lane in frames, no more at a time than the lane's buffer should hold. */
export class LaneSender {
  private frames: Uint8Array<ArrayBuffer>[] = [];
  private waiting = 0;
  private seq = 0;
  private readonly channel: LaneChannel;
  /** A fake far link (development): frames handed over but held back, and when the next may go. */
  private readonly fake: FakeLink | null;
  private held = 0;
  private nextAt = 0;

  /** Closed, or never opened: nothing more goes down it (see `onDead`). */
  private gone = false;
  private readonly onDead: () => void;
  private openTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * `onDead`: the lane closed, or didn't open within LANE_OPEN_MS. What it
   * still held is dropped (a message cut short with it is let go by the
   * guest), so whatever was sent down it is best sent again another way.
   */
  constructor(channel: LaneChannel, fake: FakeLink | null = null, onDead: () => void = () => {}) {
    this.channel = channel;
    this.fake = fake;
    this.onDead = onDead;
    channel.bufferedAmountLowThreshold = LANE_LOW_BYTES;
    channel.addEventListener('bufferedamountlow', () => this.pump());
    channel.addEventListener('open', () => {
      clearTimeout(this.openTimer);
      this.pump();
    });
    channel.addEventListener('close', () => this.dead());
    if (channel.readyState === 'connecting')
      this.openTimer = setTimeout(() => {
        if (channel.readyState !== 'connecting') return;
        try {
          channel.close();
        } catch {
          // Gone already.
        }
        this.dead();
      }, LANE_OPEN_MS);
  }

  /** Whether messages can go down it (opened, not closed). */
  get open() {
    return !this.gone && this.channel.readyState === 'open';
  }

  /** Whether messages may still be put on it: open, or opening (they wait). */
  get usable() {
    return !this.gone && (this.channel.readyState === 'open' || this.channel.readyState === 'connecting');
  }

  /** Bytes still to send: waiting here and in the lane's own buffer. */
  get backlog() {
    return this.waiting + this.held + (this.open ? this.channel.bufferedAmount : 0);
  }

  send(msg: Record<string, unknown>) {
    const bytes = encodeLaneMsg(msg);
    const n = this.seq++ >>> 0;
    const room = LANE_FRAME_BYTES - HEAD_BYTES;
    for (let at = 0; at < bytes.byteLength || at === 0; at += room) {
      const body = bytes.subarray(at, Math.min(at + room, bytes.byteLength));
      const frame = new Uint8Array(HEAD_BYTES + body.byteLength);
      const view = new DataView(frame.buffer);
      view.setUint32(0, n);
      view.setUint32(4, bytes.byteLength);
      view.setUint32(8, at);
      frame.set(body, HEAD_BYTES);
      this.frames.push(frame);
      this.waiting += frame.byteLength;
      if (body.byteLength < room) break;
    }
    this.pump();
  }

  /**
   * Drops every frame not handed to the lane yet: what is still to go of a
   * question gone by, so the next one's art doesn't queue behind it. A
   * message cut short this way is let go by the guest as the next one starts
   * (LaneReceiver: a frame at 0 begins afresh).
   */
  clear() {
    this.frames = [];
    this.waiting = 0;
  }

  /** Where the next message sent goes in the lane's order, for clearBefore. */
  get mark() {
    return this.seq;
  }

  /**
   * As clear, but only for the messages sent before `mark` (read then):
   * what is still to go of the question gone by is dropped, while the next
   * question's art, sent after it (drawn ahead in a race), stays.
   */
  clearBefore(mark: number) {
    this.keep((n) => n >= mark >>> 0);
  }

  /** Drops what hasn't gone yet of the messages sent from `from` up to `to` (marks): a question drawn ahead and thrown away. */
  drop(from: number, to: number) {
    this.keep((n) => n < from >>> 0 || n >= to >>> 0);
  }

  /** Keeps only the frames not handed to the lane yet whose message number passes `wanted`. */
  private keep(wanted: (n: number) => boolean) {
    this.frames = this.frames.filter((f) => wanted(new DataView(f.buffer).getUint32(0)));
    this.waiting = this.frames.reduce((n, f) => n + f.byteLength, 0);
  }

  /** Hands frames to the lane while its buffer has room. */
  pump() {
    const ch = this.channel;
    while (this.frames.length && this.open && ch.bufferedAmount + this.held < LANE_HIGH_BYTES) {
      const frame = this.frames.shift()!;
      this.waiting -= frame.byteLength;
      if (this.fake) this.later(frame, this.fake);
      else this.put(frame);
    }
  }

  private put(frame: Uint8Array<ArrayBuffer>) {
    try {
      this.channel.send(frame);
    } catch {
      // Closed underneath us (or it won't take more): the rest goes another way.
      this.dead();
    }
  }

  private dead() {
    if (this.gone) return;
    this.gone = true;
    clearTimeout(this.openTimer);
    this.frames = [];
    this.waiting = 0;
    this.onDead();
  }

  /** Fake far link: each frame goes once the rate allows, half a round trip late. */
  private later(frame: Uint8Array<ArrayBuffer>, fake: FakeLink) {
    const now = Date.now();
    this.nextAt = Math.max(now, this.nextAt) + (frame.byteLength / fake.bytesPerSec) * 1000;
    this.held += frame.byteLength;
    setTimeout(() => {
      this.held -= frame.byteLength;
      if (this.open) this.put(frame);
      this.pump();
    }, this.nextAt - now + fake.delayMs);
  }
}

/** Guest: puts the lane's frames back together, one message at a time (the lane is ordered). */
export class LaneReceiver {
  private current: { n: number; bytes: Uint8Array; got: number } | null = null;
  private readonly onMessage: (msg: Record<string, unknown>) => void;

  constructor(onMessage: (msg: Record<string, unknown>) => void) {
    this.onMessage = onMessage;
  }

  /** Takes a frame; false when it can't be one a real host sends (the lane is then best dropped). */
  take(data: unknown): boolean {
    if (!(data instanceof ArrayBuffer) || data.byteLength < HEAD_BYTES || data.byteLength > LANE_FRAME_BYTES) return false;
    const view = new DataView(data);
    const n = view.getUint32(0);
    const total = view.getUint32(4);
    const at = view.getUint32(8);
    const body = new Uint8Array(data, HEAD_BYTES);
    if (total > MAX_LANE_MESSAGE) return false;
    if (at === 0) this.current = { n, bytes: new Uint8Array(total), got: 0 };
    const cur = this.current;
    if (!cur || cur.n !== n || cur.bytes.byteLength !== total || at !== cur.got || at + body.byteLength > total) return false;
    cur.bytes.set(body, at);
    cur.got += body.byteLength;
    if (cur.got < total) return true;
    this.current = null;
    const msg = decodeLaneMsg(cur.bytes);
    if (!msg) return false;
    this.onMessage(msg);
    return true;
  }
}
