// Turns this checkout's CRLF text files back into LF, as .gitattributes has
// them. Only a checkout made before .gitattributes (or a file a Windows tool
// wrote with CRLF) needs it; uncommitted edits are kept, only line breaks change.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--eol'], { encoding: 'utf8' })
  .split('\n')
  .filter((l) => /^i\/lf\s+w\/crlf\s/.test(l))
  .map((l) => l.split('\t')[1]);
for (const f of files) writeFileSync(f, readFileSync(f, 'utf8').replaceAll('\r\n', '\n'));
console.log(files.length ? `${files.length} files back to LF` : 'every text file is LF already');
