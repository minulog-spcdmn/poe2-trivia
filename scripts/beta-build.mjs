// The beta of a checkout, built as the redraw check watches it (scripts/sweep.mjs) and as its first
// job compares main's with a pull request's (scripts/redraws-unchanged.mjs): built one way, so two
// builds the same for the one are the same for the other.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Builds the beta of the checkout at `root` into `out`; vite's exit status, 0 when it built. */
export function buildBeta(/** @type {string} */ root, /** @type {string} */ out) {
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, env: { ...process.env, VITE_CHANNEL: 'beta' }, stdio: 'inherit' }).status ?? 1;
}
