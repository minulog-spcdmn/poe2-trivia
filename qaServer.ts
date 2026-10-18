// The dev server's side of the QA desk (qa.html, docs/qa.md): what the last
// sweep found (scripts/qa.mjs writes screens/qa-latest.json) and its shots,
// for the desk to mark the stops it found something at; and the files this
// branch changes, for its "This change". Dev server only (the beta's change
// list is written as it is built, see .github/workflows/deploy.yml).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The files this checkout changes since it left main (the merge base with
 * origin/main, or main), committed or not, untracked ones included; paths
 * from the root, forward slashes.
 */
export function changedFiles(root: string): { base: string; files: string[] } | null {
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const base = git('merge-base', 'origin/main', 'HEAD') ?? git('merge-base', 'main', 'HEAD');
  if (!base) return null;
  const lines = (out: string | null) => (out ?? '').split('\n').filter(Boolean);
  const files = new Set([...lines(git('diff', '--name-only', base)), ...lines(git('ls-files', '--others', '--exclude-standard'))]);
  return { base, files: [...files].sort() };
}

export function qaServer(root: string): Plugin {
  const screens = join(root, 'screens');
  return {
    name: 'qa-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/latest', (_req, res) => {
        const file = join(screens, 'qa-latest.json');
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
      });
      server.middlewares.use('/__qa/change', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(changedFiles(root)));
      });
      // A shot of a sweep: /__qa/shot/qa-<when>/<file>.png, and nothing else under screens/.
      server.middlewares.use('/__qa/shot/', (req, res) => {
        const m = /^\/(qa-[\w-]+)\/([\w.-]+\.png)$/.exec(decodeURIComponent((req.url ?? '').split('?')[0]));
        const file = m && join(screens, m[1], m[2]);
        if (!file || !existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', 'image/png');
        res.end(readFileSync(file));
      });
    },
  };
}
