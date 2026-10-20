import MagicString from 'magic-string';
import type { Plugin } from 'vite';

/**
 * PeerJS without its WebRTC probe (build only; vite.config.ts).
 *
 * On import, PeerJS works out what the browser supports by making a peer
 * connection and a data channel and closing them again. The first peer
 * connection a browser makes starts its WebRTC machinery, which holds the
 * page's thread for up to a second (on a fast desktop, in a fresh browser),
 * and PeerJS is imported while the start page is up (in idle time after its
 * first paint, lib/peer.ts preloadPeerJs), when that would stall it. All PeerJS
 * asks of the probe is whether WebRTC is there at all (Peer's constructor);
 * so the probe goes, and what it found is read from what the browser has.
 * The first peer connection is then made when one is needed: joining a
 * room, or a look at an open one.
 *
 * tests/peerjsProbe.test.ts checks this still finds the probe in the PeerJS
 * installed, and the build stops if it doesn't, so an update can't bring the
 * probe back unnoticed.
 */
export const PEERJS_FILE = /\/node_modules\/peerjs\/dist\/bundler\.mjs$/;

/** From the probe's guard to its result: the peer connection and data channel made and closed. */
const PROBE = /(if \(!supported\.webRTC\) return supported;)[\s\S]*?(return supported;)/;

/** Where the probe tells iOS apart, naming PeerJS's browser helper (whose bundled name changes with each PeerJS build). */
const IOS = /supported\.binaryBlob = !\(0, ([\w$]+)\)\.isIOS;/;

/** What the probe found, read without making anything (WebRTC there means data channels too, in every browser PeerJS supports). */
const read = (helper: string) => `supported.audioVideo = true;
            supported.data = typeof RTCPeerConnection.prototype.createDataChannel === "function";
            supported.reliable = supported.data;
            supported.binaryBlob = supported.data && !(0, ${helper}).isIOS;
            `;

/** Where the probe is in PeerJS's code, and what goes there instead; null if it isn't there as expected. */
function findProbe(code: string): { start: number; end: number; text: string } | null {
  const m = PROBE.exec(code);
  const ios = m && IOS.exec(m[0]);
  if (!m || !ios || !/new RTCPeerConnection\(/.test(m[0])) return null;
  return { start: m.index, end: m.index + m[0].length, text: m[1] + '\n            ' + read(ios[1]) + m[2] };
}

/** PeerJS's code with the probe taken out, or null if it isn't there as expected. */
export function withoutProbe(code: string): string | null {
  const p = findProbe(code);
  return p && code.slice(0, p.start) + p.text + code.slice(p.end);
}

export function peerjsProbe(): Plugin {
  return {
    name: 'peerjs-probe',
    apply: 'build',
    transform(code, id) {
      if (!PEERJS_FILE.test(id.replace(/\\/g, '/'))) return;
      const p = findProbe(code);
      if (p === null) this.error("PeerJS's WebRTC probe isn't where peerjsProbe.ts looks for it: check what it does now and update peerjsProbe.ts.");
      // The rest of PeerJS keeps its place in the source map.
      const s = new MagicString(code).overwrite(p.start, p.end, p.text);
      return { code: s.toString(), map: s.generateMap({ hires: true, source: id }) };
    },
  };
}
