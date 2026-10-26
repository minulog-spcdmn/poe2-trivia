import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A phone's keyboard corrects what it doesn't know to a word it does: Gboard
// made a typed Wolfsberg Wolfsburg, and gamer tags and codes are seldom
// words. Every field that takes a name or a code turns autocorrect off
// (spellcheck="false" alone only hides the underline on Chrome).
const FIELDS: Record<string, RegExp> = {
  'src/components/Home.svelte': /maxlength=\{(MAX_NAME|CODE_LENGTH)\}/,
  'src/components/Lobby.svelte': /maxlength=\{MAX_NAME\}/,
  'src/components/Settings.svelte': /maxlength=\{MAX_NAME\}/,
  'src/components/SyncDialog.svelte': /aria-label="Sync code"/,
  'src/components/Codex.svelte': /aria-label="Search names"/,
};

test('the fields that take a name or a code never autocorrect it', () => {
  for (const [file, takes] of Object.entries(FIELDS)) {
    const inputs = readFileSync(file, 'utf8').match(/<input\b[\s\S]*?\/>/g) ?? [];
    const fields = inputs.filter((i) => takes.test(i));
    assert.ok(fields.length > 0, `${file} has no field the check knows`);
    for (const field of fields) assert.match(field, /autocorrect="off"/, `${file}: ${field.replace(/\s+/g, ' ')}`);
  }
});
