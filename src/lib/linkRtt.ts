// A connection's round trip as the browser itself measures it: its ICE
// consent checks, answered by the other browser's network stack, not by its
// page. A guest can hold its pongs back and look further away than it is;
// it can't hold these back. Where timing could favour a guest that looks far
// (the host's race handicap, Delve's half trip), this is what counts.

/** The selected candidate pair's current round trip (ms), or null where the browser doesn't say. */
export async function measuredRtt(pc: RTCPeerConnection | null | undefined): Promise<number | null> {
  if (!pc || pc.connectionState === 'closed') return null;
  let stats: RTCStatsReport;
  try {
    stats = await pc.getStats();
  } catch {
    return null;
  }
  return selectedPairRtt(stats);
}

type Report = { type?: string; id?: string; selectedCandidatePairId?: string; currentRoundTripTime?: number; selected?: boolean; nominated?: boolean; state?: string };

/** The round trip (ms) of the candidate pair in use: the transport's selected one (Chrome, Safari), or the one marked selected (Firefox). */
export function selectedPairRtt(stats: { forEach(cb: (r: Report) => void): void }): number | null {
  let pairId: string | undefined;
  stats.forEach((r) => {
    if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
  });
  let rtt: number | null = null;
  stats.forEach((r) => {
    if (r.type !== 'candidate-pair' || typeof r.currentRoundTripTime !== 'number' || !(r.currentRoundTripTime >= 0)) return;
    if (pairId ? r.id === pairId : r.selected || (r.nominated && r.state === 'succeeded')) rtt = r.currentRoundTripTime * 1000;
  });
  return rtt;
}

/** Recent ping times kept per guest: the lowest is its link at best (a guest can only make it longer). */
export const PING_SAMPLES = 10;

/**
 * The round trip timing may lean on: the browser's own measure, else the
 * lowest recent ping, else the smoothed one.
 */
export function honestRtt(g: { linkRtt: number | null; pingTimes: number[]; rtt: number }): number {
  if (g.linkRtt !== null) return g.linkRtt;
  return g.pingTimes.length ? Math.min(...g.pingTimes) : g.rtt;
}
