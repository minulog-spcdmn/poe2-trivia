import { test } from 'node:test';
import assert from 'node:assert/strict';
import { honestRtt, selectedPairRtt } from '../src/lib/linkRtt.ts';

const report = (...rs: object[]) => ({ forEach: (cb: (r: never) => void) => rs.forEach((r) => cb(r as never)) });

test("the round trip is the selected candidate pair's, as the transport names it", () => {
  const stats = report(
    { type: 'transport', selectedCandidatePairId: 'b' },
    { type: 'candidate-pair', id: 'a', currentRoundTripTime: 0.05, nominated: true, state: 'succeeded' },
    { type: 'candidate-pair', id: 'b', currentRoundTripTime: 0.31 },
  );
  assert.equal(selectedPairRtt(stats), 310);
});

test('without a transport naming it, the pair marked selected (Firefox) or nominated and working', () => {
  assert.equal(selectedPairRtt(report({ type: 'candidate-pair', id: 'a', currentRoundTripTime: 0.2, selected: true })), 200);
  assert.equal(selectedPairRtt(report({ type: 'candidate-pair', id: 'a', currentRoundTripTime: 0.2, nominated: true, state: 'succeeded' })), 200);
  assert.equal(selectedPairRtt(report({ type: 'candidate-pair', id: 'a', nominated: true, state: 'succeeded' })), null, 'no round trip measured yet');
  assert.equal(selectedPairRtt(report({ type: 'candidate-pair', id: 'a', currentRoundTripTime: 0.2, nominated: true, state: 'in-progress' })), null);
});

test("what timing leans on can't be made longer by holding pongs back", () => {
  // The browser's own measure wins over pongs a guest can delay.
  assert.equal(honestRtt({ linkRtt: 180, pingTimes: [900, 950], rtt: 920 }), 180);
  // Without it, the best recent ping: one quick pong is the link at best.
  assert.equal(honestRtt({ linkRtt: null, pingTimes: [900, 190, 950], rtt: 700 }), 190);
  assert.equal(honestRtt({ linkRtt: null, pingTimes: [], rtt: 150 }), 150);
});
