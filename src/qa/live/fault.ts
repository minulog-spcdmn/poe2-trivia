// A live seat's link faults (the QA desk's "Play from here"), installed
// before the app loads. It patches only the browser's own WebRTC classes,
// under PeerJS and the art lane, so the game's own code runs as it would
// over a bad link:
//   hold()           every data channel's messages wait, both ways
//   hold(true)       a partition: channel closes and ICE state changes wait
//                    too, so a peer that hangs up isn't heard of either
//   release()        what waited goes through, in order
//   cut()            every peer connection closes
//   lag(ms)          every message waits ms/2 each way, in order (0: none)
// From the live-network spike (FINDINGS.md on its branch): a hold at one
// end is no partition, the other end's close still arrives unless held;
// and the game notices a silent link 12 to 18 s in (DEAD_AFTER_MS counted
// from the last pong and checked every 3 s, HOST_SILENCE_MS every 2 s).

type Waiting = () => void;
const outgoing: Waiting[] = [];
const incoming: Waiting[] = [];
let holding = false;
let partition = false;
let lagMs = 0;
/** When the last message held for lag goes, so the next never overtakes it. */
let lastOut = 0;
let lastIn = 0;
const pcs = new Set<RTCPeerConnection>();

/** Runs `fn` after half the lag, never before what was delayed already. */
function later(fn: Waiting, last: 'out' | 'in') {
  const now = performance.now();
  const at = Math.max(now + lagMs / 2, last === 'out' ? lastOut : lastIn);
  if (last === 'out') lastOut = at;
  else lastIn = at;
  setTimeout(fn, at - now);
}

const dcProto = RTCDataChannel.prototype;
const send = dcProto.send;
dcProto.send = function (this: RTCDataChannel, data: never) {
  const go = () => {
    if (this.readyState === 'open') send.call(this, data);
  };
  if (holding) outgoing.push(go);
  else if (lagMs) later(go, 'out');
  else send.call(this, data);
};

/** Which events wait: messages while holding, the rest only in a partition. */
const held = (type: string) => holding && (type === 'message' || partition);

const wrapped = new WeakMap<object, EventListener>();
const wrap = (fn: EventListener, type: string): EventListener => {
  let w = wrapped.get(fn);
  if (!w) {
    w = function (this: EventTarget, e: Event) {
      if (held(type)) incoming.push(() => fn.call(this, e));
      else if (lagMs && type === 'message') later(() => fn.call(this, e), 'in');
      else fn.call(this, e);
    };
    wrapped.set(fn, w);
  }
  return w;
};

/** Puts the waiting in front of `types`' listeners on `proto`, by addEventListener and by on<type>. */
function patch(proto: EventTarget, types: string[]) {
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  proto.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
    return add.call(this, type, types.includes(type) && typeof fn === 'function' ? wrap(fn, type) : fn, opts);
  };
  proto.removeEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | EventListenerOptions) {
    return remove.call(this, type, types.includes(type) && typeof fn === 'function' ? (wrapped.get(fn) ?? fn) : fn, opts);
  };
  for (const type of types) {
    const d = Object.getOwnPropertyDescriptor(proto, `on${type}`)!;
    const own = new WeakMap<object, EventListener | null>();
    Object.defineProperty(proto, `on${type}`, {
      configurable: true,
      get(this: object) {
        return own.get(this) ?? null;
      },
      set(this: object, fn: EventListener | null) {
        own.set(this, fn);
        d.set!.call(this, fn ? wrap(fn, type) : null);
      },
    });
  }
}

let installed = false;
/** Puts the fault layer in, before anything opens a connection. */
export function installFaults() {
  if (installed || typeof RTCDataChannel === 'undefined') return;
  installed = true;
  patch(dcProto, ['message', 'close']);
  patch(RTCPeerConnection.prototype, ['iceconnectionstatechange', 'connectionstatechange']);
  const Original = RTCPeerConnection;
  window.RTCPeerConnection = class extends Original {
    constructor(config?: RTCConfiguration) {
      super(config);
      pcs.add(this);
    }
  } as typeof RTCPeerConnection;
}

const flush = (q: Waiting[]) => {
  for (const f of q.splice(0))
    try {
      f();
    } catch (e) {
      console.warn('fault: flush', e);
    }
};

export const faults = {
  hold(asPartition = false) {
    holding = true;
    partition = asPartition;
  },
  release() {
    holding = partition = false;
    flush(outgoing);
    flush(incoming);
  },
  cut() {
    for (const pc of pcs) pc.close();
  },
  lag(ms: number) {
    lagMs = Math.max(0, ms);
  },
  get state() {
    return { holding, partition, lag: lagMs };
  },
};
