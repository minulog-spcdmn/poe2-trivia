import { execFileSync } from 'node:child_process';

/**
 * The folders the dev server never watches (vite.config.ts): those the
 * scripts fill with builds, runs, browser profiles and shots, each
 * git-ignored, and .claude, where other worktrees live under the main
 * checkout. Watched, they held up a cold start: the watcher walks every file
 * in them before the server answers, and one worktree's phone builds and runs
 * (.phone, some 61,000 files) kept the start page white for 42 s.
 * Written as .gitignore has them: a leading / for one at the root only, else
 * wherever it is in the checkout. Every folder .gitignore names (a line ending
 * in /) belongs here too, for a script that makes it while the server runs;
 * tests/unwatched.test.ts checks it does. Those already there, git is asked
 * about (`ignoredFolders`).
 */
export const UNWATCHED = ['/.claude', '.phone', '.pc', '.bot', '.preview', '.venv-art', '__pycache__', '/screens', 'dist', 'dist-ssr', 'logs', '/relay/.wrangler'];

/**
 * The folders git ignores in the checkout at `root` as it is, by any of its
 * rules (a .gitignore anywhere in it, .git/info/exclude, a folder's own, as a
 * Python venv has), each from the root (`/.venv-art-cuda`); node_modules left
 * to Vite, which never watches it. None without git.
 */
export function ignoredFolders(root: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split('\0')
      .filter((p) => p.endsWith('/') && !/(^|\/)node_modules\/$/.test(p))
      .map((p) => `/${p.slice(0, -1)}`);
  } catch {
    return [];
  }
}

/**
 * The watcher's test for a path: in one of those folders, or one git ignores
 * (asked once, when the watcher first asks, so a build never does), from the
 * checkout at `root` down. Never by a folder above the root, which a glob
 * tested against the whole path would also match: a worktree lives in .claude.
 */
export function unwatched(root: string, ignored = () => ignoredFolders(root)): (path: string) => boolean {
  // (Windows: either slash, and any case.)
  const plain = (p: string) => p.split('\\').join('/').toLowerCase();
  const base = `${plain(root).replace(/\/+$/, '')}/`;
  let dirs: string[] | undefined;
  return (path) => {
    const p = plain(path);
    if (!p.startsWith(base)) return false;
    dirs ??= [...UNWATCHED, ...ignored()].map((dir) => dir.toLowerCase());
    const inside = `/${p.slice(base.length)}/`;
    return dirs.some((dir) => (dir.startsWith('/') ? inside.startsWith(`${dir}/`) : inside.includes(`/${dir}/`)));
  };
}
