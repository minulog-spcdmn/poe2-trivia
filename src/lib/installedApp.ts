/**
 * Running as an iPhone's or iPad's home-screen app (iOS says so with
 * navigator.standalone, which nothing else has). Its storage is apart from
 * Safari's, and a link to a tab of its own leaves the app for a Safari sheet.
 * An installed app elsewhere (Android's, a desktop's) shares its browser's
 * storage, so it needs nothing of this.
 */
export const installedApp = (nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean =>
  (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
