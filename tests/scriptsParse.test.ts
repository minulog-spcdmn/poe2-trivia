// Every script in scripts/ parses: most run only by hand (a refresh's once a
// league), so nothing else would find one broken before the day it's needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));
const run = promisify(execFile);

test('every script parses', async () => {
  const files = readdirSync(SCRIPTS, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.length > 20, `found ${files.length}`);
  const failed: string[] = [];
  await Promise.all(
    files.map((f) =>
      run(process.execPath, ['--check', `${SCRIPTS}${f}`]).catch((e: { stderr?: string }) => {
        failed.push(`${f}: ${(e.stderr ?? '').split(/\r?\n/).find((l) => l.startsWith('SyntaxError')) ?? e.stderr}`);
      }),
    ),
  );
  assert.deepEqual(failed, []);
});
