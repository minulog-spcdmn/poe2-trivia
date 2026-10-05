import { SITE_URL } from './site.ts';

/** What a delver shares from the end screen: how deep they got, and a dare. */
export const shareText = (depth: number) => `I reached depth ${depth} in Delve, can you beat me? ${new URL(SITE_URL).host}`;
