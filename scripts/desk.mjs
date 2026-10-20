#!/usr/bin/env node
// npm run qa: the dev server, with the QA desk (qa.html, docs/qa.md)
// opened in Chrome once it's up. Vite opens it (--open) on whatever port it
// got (the next free one if 5173 is taken), in the browser BROWSER names:
// Chrome unless BROWSER already says otherwise. Anything after `--` goes to
// Vite (npm run qa -- --port 5180).

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Chrome's name as each system's opener knows it.
const CHROME = { win32: 'chrome', darwin: 'google chrome' }[process.platform] ?? 'google-chrome';
const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');

const child = spawn(process.execPath, [vite, '--open', '/qa.html', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, BROWSER: process.env.BROWSER ?? CHROME },
});
child.on('exit', (code) => process.exit(code ?? 0));
