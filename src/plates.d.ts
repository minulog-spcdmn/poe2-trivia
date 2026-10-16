// A rune circle's plate, built with the site (vite.config.ts, plates):
// `plate()` reads it, the first time it's asked for.
declare module 'virtual:plate/*' {
  export const plate: () => any;
}
