import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { AtRule, Node, Rule } from 'postcss';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Content Security Policy for the production build: the page may only run its
 * own scripts and talk to itself and the PeerJS signalling server. (WebRTC
 * connections between players aren't covered by CSP.) Not applied in dev,
 * where Vite needs inline scripts and its own websocket.
 */
function csp(env: Record<string, string>): Plugin {
  const peerHost = env.VITE_PEER_HOST || '0.peerjs.com';
  const secure = (env.VITE_PEER_SECURE ?? 'true') === 'true';
  const port = env.VITE_PEER_HOST && env.VITE_PEER_PORT ? `:${env.VITE_PEER_PORT}` : '';
  const signalling = `${secure ? 'https' : 'http'}://${peerHost}${port} ${secure ? 'wss' : 'ws'}://${peerHost}${port}`;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Svelte sets inline style attributes (animations, positions).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${signalling}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

/**
 * The fonts the start page shows, as their built file names begin. The page
 * is rendered by script, so the browser would only find them once the bundle
 * has run and laid out text; preloading fetches them alongside the bundle, so
 * the text appears in its own fonts instead of swapping from a fallback.
 */
const FIRST_SCREEN_FONTS = [
  'maragsa-display-',
  'cinzel-latin-700-normal-',
  'eb-garamond-latin-400-normal-',
  'eb-garamond-latin-400-italic-',
];

function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle || !ctx.filename.endsWith('/index.html')) return;
        const files = Object.keys(ctx.bundle).filter(
          (f) => f.endsWith('.woff2') && FIRST_SCREEN_FONTS.some((name) => f.split('/').pop()!.startsWith(name)),
        );
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `./${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

/**
 * Hover styles only for devices that can really hover. A touch screen fakes
 * a hover on tap and keeps it until the next tap elsewhere, so a tapped card
 * or button would stay lifted and lit. Every selector with `:hover` (in the
 * app's CSS and every component's) moves into `@media (hover: hover)`; the
 * other selectors of the same rule (`:focus-visible` and the like) stay put.
 */
const HOVER_MEDIA = '(hover: hover)';

const hoverOnlyWhereHoverable = {
  postcssPlugin: 'hover-only-where-hoverable',
  Rule(rule: Rule, { AtRule }: { AtRule: typeof import('postcss').AtRule }) {
    if (!rule.selector.includes(':hover')) return;
    for (let p: Node | undefined = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && (p as AtRule).params.includes(HOVER_MEDIA)) return;
    }
    const hover = rule.selectors.filter((s) => s.includes(':hover'));
    const rest = rule.selectors.filter((s) => !s.includes(':hover'));
    const media = new AtRule({ name: 'media', params: HOVER_MEDIA });
    media.append(rule.clone({ selectors: hover }));
    if (rest.length) {
      rule.selectors = rest;
      rule.after(media);
    } else {
      rule.replaceWith(media);
    }
  },
};

export default defineConfig(({ mode }) => ({
  // Relative base so the build works on any GitHub Pages sub-path.
  base: './',
  plugins: [svelte(), csp(loadEnv(mode, process.cwd(), 'VITE_')), preloadFonts()],
  css: { postcss: { plugins: [hoverOnlyWhereHoverable] } },
  build: {
    rollupOptions: {
      // Legal pages are plain static pages so they work without JavaScript.
      input: {
        main: 'index.html',
        impressum: 'impressum.html',
        datenschutz: 'datenschutz.html',
      },
    },
  },
}));
