// Turns this checkout's CRLF text files back into LF, as .gitattributes has
// them. Only a checkout made before .gitattributes (or a file a Windows tool
// wrote with CRLF) needs it; uncommitted edits are kept, only line breaks change.
// tests/lineEndings.test.ts names the files it would fix.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The tracked text files with a CRLF on disk (all CRLF or mixed), relative to the repo root. @param {string} root @returns {string[]} */
export function crlfFiles(root = process.cwd()) {
  // -z: paths unquoted (a non-ASCII name comes out as it is), each entry ending in NUL.
  return execFileSync('git', ['ls-files', '--eol', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
    .split('\0')
    .filter((l) => /^i\/lf\s+w\/(crlf|mixed)\s/.test(l))
    .map((l) => l.slice(l.indexOf('\t') + 1));
}

/** The bytes with every CR before a LF taken out; the rest as they are, whatever the encoding. @param {Buffer} b */
export function toLf(b) {
  const out = Buffer.allocUnsafe(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] !== 13 || b[i + 1] !== 10) out[n++] = b[i];
  return out.subarray(0, n);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = crlfFiles();
  /** @type {string[]} */
  const failed = [];
  for (const f of files) {
    try {
      writeFileSync(f, toLf(readFileSync(f)));
    } catch (e) {
      failed.push(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const fixed = files.length - failed.length;
  console.log(files.length ? `${fixed} files back to LF` : 'every text file is LF already');
  if (failed.length) {
    console.error(`${failed.length} left as they were:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
}
