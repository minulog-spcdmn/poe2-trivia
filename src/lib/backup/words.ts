// What the offer after a game says (lib/backup/backup.svelte.ts offerBackup), apart so the QA desk shows the same words.

export const OFFER = {
  message: 'Your progress lives in this browser only. A passkey keeps it safe if the browser clears it, or on a new phone.',
  opts: { title: 'Keep your progress safe?', sticky: true },
} as const;
