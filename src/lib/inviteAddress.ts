// An invite link is the site's address with its room in it (?room=CODE).

/** What an invite adds to the address: its room; older links named their host (?by=), which the room says now; the beta's first look (?first, Home.svelte). */
const INVITE_PARAMS = ['room', 'by', 'first'];

/** The address `href` without the invite in it, as the page's own (path, the rest of its query and its hash). */
export function withoutInvite(href: string) {
  const url = new URL(href);
  // (Untouched otherwise: deleting writes the rest of the query out again, ?delve as ?delve=.)
  if (INVITE_PARAMS.some((p) => url.searchParams.has(p))) for (const p of INVITE_PARAMS) url.searchParams.delete(p);
  return url.pathname + url.search + url.hash;
}
