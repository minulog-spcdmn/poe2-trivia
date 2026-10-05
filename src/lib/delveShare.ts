import { SITE_URL } from './site.ts';

/** The query a shared link carries: opening it goes straight into Delve (see Home.svelte). */
export const DELVE_LINK_PARAM = 'delve';

/** What a delver shares from the end screen: how deep they got, a dare, and a link straight into Delve. */
export const shareText = (depth: number) => `I reached depth ${depth} in Delve, can you beat me? ${new URL(SITE_URL).host}/?${DELVE_LINK_PARAM}`;
