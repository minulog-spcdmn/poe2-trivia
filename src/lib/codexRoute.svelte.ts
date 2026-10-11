// The codex has its own address (#codex), so it can be linked to and the
// browser's back button closes it.

const HASH = '#codex';
/** The address's #codex, whatever follows it (?off=: lib/switchedOff.ts). */
const atCodex = () => location.hash.split('?')[0] === HASH;

class CodexRoute {
  open = $state(atCodex());
}

export const codexRoute = new CodexRoute();

const sync = () => (codexRoute.open = atCodex());
addEventListener('popstate', sync);
addEventListener('hashchange', sync);

export function openCodex() {
  if (codexRoute.open) return;
  history.pushState({ codex: true }, '', HASH);
  codexRoute.open = true;
}

/** Back to where it was opened from; an address typed or linked with #codex just loses it. */
export function closeCodex() {
  if (!codexRoute.open) return;
  if ((history.state as { codex?: boolean } | null)?.codex) {
    history.back();
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  codexRoute.open = false;
}
