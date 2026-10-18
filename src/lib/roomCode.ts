// Room codes and random tokens: one alphabet for every code a room is given
// (the session's, the QA desk's live rooms) and every check of one. No
// imports, so anything can use it, the tests included.

/** Letters and digits that can't be mistaken for one another (no I, O, 0 or 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function randomToken(len: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
}

export const randomCode = () => randomToken(CODE_LENGTH, CODE_ALPHABET);
