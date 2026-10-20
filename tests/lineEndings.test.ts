import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { crlfFiles } from '../scripts/fix-eol.mjs';

// .gitattributes keeps every checkout LF, and the build and the tests read
// files as they are. A checkout made before it (or a file a Windows tool
// wrote) still has CRLF on disk, which fails other tests in ways that don't
// say why; this one says why, once.
test('every tracked text file is LF on disk', () => {
  const files = crlfFiles(join(import.meta.dirname, '..'));
  const shown = files.slice(0, 10).join(', ') + (files.length > 10 ? ` and ${files.length - 10} more` : '');
  assert.deepEqual(files, [], `CRLF in this checkout (${shown}): run npm run fix-eol`);
});
